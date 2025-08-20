import dataclasses
import io
import json
import logging
import mimetypes
import os
import time
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any, Union, cast

from azure.cognitiveservices.speech import (
    ResultReason,
    SpeechConfig,
    SpeechSynthesisOutputFormat,
    SpeechSynthesisResult,
    SpeechSynthesizer,
)
from azure.core.exceptions import ResourceNotFoundError
from azure.identity.aio import (
    AzureDeveloperCliCredential,
    ManagedIdentityCredential,
    get_bearer_token_provider,
)
from azure.monitor.opentelemetry import configure_azure_monitor
from azure.search.documents.agent.aio import KnowledgeAgentRetrievalClient
from azure.search.documents.aio import SearchClient
from azure.search.documents.indexes.aio import SearchIndexClient
from azure.storage.blob.aio import ContainerClient
from azure.storage.blob.aio import StorageStreamDownloader as BlobDownloader
from azure.storage.filedatalake.aio import FileSystemClient
from azure.storage.filedatalake.aio import StorageStreamDownloader as DatalakeDownloader
from openai import AsyncAzureOpenAI, AsyncOpenAI
from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.instrumentation.httpx import (
    HTTPXClientInstrumentor,
)
from opentelemetry.instrumentation.openai import OpenAIInstrumentor
from quart import (
    Blueprint,
    Quart,
    abort,
    current_app,
    jsonify,
    make_response,
    request,
    send_file,
    send_from_directory,
    session,
)
from quart_cors import cors
import redis
from quart_session import Session

from bot_profiles import BotProfile, BOTS, DEFAULT_BOT_ID
from approaches.approach import Approach
from approaches.chatreadretrieveread import ChatReadRetrieveReadApproach
from approaches.chatreadretrievereadvision import ChatReadRetrieveReadVisionApproach
from approaches.promptmanager import PromptyManager
from approaches.retrievethenread import RetrieveThenReadApproach
from approaches.retrievethenreadvision import RetrieveThenReadVisionApproach
from approaches.confluence_search import ConfluenceSearchService 
from attachments.attachment_api import attachment_bp
# In your main route file, make sure you have:
from attachments.attachment_helpers import prepare_chat_with_attachments
from chat_history.cosmosdb import chat_history_cosmosdb_bp
from config import (
    CONFIG_AGENT_CLIENT,
    CONFIG_AGENTIC_RETRIEVAL_ENABLED,
    CONFIG_ASK_APPROACH,
    CONFIG_ASK_VISION_APPROACH,
    CONFIG_AUTH_CLIENT,
    CONFIG_BLOB_CONTAINER_CLIENT,
    CONFIG_CHAT_APPROACH,
    CONFIG_CHAT_HISTORY_BROWSER_ENABLED,
    CONFIG_CHAT_HISTORY_COSMOS_ENABLED,
    CONFIG_CHAT_VISION_APPROACH,
    CONFIG_CREDENTIAL,
    CONFIG_DEFAULT_REASONING_EFFORT,
    CONFIG_GPT4V_DEPLOYED,
    CONFIG_INGESTER,
    CONFIG_LANGUAGE_PICKER_ENABLED,
    CONFIG_OPENAI_CLIENT,
    CONFIG_QUERY_REWRITING_ENABLED,
    CONFIG_REASONING_EFFORT_ENABLED,
    CONFIG_SEARCH_CLIENT,
    CONFIG_SEMANTIC_RANKER_DEPLOYED,
    CONFIG_SPEECH_INPUT_ENABLED,
    CONFIG_SPEECH_OUTPUT_AZURE_ENABLED,
    CONFIG_SPEECH_OUTPUT_BROWSER_ENABLED,
    CONFIG_SPEECH_SERVICE_ID,
    CONFIG_SPEECH_SERVICE_LOCATION,
    CONFIG_SPEECH_SERVICE_TOKEN,
    CONFIG_SPEECH_SERVICE_VOICE,
    CONFIG_STREAMING_ENABLED,
    CONFIG_USER_BLOB_CONTAINER_CLIENT,
    CONFIG_USER_UPLOAD_ENABLED,
    CONFIG_VECTOR_SEARCH_ENABLED,
)
from core.authentication import AuthenticationHelper
from core.sessionhelper import create_session_id
from decorators import authenticated, authenticated_path
from error import error_dict, error_response
from prepdocs import (
    clean_key_if_exists,
    setup_embeddings_service,
    setup_file_processors,
    setup_search_info,
)
from prepdocslib.filestrategy import UploadUserFileStrategy
from prepdocslib.listfilestrategy import File

from blob_session import QuartBlobSession

bp = Blueprint("routes", __name__, static_folder="static")
# Fix Windows registry issue with mimetypes
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")


@bp.route("/")
async def index():
    return await bp.send_static_file("index.html")


# Empty page is recommended for login redirect to work.
# See https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/initialization.md#redirecturi-considerations for more information
@bp.route("/redirect")
async def redirect():
    return ""


@bp.route("/favicon.ico")
async def favicon():
    return await bp.send_static_file("favicon.ico")


@bp.route("/assets/<path:path>")
async def assets(path):
    return await send_from_directory(Path(__file__).resolve().parent / "static" / "assets", path)


@bp.route("/content/<path>")
@authenticated_path
async def content_file(path: str, auth_claims: dict[str, Any]):
    """
    Serve content files from blob storage from within the app to keep the example self-contained.
    *** NOTE *** if you are using app services authentication, this route will return unauthorized to all users that are not logged in
    if AZURE_ENFORCE_ACCESS_CONTROL is not set or false, logged in users can access all files regardless of access control
    if AZURE_ENFORCE_ACCESS_CONTROL is set to true, logged in users can only access files they have access to
    This is also slow and memory hungry.
    """
    # Remove page number from path, filename-1.txt -> filename.txt
    # This shouldn't typically be necessary as browsers don't send hash fragments to servers
    if path.find("#page=") > 0:
        path_parts = path.rsplit("#page=", 1)
        path = path_parts[0]
    current_app.logger.info("Opening file %s", path)
    blob_container_client: ContainerClient = current_app.config[CONFIG_BLOB_CONTAINER_CLIENT]
    blob: Union[BlobDownloader, DatalakeDownloader]
    try:
        blob = await blob_container_client.get_blob_client(path).download_blob()
    except ResourceNotFoundError:
        current_app.logger.info("Path not found in general Blob container: %s", path)
        if current_app.config[CONFIG_USER_UPLOAD_ENABLED]:
            try:
                user_oid = auth_claims["oid"]
                user_blob_container_client = current_app.config[CONFIG_USER_BLOB_CONTAINER_CLIENT]
                user_directory_client: FileSystemClient = user_blob_container_client.get_directory_client(user_oid)
                file_client = user_directory_client.get_file_client(path)
                blob = await file_client.download_file()
            except ResourceNotFoundError:
                current_app.logger.exception("Path not found in DataLake: %s", path)
                abort(404)
        else:
            abort(404)
    if not blob.properties or not blob.properties.has_key("content_settings"):
        abort(404)
    mime_type = blob.properties["content_settings"]["content_type"]
    if mime_type == "application/octet-stream":
        mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    blob_file = io.BytesIO()
    await blob.readinto(blob_file)
    blob_file.seek(0)
    return await send_file(blob_file, mimetype=mime_type, as_attachment=False, attachment_filename=path)


@bp.route("/ask", methods=["POST"])
@authenticated
async def ask(auth_claims: dict[str, Any]):
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()
    context = request_json.get("context", {})
    context["auth_claims"] = auth_claims

    # Print out the full context, including overrides
    current_app.logger.info(f"Received context: {json.dumps(context, indent=2)}")

    # Extract the bot_id from the overrides in context (default to 'ava' if not present)
    bot_id = context.get("overrides", {}).get("bot_id", DEFAULT_BOT_ID)
    bot_profile = BOTS.get(bot_id, BOTS[DEFAULT_BOT_ID])  # Default to 'ava' if not found
    
    current_app.logger.info(f"Bot ID: {bot_id}, Bot Profile: {bot_profile.label}")

    try:
        use_gpt4v = context.get("overrides", {}).get("use_gpt4v", False)
        approach: Approach
        if use_gpt4v and CONFIG_ASK_VISION_APPROACH in current_app.config:
            approach = cast(Approach, current_app.config[CONFIG_ASK_VISION_APPROACH])
        else:
            approach = cast(Approach, current_app.config[CONFIG_ASK_APPROACH])
        r = await approach.run(
            request_json["messages"], context=context, session_state=request_json.get("session_state")
        )
        return jsonify(r)
    except Exception as error:
        return error_response(error, "/ask")


class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if dataclasses.is_dataclass(o) and not isinstance(o, type):
            return dataclasses.asdict(o)
        return super().default(o)


async def format_as_ndjson(r: AsyncGenerator[dict, None]) -> AsyncGenerator[str, None]:
    try:
        async for event in r:
            yield json.dumps(event, ensure_ascii=False, cls=JSONEncoder) + "\n"
    except Exception as error:
        logging.exception("Exception while generating response stream: %s", error)
        yield json.dumps(error_dict(error))


@bp.route("/chat", methods=["POST"])
@authenticated
async def chat(auth_claims: dict[str, Any]):
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    # Debug session info
    session_id = session.get('attachment_session_id')
    current_app.logger.info(f"🔍 DEBUG CHAT START:")
    current_app.logger.info(f"🔍 Session ID from session: {session_id}")

    context = request_json.get("context", {})
    context["auth_claims"] = auth_claims

    # Extract overrides BEFORE using it
    overrides = context.get("overrides", {})
    should_consume = overrides.get("consume_attachments", False)

    current_app.logger.info(f"🔍 Should consume attachments: {should_consume}")

    # Extract the bot_id from the overrides in context
    bot_id = overrides.get("bot_id", DEFAULT_BOT_ID)
    bot_profile = BOTS.get(bot_id, BOTS[DEFAULT_BOT_ID])
    
    current_app.logger.info(f"Bot ID: {bot_id}, Bot Profile: {bot_profile.label}")

    # IMPROVED LOGIC: Only process attachments if frontend signals we should
    if should_consume:
        current_app.logger.info("🔍 Frontend signaled consume_attachments=True, processing attachments...")
        
        # Check what's in session storage BEFORE calling prepare_chat_with_attachments
        if session_id:
            from attachments.attachment_api import get_session_attachments_for_chat
            raw_session_data = get_session_attachments_for_chat(session_id)
            current_app.logger.info(f"🔍 Raw session attachment data: {raw_session_data}")
            
            jira_count = len(raw_session_data.get("jira_tickets", []))
            confluence_count = len(raw_session_data.get("confluence_pages", []))
            current_app.logger.info(f"🔍 Session contains: {jira_count} Jira tickets, {confluence_count} Confluence pages")

        # Import and call the attachment helper with consume=True
        from attachments.attachment_helpers import prepare_chat_with_attachments
        attachment_data = prepare_chat_with_attachments(should_consume=True)  # This will clear them!
        
        current_app.logger.info(f"🔍 Attachment helper returned:")
        current_app.logger.info(f"🔍   - has_attachments: {attachment_data.get('has_attachments')}")
        current_app.logger.info(f"🔍   - attachment_count: {attachment_data.get('attachment_count', 0)}")
        current_app.logger.info(f"🔍   - sources length: {len(attachment_data.get('attachment_sources', []))}")
        
        # Debug each attachment source
        for i, source in enumerate(attachment_data.get('attachment_sources', [])):
            current_app.logger.info(f"🔍 Attachment source {i+1}: {source[:200]}...")
        
        # Add attachment data to context
        context["overrides"]["attachment_sources"] = attachment_data.get("attachment_sources", [])
        context["overrides"]["has_attachments"] = attachment_data.get("has_attachments", False)
        context["overrides"]["attachment_count"] = attachment_data.get("attachment_count", 0)
        
        current_app.logger.info(f"🔍 Added {len(attachment_data.get('attachment_sources', []))} attachment sources to context")
        
    else:
        current_app.logger.info("🔍 No consume_attachments flag, skipping attachment processing")
        # Ensure we have empty attachment data
        context["overrides"]["attachment_sources"] = []
        context["overrides"]["has_attachments"] = False
        context["overrides"]["attachment_count"] = 0

    # Log what we're actually passing to the approach
    current_app.logger.info(f"🔍 Final context overrides keys: {list(context['overrides'].keys())}")
    current_app.logger.info(f"🔍 Attachment sources being passed: {len(context['overrides']['attachment_sources'])} sources")

    try:
        use_gpt4v = context.get("overrides", {}).get("use_gpt4v", False)
        approach: Approach
        if use_gpt4v and CONFIG_CHAT_VISION_APPROACH in current_app.config:
            approach = cast(Approach, current_app.config[CONFIG_CHAT_VISION_APPROACH])
        else:
            approach = cast(Approach, current_app.config[CONFIG_CHAT_APPROACH])

        session_state = request_json.get("session_state")
        if session_state is None:
            session_state = create_session_id(
                current_app.config[CONFIG_CHAT_HISTORY_COSMOS_ENABLED],
                current_app.config[CONFIG_CHAT_HISTORY_BROWSER_ENABLED],
            )
        
        current_app.logger.info(f"🔍 About to call approach.run with context containing {len(context['overrides']['attachment_sources'])} attachment sources")
        
        result = await approach.run(
            request_json["messages"],
            context=context,
            session_state=session_state,
        )
        return jsonify(result)
    except Exception as error:
        current_app.logger.error(f"❌ Chat endpoint error: {str(error)}")
        return error_response(error, "/chat")


@bp.route("/chat/stream", methods=["POST"])
@authenticated
async def chat_stream(auth_claims: dict[str, Any]):
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()
    
    context = request_json.get("context", {})
    context["auth_claims"] = auth_claims

    # Extract overrides BEFORE using it
    overrides = context.get("overrides", {})
    should_consume = overrides.get("consume_attachments", False)

    current_app.logger.info(f"🔍 STREAM: Should consume attachments: {should_consume}")

    # IMPROVED LOGIC: Only process attachments if frontend signals we should
    if should_consume:
        current_app.logger.info("🔍 STREAM: Frontend signaled consume_attachments=True, processing attachments...")
        
        # Import and call the attachment helper with consume=True
        from attachments.attachment_helpers import prepare_chat_with_attachments
        attachment_data = prepare_chat_with_attachments(should_consume=True)  # This will clear them!
        
        current_app.logger.info(f"🔍 STREAM: Got {len(attachment_data.get('attachment_sources', []))} attachment sources")
        
        # Add attachment data to context
        context["overrides"]["attachment_sources"] = attachment_data.get("attachment_sources", [])
        context["overrides"]["has_attachments"] = attachment_data.get("has_attachments", False)
        context["overrides"]["attachment_count"] = attachment_data.get("attachment_count", 0)
        
    else:
        current_app.logger.info("🔍 STREAM: No consume_attachments flag, skipping attachment processing")
        # Ensure we have empty attachment data
        context["overrides"]["attachment_sources"] = []
        context["overrides"]["has_attachments"] = False
        context["overrides"]["attachment_count"] = 0

    try:
        use_gpt4v = context.get("overrides", {}).get("use_gpt4v", False)
        approach: Approach
        if use_gpt4v and CONFIG_CHAT_VISION_APPROACH in current_app.config:
            approach = cast(Approach, current_app.config[CONFIG_CHAT_VISION_APPROACH])
        else:
            approach = cast(Approach, current_app.config[CONFIG_CHAT_APPROACH])

        # If session state is provided, persists the session state,
        # else creates a new session_id depending on the chat history options enabled.
        session_state = request_json.get("session_state")
        if session_state is None:
            session_state = create_session_id(
                current_app.config[CONFIG_CHAT_HISTORY_COSMOS_ENABLED],
                current_app.config[CONFIG_CHAT_HISTORY_BROWSER_ENABLED],
            )
        result = await approach.run_stream(
            request_json["messages"],
            context=context,
            session_state=session_state,
        )
        response = await make_response(format_as_ndjson(result))
        response.timeout = None  # type: ignore
        response.mimetype = "application/json-lines"
        return response
    except Exception as error:
        return error_response(error, "/chat")


# Send MSAL.js settings to the client UI
@bp.route("/auth_setup", methods=["GET"])
def auth_setup():
    auth_helper = current_app.config[CONFIG_AUTH_CLIENT]
    return jsonify(auth_helper.get_auth_setup_for_client())


@bp.route("/config", methods=["GET"])
def config():
    return jsonify(
        {
            "showGPT4VOptions": current_app.config[CONFIG_GPT4V_DEPLOYED],
            "showSemanticRankerOption": current_app.config[CONFIG_SEMANTIC_RANKER_DEPLOYED],
            "showQueryRewritingOption": current_app.config[CONFIG_QUERY_REWRITING_ENABLED],
            "showReasoningEffortOption": current_app.config[CONFIG_REASONING_EFFORT_ENABLED],
            "streamingEnabled": current_app.config[CONFIG_STREAMING_ENABLED],
            "defaultReasoningEffort": current_app.config[CONFIG_DEFAULT_REASONING_EFFORT],
            "showVectorOption": current_app.config[CONFIG_VECTOR_SEARCH_ENABLED],
            "showUserUpload": current_app.config[CONFIG_USER_UPLOAD_ENABLED],
            "showLanguagePicker": current_app.config[CONFIG_LANGUAGE_PICKER_ENABLED],
            "showSpeechInput": current_app.config[CONFIG_SPEECH_INPUT_ENABLED],
            "showSpeechOutputBrowser": current_app.config[CONFIG_SPEECH_OUTPUT_BROWSER_ENABLED],
            "showSpeechOutputAzure": current_app.config[CONFIG_SPEECH_OUTPUT_AZURE_ENABLED],
            "showChatHistoryBrowser": current_app.config[CONFIG_CHAT_HISTORY_BROWSER_ENABLED],
            "showChatHistoryCosmos": current_app.config[CONFIG_CHAT_HISTORY_COSMOS_ENABLED],
            "showAgenticRetrievalOption": current_app.config[CONFIG_AGENTIC_RETRIEVAL_ENABLED],
        }
    )


@bp.route("/welcome", methods=["POST"])
@authenticated
async def welcome(auth_claims: dict[str, Any]):
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    request_json = await request.get_json()
    user_details = request_json.get("userDetails", {})
    
    # Add auth claims to user details
    user_details.update(auth_claims)
    
    # Extract additional user info from claims if available
    if "name" in auth_claims:
        user_details["name"] = auth_claims["name"]
    if "preferred_username" in auth_claims:
        user_details["username"] = auth_claims["preferred_username"]
    if "jobTitle" in auth_claims:
        user_details["title"] = auth_claims["jobTitle"]
    if "department" in auth_claims:
        user_details["department"] = auth_claims["department"]
        
    # Debug: Print auth claims and user details
    current_app.logger.info("DEBUG - Auth claims: %s", auth_claims)
    current_app.logger.info("DEBUG - User details: %s", user_details)
    
    # Import the function here to avoid circular imports
    from core.userhelper import get_welcome_message
    
    # Get custom welcome message
    welcome_message = get_welcome_message(user_details)
    
    # If no custom message, use default
    if not welcome_message:
        name = user_details.get("name", "there")
        welcome_message = f"Hello {name}!"
    
    return jsonify({"welcomeMessage": welcome_message})


@bp.route("/speech", methods=["POST"])
async def speech():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415

    speech_token = current_app.config.get(CONFIG_SPEECH_SERVICE_TOKEN)
    if speech_token is None or speech_token.expires_on < time.time() + 60:
        speech_token = await current_app.config[CONFIG_CREDENTIAL].get_token(
            "https://cognitiveservices.azure.com/.default"
        )
        current_app.config[CONFIG_SPEECH_SERVICE_TOKEN] = speech_token

    request_json = await request.get_json()
    text = request_json["text"]
    try:
        # Construct a token as described in documentation:
        # https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth?pivots=programming-language-python
        auth_token = (
            "aad#"
            + current_app.config[CONFIG_SPEECH_SERVICE_ID]
            + "#"
            + current_app.config[CONFIG_SPEECH_SERVICE_TOKEN].token
        )
        speech_config = SpeechConfig(auth_token=auth_token, region=current_app.config[CONFIG_SPEECH_SERVICE_LOCATION])
        speech_config.speech_synthesis_voice_name = current_app.config[CONFIG_SPEECH_SERVICE_VOICE]
        speech_config.speech_synthesis_output_format = SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        synthesizer = SpeechSynthesizer(speech_config=speech_config, audio_config=None)
        result: SpeechSynthesisResult = synthesizer.speak_text_async(text).get()
        if result.reason == ResultReason.SynthesizingAudioCompleted:
            return result.audio_data, 200, {"Content-Type": "audio/mp3"}
        elif result.reason == ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            current_app.logger.error(
                "Speech synthesis canceled: %s %s", cancellation_details.reason, cancellation_details.error_details
            )
            raise Exception("Speech synthesis canceled. Check logs for details.")
        else:
            current_app.logger.error("Unexpected result reason: %s", result.reason)
            raise Exception("Speech synthesis failed. Check logs for details.")
    except Exception as e:
        current_app.logger.exception("Exception in /speech")
        return jsonify({"error": str(e)}), 500


@bp.post("/upload")
@authenticated
async def upload(auth_claims: dict[str, Any]):
    request_files = await request.files
    if "file" not in request_files:
        # If no files were included in the request, return an error response
        return jsonify({"message": "No file part in the request", "status": "failed"}), 400

    user_oid = auth_claims["oid"]
    file = request_files.getlist("file")[0]
    user_blob_container_client: FileSystemClient = current_app.config[CONFIG_USER_BLOB_CONTAINER_CLIENT]
    user_directory_client = user_blob_container_client.get_directory_client(user_oid)
    try:
        await user_directory_client.get_directory_properties()
    except ResourceNotFoundError:
        current_app.logger.info("Creating directory for user %s", user_oid)
        await user_directory_client.create_directory()
    await user_directory_client.set_access_control(owner=user_oid)
    file_client = user_directory_client.get_file_client(file.filename)
    file_io = file
    file_io.name = file.filename
    file_io = io.BufferedReader(file_io)
    await file_client.upload_data(file_io, overwrite=True, metadata={"UploadedBy": user_oid})
    file_io.seek(0)
    ingester: UploadUserFileStrategy = current_app.config[CONFIG_INGESTER]
    await ingester.add_file(File(content=file_io, acls={"oids": [user_oid]}, url=file_client.url))
    return jsonify({"message": "File uploaded successfully"}), 200


@bp.post("/delete_uploaded")
@authenticated
async def delete_uploaded(auth_claims: dict[str, Any]):
    request_json = await request.get_json()
    filename = request_json.get("filename")
    user_oid = auth_claims["oid"]
    user_blob_container_client: FileSystemClient = current_app.config[CONFIG_USER_BLOB_CONTAINER_CLIENT]
    user_directory_client = user_blob_container_client.get_directory_client(user_oid)
    file_client = user_directory_client.get_file_client(filename)
    await file_client.delete_file()
    ingester = current_app.config[CONFIG_INGESTER]
    await ingester.remove_file(filename, user_oid)
    return jsonify({"message": f"File {filename} deleted successfully"}), 200


@bp.get("/list_uploaded")
@authenticated
async def list_uploaded(auth_claims: dict[str, Any]):
    user_oid = auth_claims["oid"]
    user_blob_container_client: FileSystemClient = current_app.config[CONFIG_USER_BLOB_CONTAINER_CLIENT]
    files = []
    try:
        all_paths = user_blob_container_client.get_paths(path=user_oid)
        async for path in all_paths:
            files.append(path.name.split("/", 1)[1])
    except ResourceNotFoundError as error:
        if error.status_code != 404:
            current_app.logger.exception("Error listing uploaded files", error)
    return jsonify(files), 200


@bp.route("/feedback", methods=["POST"])
@authenticated
async def submit_feedback(auth_claims: dict[str, Any]):
    """
    Endpoint to collect user feedback on responses.
    Stores feedback with user information for later analysis.
    """
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    
    request_json = await request.get_json()
    response_id = request_json.get("responseId")
    feedback_type = request_json.get("feedback")
    comments = request_json.get("comments", "")
    
    if not response_id or not feedback_type:
        return jsonify({"error": "responseId and feedback are required"}), 400
    
    if feedback_type not in ["positive", "negative"]:
        return jsonify({"error": "feedback must be either 'positive' or 'negative'"}), 400
    
    # Add user information from auth claims
    feedback_data = {
        "responseId": response_id,
        "feedback": feedback_type,
        "comments": comments,
        "timestamp": time.time(),
        "userId": auth_claims.get("oid", ""),
        "username": auth_claims.get("username", ""),
        "name": auth_claims.get("name", "")
    }
    
    # Log the feedback
    current_app.logger.info("Feedback received: %s", json.dumps(feedback_data))
    
    # Store feedback in Cosmos DB if Cosmos is enabled
    cosmos_enabled = os.getenv("USE_CHAT_HISTORY_COSMOS", "").lower() == "true"
    current_app.logger.info(f"Cosmos enabled: {cosmos_enabled}")
    
    if cosmos_enabled:
        try:
            current_app.logger.info("Attempting to store feedback in Cosmos DB")
            from chat_history.feedback import FeedbackCosmosDB
            feedback_db = FeedbackCosmosDB()
            await feedback_db.initialize()
            feedback_id = await feedback_db.add_feedback(feedback_data)
            await feedback_db.close()
            current_app.logger.info(f"Feedback stored in Cosmos DB with ID: {feedback_id}")
            return jsonify({"message": "Feedback submitted and stored successfully", "id": feedback_id}), 200
        except Exception as e:
            current_app.logger.error(f"Error storing feedback in Cosmos DB: {str(e)}")
            return jsonify({"message": "Feedback logged but not stored", "error": str(e)}), 200
    else:
        current_app.logger.info("Cosmos DB not enabled, feedback only logged")
    
    return jsonify({"message": "Feedback submitted successfully"}), 200




@bp.before_app_serving
async def setup_clients():
    # Replace these with your own values, either in environment variables or directly here
    AZURE_STORAGE_ACCOUNT = os.environ["AZURE_STORAGE_ACCOUNT"]
    AZURE_STORAGE_CONTAINER = os.environ["AZURE_STORAGE_CONTAINER"]
    AZURE_USERSTORAGE_ACCOUNT = os.environ.get("AZURE_USERSTORAGE_ACCOUNT")
    AZURE_USERSTORAGE_CONTAINER = os.environ.get("AZURE_USERSTORAGE_CONTAINER")
    AZURE_SEARCH_SERVICE = os.environ["AZURE_SEARCH_SERVICE"]
    AZURE_SEARCH_ENDPOINT = f"https://{AZURE_SEARCH_SERVICE}.search.windows.net"
    AZURE_SEARCH_INDEX = os.environ["AZURE_SEARCH_INDEX"]
    AZURE_SEARCH_AGENT = os.getenv("AZURE_SEARCH_AGENT", "")
    # Shared by all OpenAI deployments
    OPENAI_HOST = os.getenv("OPENAI_HOST", "azure")
    OPENAI_CHATGPT_MODEL = os.environ["AZURE_OPENAI_CHATGPT_MODEL"]
    AZURE_OPENAI_SEARCHAGENT_MODEL = os.getenv("AZURE_OPENAI_SEARCHAGENT_MODEL")
    AZURE_OPENAI_SEARCHAGENT_DEPLOYMENT = os.getenv("AZURE_OPENAI_SEARCHAGENT_DEPLOYMENT")
    OPENAI_EMB_MODEL = os.getenv("AZURE_OPENAI_EMB_MODEL_NAME", "text-embedding-ada-002")
    OPENAI_EMB_DIMENSIONS = int(os.getenv("AZURE_OPENAI_EMB_DIMENSIONS") or 1536)
    OPENAI_REASONING_EFFORT = os.getenv("AZURE_OPENAI_REASONING_EFFORT")
    # Used with Azure OpenAI deployments
    AZURE_OPENAI_SERVICE = os.getenv("AZURE_OPENAI_SERVICE")
    AZURE_OPENAI_GPT4V_DEPLOYMENT = os.environ.get("AZURE_OPENAI_GPT4V_DEPLOYMENT")
    AZURE_OPENAI_GPT4V_MODEL = os.environ.get("AZURE_OPENAI_GPT4V_MODEL")
    AZURE_OPENAI_CHATGPT_DEPLOYMENT = (
        os.getenv("AZURE_OPENAI_CHATGPT_DEPLOYMENT") if OPENAI_HOST.startswith("azure") else None
    )
    AZURE_OPENAI_EMB_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMB_DEPLOYMENT") if OPENAI_HOST.startswith("azure") else None
    AZURE_OPENAI_CUSTOM_URL = os.getenv("AZURE_OPENAI_CUSTOM_URL")
    # https://learn.microsoft.com/azure/ai-services/openai/api-version-deprecation#latest-ga-api-release
    AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION") or "2024-10-21"
    AZURE_VISION_ENDPOINT = os.getenv("AZURE_VISION_ENDPOINT", "")
    # Used only with non-Azure OpenAI deployments
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_ORGANIZATION = os.getenv("OPENAI_ORGANIZATION")

    AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID")
    AZURE_USE_AUTHENTICATION = os.getenv("AZURE_USE_AUTHENTICATION", "").lower() == "true"
    AZURE_ENFORCE_ACCESS_CONTROL = os.getenv("AZURE_ENFORCE_ACCESS_CONTROL", "").lower() == "true"
    AZURE_ENABLE_GLOBAL_DOCUMENT_ACCESS = os.getenv("AZURE_ENABLE_GLOBAL_DOCUMENT_ACCESS", "").lower() == "true"
    AZURE_ENABLE_UNAUTHENTICATED_ACCESS = os.getenv("AZURE_ENABLE_UNAUTHENTICATED_ACCESS", "").lower() == "true"
    AZURE_SERVER_APP_ID = os.getenv("AZURE_SERVER_APP_ID")
    AZURE_SERVER_APP_SECRET = os.getenv("AZURE_SERVER_APP_SECRET")
    AZURE_CLIENT_APP_ID = os.getenv("AZURE_CLIENT_APP_ID")
    AZURE_AUTH_TENANT_ID = os.getenv("AZURE_AUTH_TENANT_ID", AZURE_TENANT_ID)

    KB_FIELDS_CONTENT = os.getenv("KB_FIELDS_CONTENT", "content")
    KB_FIELDS_SOURCEPAGE = os.getenv("KB_FIELDS_SOURCEPAGE", "sourcepage")

    AZURE_SEARCH_QUERY_LANGUAGE = os.getenv("AZURE_SEARCH_QUERY_LANGUAGE") or "en-us"
    AZURE_SEARCH_QUERY_SPELLER = os.getenv("AZURE_SEARCH_QUERY_SPELLER") or "lexicon"
    AZURE_SEARCH_SEMANTIC_RANKER = os.getenv("AZURE_SEARCH_SEMANTIC_RANKER", "free").lower()
    AZURE_SEARCH_QUERY_REWRITING = os.getenv("AZURE_SEARCH_QUERY_REWRITING", "false").lower()
    # This defaults to the previous field name "embedding", for backwards compatibility
    AZURE_SEARCH_FIELD_NAME_EMBEDDING = os.getenv("AZURE_SEARCH_FIELD_NAME_EMBEDDING", "embedding")

    AZURE_SPEECH_SERVICE_ID = os.getenv("AZURE_SPEECH_SERVICE_ID")
    AZURE_SPEECH_SERVICE_LOCATION = os.getenv("AZURE_SPEECH_SERVICE_LOCATION")
    AZURE_SPEECH_SERVICE_VOICE = os.getenv("AZURE_SPEECH_SERVICE_VOICE") or "en-US-AndrewMultilingualNeural"

    USE_GPT4V = os.getenv("USE_GPT4V", "").lower() == "true"
    USE_USER_UPLOAD = os.getenv("USE_USER_UPLOAD", "").lower() == "true"
    ENABLE_LANGUAGE_PICKER = os.getenv("ENABLE_LANGUAGE_PICKER", "").lower() == "true"
    USE_SPEECH_INPUT_BROWSER = os.getenv("USE_SPEECH_INPUT_BROWSER", "").lower() == "true"
    USE_SPEECH_OUTPUT_BROWSER = os.getenv("USE_SPEECH_OUTPUT_BROWSER", "").lower() == "true"
    USE_SPEECH_OUTPUT_AZURE = os.getenv("USE_SPEECH_OUTPUT_AZURE", "").lower() == "true"
    USE_CHAT_HISTORY_BROWSER = os.getenv("USE_CHAT_HISTORY_BROWSER", "").lower() == "true"
    USE_CHAT_HISTORY_COSMOS = os.getenv("USE_CHAT_HISTORY_COSMOS", "").lower() == "true"
    USE_AGENTIC_RETRIEVAL = os.getenv("USE_AGENTIC_RETRIEVAL", "").lower() == "true"

    # WEBSITE_HOSTNAME is always set by App Service, RUNNING_IN_PRODUCTION is set in main.bicep
    RUNNING_ON_AZURE = os.getenv("WEBSITE_HOSTNAME") is not None or os.getenv("RUNNING_IN_PRODUCTION") is not None

    CONFLUENCE_TOKEN = os.environ.get("CONFLUENCE_TOKEN", "")
    CONFLUENCE_EMAIL = os.environ.get("CONFLUENCE_EMAIL", "")



    # Use the current user identity for keyless authentication to Azure services.
    azure_credential: Union[AzureDeveloperCliCredential, ManagedIdentityCredential]
    if RUNNING_ON_AZURE:
        current_app.logger.info("Setting up Azure credential using ManagedIdentityCredential")
        if AZURE_CLIENT_ID := os.getenv("AZURE_CLIENT_ID"):
            current_app.logger.info(
                "Setting up Azure credential using ManagedIdentityCredential with client_id %s", AZURE_CLIENT_ID
            )
            azure_credential = ManagedIdentityCredential(client_id=AZURE_CLIENT_ID)
        else:
            current_app.logger.info("Setting up Azure credential using ManagedIdentityCredential")
            azure_credential = ManagedIdentityCredential()
    elif AZURE_TENANT_ID:
        current_app.logger.info(
            "Setting up Azure credential using AzureDeveloperCliCredential with tenant_id %s", AZURE_TENANT_ID
        )
        azure_credential = AzureDeveloperCliCredential(tenant_id=AZURE_TENANT_ID, process_timeout=60)
    else:
        current_app.logger.info("Setting up Azure credential using AzureDeveloperCliCredential for home tenant")
        azure_credential = AzureDeveloperCliCredential(process_timeout=60)

    # Set the Azure credential in the app config for use in other parts of the app
    current_app.config[CONFIG_CREDENTIAL] = azure_credential

    current_app.config["AZURE_STORAGE_ACCOUNT"] = AZURE_STORAGE_ACCOUNT
    current_app.config["AZURE_CREDENTIAL"] = azure_credential

    # Import bot profiles and get all required search indexes
    try:
        from bot_profiles import get_all_search_indexes
        # Get all search indexes needed by bots
        required_indexes = get_all_search_indexes()
    except ImportError as e:
        current_app.logger.warning(f"Could not import bot profiles: {e}. Using default index only.")
        required_indexes = set()
    
    # Always include the default index
    all_indexes = {AZURE_SEARCH_INDEX}  # Default index
    all_indexes.update(required_indexes)  # Add bot-specific indexes

    current_app.logger.info(f"Creating search clients for indexes: {list(all_indexes)}")

    # Create search clients for all required indexes
    search_clients = {}
    for index_name in all_indexes:
        try:
            current_app.logger.info(f"Creating search client for index: {index_name}")
            search_client = SearchClient(
                endpoint=AZURE_SEARCH_ENDPOINT,
                index_name=index_name,
                credential=azure_credential,
            )
            search_clients[index_name] = search_client
            current_app.logger.info(f"✅ Successfully created search client for index: {index_name}")
        except Exception as e:
            current_app.logger.error(f"❌ Failed to create search client for index {index_name}: {e}")
            if index_name == AZURE_SEARCH_INDEX:  # Default index is critical
                raise Exception(f"Failed to create search client for default index {index_name}: {e}")
            else:
                current_app.logger.warning(f"Continuing without index {index_name}")

    # Store the default search client for backwards compatibility
    default_search_client = search_clients[AZURE_SEARCH_INDEX]

    agent_client = KnowledgeAgentRetrievalClient(
        endpoint=AZURE_SEARCH_ENDPOINT, agent_name=AZURE_SEARCH_AGENT, credential=azure_credential
    )

    blob_container_client = ContainerClient(
        f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net", AZURE_STORAGE_CONTAINER, credential=azure_credential
    )

    # Set up authentication helper
    search_index = None
    if AZURE_USE_AUTHENTICATION:
        current_app.logger.info("AZURE_USE_AUTHENTICATION is true, setting up search index client")
        search_index_client = SearchIndexClient(
            endpoint=AZURE_SEARCH_ENDPOINT,
            credential=azure_credential,
        )
        search_index = await search_index_client.get_index(AZURE_SEARCH_INDEX)
        await search_index_client.close()
    auth_helper = AuthenticationHelper(
        search_index=search_index,
        use_authentication=AZURE_USE_AUTHENTICATION,
        server_app_id=AZURE_SERVER_APP_ID,
        server_app_secret=AZURE_SERVER_APP_SECRET,
        client_app_id=AZURE_CLIENT_APP_ID,
        tenant_id=AZURE_AUTH_TENANT_ID,
        require_access_control=AZURE_ENFORCE_ACCESS_CONTROL,
        enable_global_documents=AZURE_ENABLE_GLOBAL_DOCUMENT_ACCESS,
        enable_unauthenticated_access=AZURE_ENABLE_UNAUTHENTICATED_ACCESS,
    )

    if USE_USER_UPLOAD:
        current_app.logger.info("USE_USER_UPLOAD is true, setting up user upload feature")
        if not AZURE_USERSTORAGE_ACCOUNT or not AZURE_USERSTORAGE_CONTAINER:
            raise ValueError(
                "AZURE_USERSTORAGE_ACCOUNT and AZURE_USERSTORAGE_CONTAINER must be set when USE_USER_UPLOAD is true"
            )
        user_blob_container_client = FileSystemClient(
            f"https://{AZURE_USERSTORAGE_ACCOUNT}.dfs.core.windows.net",
            AZURE_USERSTORAGE_CONTAINER,
            credential=azure_credential,
        )
        current_app.config[CONFIG_USER_BLOB_CONTAINER_CLIENT] = user_blob_container_client

        # Set up ingester
        file_processors = setup_file_processors(
            azure_credential=azure_credential,
            document_intelligence_service=os.getenv("AZURE_DOCUMENTINTELLIGENCE_SERVICE"),
            local_pdf_parser=os.getenv("USE_LOCAL_PDF_PARSER", "").lower() == "true",
            local_html_parser=os.getenv("USE_LOCAL_HTML_PARSER", "").lower() == "true",
            search_images=USE_GPT4V,
        )
        search_info = await setup_search_info(
            search_service=AZURE_SEARCH_SERVICE, index_name=AZURE_SEARCH_INDEX, azure_credential=azure_credential
        )
        text_embeddings_service = setup_embeddings_service(
            azure_credential=azure_credential,
            openai_host=OPENAI_HOST,
            openai_model_name=OPENAI_EMB_MODEL,
            openai_service=AZURE_OPENAI_SERVICE,
            openai_custom_url=AZURE_OPENAI_CUSTOM_URL,
            openai_deployment=AZURE_OPENAI_EMB_DEPLOYMENT,
            openai_dimensions=OPENAI_EMB_DIMENSIONS,
            openai_api_version=AZURE_OPENAI_API_VERSION,
            openai_key=clean_key_if_exists(OPENAI_API_KEY),
            openai_org=OPENAI_ORGANIZATION,
            disable_vectors=os.getenv("USE_VECTORS", "").lower() == "false",
        )
        ingester = UploadUserFileStrategy(
            search_info=search_info,
            embeddings=text_embeddings_service,
            file_processors=file_processors,
            search_field_name_embedding=AZURE_SEARCH_FIELD_NAME_EMBEDDING,
        )
        current_app.config[CONFIG_INGESTER] = ingester

    if USE_SPEECH_OUTPUT_AZURE:
        current_app.logger.info("USE_SPEECH_OUTPUT_AZURE is true, setting up Azure speech service")
        if not AZURE_SPEECH_SERVICE_ID or AZURE_SPEECH_SERVICE_ID == "":
            raise ValueError("Azure speech resource not configured correctly, missing AZURE_SPEECH_SERVICE_ID")
        if not AZURE_SPEECH_SERVICE_LOCATION or AZURE_SPEECH_SERVICE_LOCATION == "":
            raise ValueError("Azure speech resource not configured correctly, missing AZURE_SPEECH_SERVICE_LOCATION")
        current_app.config[CONFIG_SPEECH_SERVICE_ID] = AZURE_SPEECH_SERVICE_ID
        current_app.config[CONFIG_SPEECH_SERVICE_LOCATION] = AZURE_SPEECH_SERVICE_LOCATION
        current_app.config[CONFIG_SPEECH_SERVICE_VOICE] = AZURE_SPEECH_SERVICE_VOICE
        current_app.config[CONFIG_SPEECH_SERVICE_TOKEN] = None

    # ===== CREATE MULTIPLE OPENAI CLIENTS FOR DIFFERENT API VERSIONS =====
    standard_openai_client = None
    reasoning_openai_client = None

    REASONING_API_VERSION = "2025-01-01-preview"
    
    if OPENAI_HOST.startswith("azure"):
        if OPENAI_HOST == "azure_custom":
            current_app.logger.info("OPENAI_HOST is azure_custom, setting up Azure OpenAI custom clients")
            if not AZURE_OPENAI_CUSTOM_URL:
                raise ValueError("AZURE_OPENAI_CUSTOM_URL must be set when OPENAI_HOST is azure_custom")
            endpoint = AZURE_OPENAI_CUSTOM_URL
        else:
            current_app.logger.info("OPENAI_HOST is azure, setting up Azure OpenAI clients")
            if not AZURE_OPENAI_SERVICE:
                raise ValueError("AZURE_OPENAI_SERVICE must be set when OPENAI_HOST is azure")
            endpoint = f"https://{AZURE_OPENAI_SERVICE}.openai.azure.com"
        
        if api_key := os.getenv("AZURE_OPENAI_API_KEY_OVERRIDE"):
            current_app.logger.info("AZURE_OPENAI_API_KEY_OVERRIDE found, creating API key-based clients")
            
            # Create standard client
            try:
                standard_openai_client = AsyncAzureOpenAI(
                    api_version=AZURE_OPENAI_API_VERSION,
                    azure_endpoint=endpoint,
                    api_key=api_key
                )
                current_app.logger.info(f"✅ Created standard OpenAI client (API version: {AZURE_OPENAI_API_VERSION})")
            except Exception as e:
                current_app.logger.error(f"❌ Failed to create standard OpenAI client: {e}")
                raise
            
            # Create reasoning client (for o3-mini)
            try:
                reasoning_openai_client = AsyncAzureOpenAI(
                    api_version=REASONING_API_VERSION,
                    azure_endpoint=endpoint,
                    api_key=api_key
                )
                current_app.logger.info(f"✅ Created reasoning OpenAI client (API version: {REASONING_API_VERSION})")
            except Exception as e:
                current_app.logger.warning(f"⚠️ Failed to create reasoning OpenAI client: {e}")
                current_app.logger.warning("Reasoning models (o3-mini) will not be available")
                # Don't fail completely, just use standard client as fallback
                reasoning_openai_client = standard_openai_client
                
        else:
            current_app.logger.info("Using Azure credential for Azure OpenAI clients")
            token_provider = get_bearer_token_provider(azure_credential, "https://cognitiveservices.azure.com/.default")
            
            # Create standard client
            try:
                standard_openai_client = AsyncAzureOpenAI(
                    api_version=AZURE_OPENAI_API_VERSION,
                    azure_endpoint=endpoint,
                    azure_ad_token_provider=token_provider,
                )
                current_app.logger.info(f"✅ Created standard OpenAI client (API version: {AZURE_OPENAI_API_VERSION})")
            except Exception as e:
                current_app.logger.error(f"❌ Failed to create standard OpenAI client: {e}")
                raise
            
            # Create reasoning client (for o3-mini)
            try:
                reasoning_openai_client = AsyncAzureOpenAI(
                    api_version=REASONING_API_VERSION,
                    azure_endpoint=endpoint,
                    azure_ad_token_provider=token_provider,
                )
                current_app.logger.info(f"✅ Created reasoning OpenAI client (API version: {REASONING_API_VERSION})")
            except Exception as e:
                current_app.logger.warning(f"⚠️ Failed to create reasoning OpenAI client: {e}")
                current_app.logger.warning("Reasoning models (o3-mini) will not be available")
                # Don't fail completely, just use standard client as fallback
                reasoning_openai_client = standard_openai_client
    
    elif OPENAI_HOST == "local":
        current_app.logger.info("OPENAI_HOST is local, setting up local OpenAI clients")
        try:
            # For local, use the same client for both
            client = AsyncOpenAI(
                base_url=os.environ["OPENAI_BASE_URL"],
                api_key="no-key-required",
            )
            standard_openai_client = client
            reasoning_openai_client = client
            current_app.logger.info("✅ Created local OpenAI client (used for both standard and reasoning)")
        except Exception as e:
            current_app.logger.error(f"Failed to create local OpenAI client: {e}")
            raise
            
    else:
        current_app.logger.info("Setting up standard OpenAI clients")
        try:
            # For standard OpenAI, use the same client for both
            client = AsyncOpenAI(
                api_key=OPENAI_API_KEY,
                organization=OPENAI_ORGANIZATION,
            )
            standard_openai_client = client
            reasoning_openai_client = client
            current_app.logger.info("✅ Created OpenAI client (used for both standard and reasoning)")
        except Exception as e:
            current_app.logger.error(f"Failed to create OpenAI client: {e}")
            raise

    # Store clients in app config
    current_app.config[CONFIG_OPENAI_CLIENT] = standard_openai_client  # Default client for backwards compatibility
    current_app.config["STANDARD_OPENAI_CLIENT"] = standard_openai_client
    current_app.config["REASONING_OPENAI_CLIENT"] = reasoning_openai_client
    current_app.config[CONFIG_SEARCH_CLIENT] = default_search_client  # CRITICAL: This was missing!
    current_app.config[CONFIG_AGENT_CLIENT] = agent_client
    current_app.config[CONFIG_BLOB_CONTAINER_CLIENT] = blob_container_client
    current_app.config[CONFIG_AUTH_CLIENT] = auth_helper

    current_app.config[CONFIG_GPT4V_DEPLOYED] = bool(USE_GPT4V)
    current_app.config[CONFIG_SEMANTIC_RANKER_DEPLOYED] = AZURE_SEARCH_SEMANTIC_RANKER != "disabled"
    current_app.config[CONFIG_QUERY_REWRITING_ENABLED] = (
        AZURE_SEARCH_QUERY_REWRITING == "true" and AZURE_SEARCH_SEMANTIC_RANKER != "disabled"
    )
    current_app.config[CONFIG_DEFAULT_REASONING_EFFORT] = OPENAI_REASONING_EFFORT
    current_app.config[CONFIG_REASONING_EFFORT_ENABLED] = OPENAI_CHATGPT_MODEL in Approach.GPT_REASONING_MODELS
    current_app.config[CONFIG_STREAMING_ENABLED] = (
        bool(USE_GPT4V)
        or OPENAI_CHATGPT_MODEL not in Approach.GPT_REASONING_MODELS
        or Approach.GPT_REASONING_MODELS[OPENAI_CHATGPT_MODEL].streaming
    )
    current_app.config[CONFIG_VECTOR_SEARCH_ENABLED] = os.getenv("USE_VECTORS", "").lower() != "false"
    current_app.config[CONFIG_USER_UPLOAD_ENABLED] = bool(USE_USER_UPLOAD)
    current_app.config[CONFIG_LANGUAGE_PICKER_ENABLED] = ENABLE_LANGUAGE_PICKER
    current_app.config[CONFIG_SPEECH_INPUT_ENABLED] = USE_SPEECH_INPUT_BROWSER
    current_app.config[CONFIG_SPEECH_OUTPUT_BROWSER_ENABLED] = USE_SPEECH_OUTPUT_BROWSER
    current_app.config[CONFIG_SPEECH_OUTPUT_AZURE_ENABLED] = USE_SPEECH_OUTPUT_AZURE
    current_app.config[CONFIG_CHAT_HISTORY_BROWSER_ENABLED] = USE_CHAT_HISTORY_BROWSER
    current_app.config[CONFIG_CHAT_HISTORY_COSMOS_ENABLED] = USE_CHAT_HISTORY_COSMOS
    current_app.config[CONFIG_AGENTIC_RETRIEVAL_ENABLED] = USE_AGENTIC_RETRIEVAL

    prompt_manager = PromptyManager()

    # Create the service with the configuration values
    confluence_service = ConfluenceSearchService(openai_client=standard_openai_client)
    current_app.config["CONFLUENCE_SEARCH_SERVICE"] = confluence_service

    # Set up the two default RAG approaches for /ask and /chat
    current_app.config[CONFIG_ASK_APPROACH] = RetrieveThenReadApproach(
        search_client=default_search_client,
        search_index_name=AZURE_SEARCH_INDEX,
        agent_model=AZURE_OPENAI_SEARCHAGENT_MODEL,
        agent_deployment=AZURE_OPENAI_SEARCHAGENT_DEPLOYMENT,
        agent_client=agent_client,  # FIXED: Added missing agent_client
        openai_client=standard_openai_client,  # FIXED: Added missing openai_client
        auth_helper=auth_helper,
        chatgpt_model=OPENAI_CHATGPT_MODEL,
        chatgpt_deployment=AZURE_OPENAI_CHATGPT_DEPLOYMENT,
        embedding_model=OPENAI_EMB_MODEL,
        embedding_deployment=AZURE_OPENAI_EMB_DEPLOYMENT,
        embedding_dimensions=OPENAI_EMB_DIMENSIONS,
        embedding_field=AZURE_SEARCH_FIELD_NAME_EMBEDDING,
        sourcepage_field=KB_FIELDS_SOURCEPAGE,
        content_field=KB_FIELDS_CONTENT,
        query_language=AZURE_SEARCH_QUERY_LANGUAGE,
        query_speller=AZURE_SEARCH_QUERY_SPELLER,
        prompt_manager=prompt_manager,
        reasoning_effort=OPENAI_REASONING_EFFORT,
    )

    # ChatReadRetrieveReadApproach with multi-client support
    current_app.config[CONFIG_CHAT_APPROACH] = ChatReadRetrieveReadApproach(
        search_client=default_search_client,
        search_index_name=AZURE_SEARCH_INDEX,
        search_clients=search_clients,  # All search clients
        default_search_index=AZURE_SEARCH_INDEX,
        agent_model=AZURE_OPENAI_SEARCHAGENT_MODEL,
        agent_deployment=AZURE_OPENAI_SEARCHAGENT_DEPLOYMENT,
        agent_client=agent_client,
        auth_helper=auth_helper,
        # OpenAI clients - pass both clients
        openai_client=standard_openai_client,  # Standard client (for backwards compatibility)
        standard_openai_client=standard_openai_client,  # Standard client
        reasoning_openai_client=reasoning_openai_client,  # Reasoning client
        chatgpt_model=OPENAI_CHATGPT_MODEL,
        chatgpt_deployment=AZURE_OPENAI_CHATGPT_DEPLOYMENT,
        embedding_model=OPENAI_EMB_MODEL,
        embedding_deployment=AZURE_OPENAI_EMB_DEPLOYMENT,
        embedding_dimensions=OPENAI_EMB_DIMENSIONS,
        embedding_field=AZURE_SEARCH_FIELD_NAME_EMBEDDING,
        sourcepage_field=KB_FIELDS_SOURCEPAGE,
        content_field=KB_FIELDS_CONTENT,
        query_language=AZURE_SEARCH_QUERY_LANGUAGE,
        query_speller=AZURE_SEARCH_QUERY_SPELLER,
        prompt_manager=prompt_manager,
        reasoning_effort=OPENAI_REASONING_EFFORT,
        confluence_token=CONFLUENCE_TOKEN,
        confluence_email=CONFLUENCE_EMAIL,
    )

    if USE_GPT4V:
        current_app.logger.info("USE_GPT4V is true, setting up GPT4V approach")
        if not AZURE_OPENAI_GPT4V_MODEL:
            raise ValueError("AZURE_OPENAI_GPT4V_MODEL must be set when USE_GPT4V is true")
        if any(
            model in Approach.GPT_REASONING_MODELS
            for model in [
                OPENAI_CHATGPT_MODEL,
                AZURE_OPENAI_GPT4V_MODEL,
                AZURE_OPENAI_CHATGPT_DEPLOYMENT,
                AZURE_OPENAI_GPT4V_DEPLOYMENT,
            ]
        ):
            raise ValueError(
                "AZURE_OPENAI_CHATGPT_MODEL and AZURE_OPENAI_GPT4V_MODEL must not be a reasoning model when USE_GPT4V is true"
            )

        token_provider = get_bearer_token_provider(azure_credential, "https://cognitiveservices.azure.com/.default")

        current_app.config[CONFIG_ASK_VISION_APPROACH] = RetrieveThenReadVisionApproach(
            search_client=default_search_client,
            openai_client=standard_openai_client,  # Use standard client for vision
            blob_container_client=blob_container_client,
            auth_helper=auth_helper,
            vision_endpoint=AZURE_VISION_ENDPOINT,
            vision_token_provider=token_provider,
            gpt4v_deployment=AZURE_OPENAI_GPT4V_DEPLOYMENT,
            gpt4v_model=AZURE_OPENAI_GPT4V_MODEL,
            embedding_model=OPENAI_EMB_MODEL,
            embedding_deployment=AZURE_OPENAI_EMB_DEPLOYMENT,
            embedding_dimensions=OPENAI_EMB_DIMENSIONS,
            embedding_field=AZURE_SEARCH_FIELD_NAME_EMBEDDING,
            sourcepage_field=KB_FIELDS_SOURCEPAGE,
            content_field=KB_FIELDS_CONTENT,
            query_language=AZURE_SEARCH_QUERY_LANGUAGE,
            query_speller=AZURE_SEARCH_QUERY_SPELLER,
            prompt_manager=prompt_manager,
        )
        current_app.config[CONFIG_CHAT_VISION_APPROACH] = ChatReadRetrieveReadVisionApproach(
            search_client=default_search_client,
            openai_client=standard_openai_client,  # Add this missing parameter
            blob_container_client=blob_container_client,
            auth_helper=auth_helper,
            vision_endpoint=AZURE_VISION_ENDPOINT,
            vision_token_provider=token_provider,
            chatgpt_model=OPENAI_CHATGPT_MODEL,
            chatgpt_deployment=AZURE_OPENAI_CHATGPT_DEPLOYMENT,
            gpt4v_deployment=AZURE_OPENAI_GPT4V_DEPLOYMENT,
            gpt4v_model=AZURE_OPENAI_GPT4V_MODEL,
            embedding_model=OPENAI_EMB_MODEL,
            embedding_deployment=AZURE_OPENAI_EMB_DEPLOYMENT,
            embedding_dimensions=OPENAI_EMB_DIMENSIONS,
            embedding_field=AZURE_SEARCH_FIELD_NAME_EMBEDDING,
            sourcepage_field=KB_FIELDS_SOURCEPAGE,
            content_field=KB_FIELDS_CONTENT,
            query_language=AZURE_SEARCH_QUERY_LANGUAGE,
            query_speller=AZURE_SEARCH_QUERY_SPELLER,
            prompt_manager=prompt_manager,
        )

@bp.after_app_serving
async def close_clients():
    current_app.logger.info("Closing all clients...")
    
    # Close all search clients
    chat_approach = current_app.config.get(CONFIG_CHAT_APPROACH)
    if chat_approach and hasattr(chat_approach, 'search_clients'):
        for index_name, search_client in chat_approach.search_clients.items():
            current_app.logger.info(f"Closing search client for index: {index_name}")
            await search_client.close()
    
    # Close default search client
    default_search_client = current_app.config.get(CONFIG_SEARCH_CLIENT)
    if default_search_client:
        current_app.logger.info("Closing default search client")
        await default_search_client.close()
    
    # Close standard OpenAI client
    standard_client = current_app.config.get("STANDARD_OPENAI_CLIENT")
    if standard_client:
        current_app.logger.info("Closing standard OpenAI client")
        await standard_client.aclose()
    
    # Close reasoning OpenAI client (only if it's different from standard)
    reasoning_client = current_app.config.get("REASONING_OPENAI_CLIENT")
    if reasoning_client and reasoning_client is not standard_client:
        current_app.logger.info("Closing reasoning OpenAI client")
        await reasoning_client.aclose()
    
    # Close default OpenAI client (for backwards compatibility)
    default_openai_client = current_app.config.get(CONFIG_OPENAI_CLIENT)
    if default_openai_client and default_openai_client is not standard_client:
        current_app.logger.info("Closing default OpenAI client")
        await default_openai_client.aclose()
        
    # Close blob clients
    blob_client = current_app.config.get(CONFIG_BLOB_CONTAINER_CLIENT)
    if blob_client:
        current_app.logger.info("Closing blob container client")
        await blob_client.close()
        
    user_blob_client = current_app.config.get(CONFIG_USER_BLOB_CONTAINER_CLIENT)
    if user_blob_client:
        current_app.logger.info("Closing user blob container client")
        await user_blob_client.close()
    
    current_app.logger.info("All clients closed successfully")


def create_app():
    app = Quart(__name__)
    
    # Basic app configuration
    app.config['SECRET_KEY'] = 'vocus-ava-attachments-fixed-key-2025'
    
    # Configure Blob Storage sessions (no Redis needed!)
    # This uses your existing Azure Storage account
    app.config['SESSION_COOKIE_NAME'] = 'vocus_session'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SECURE'] = True  # Set False for local dev
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 hours
    app.config['SESSION_CONTAINER_NAME'] = 'ava-sessions'  # Container for sessions
    
    # Initialize Blob session storage
    QuartBlobSession(app)

    app.register_blueprint(bp)
    app.register_blueprint(chat_history_cosmosdb_bp)
    
    # Register feedback blueprint
    from chat_history.feedback_api import feedback_bp
    app.register_blueprint(feedback_bp)

    app.register_blueprint(attachment_bp)


    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        app.logger.info("APPLICATIONINSIGHTS_CONNECTION_STRING is set, enabling Azure Monitor")
        configure_azure_monitor()
        # This tracks HTTP requests made by aiohttp:
        AioHttpClientInstrumentor().instrument()
        # This tracks HTTP requests made by httpx:
        HTTPXClientInstrumentor().instrument()
        # This tracks OpenAI SDK requests:
        OpenAIInstrumentor().instrument()
        # This middleware tracks app route requests:
        app.asgi_app = OpenTelemetryMiddleware(app.asgi_app)  # type: ignore[assignment]

    # Log levels should be one of https://docs.python.org/3/library/logging.html#logging-levels
    # Set root level to WARNING to avoid seeing overly verbose logs from SDKS
    logging.basicConfig(level=logging.WARNING)
    # Set our own logger levels to INFO by default
    app_level = os.getenv("APP_LOG_LEVEL", "INFO")
    app.logger.setLevel(os.getenv("APP_LOG_LEVEL", app_level))
    logging.getLogger("scripts").setLevel(app_level)

    if allowed_origin := os.getenv("ALLOWED_ORIGIN"):
        allowed_origins = allowed_origin.split(";")
        if len(allowed_origins) > 0:
            app.logger.info("CORS enabled for %s", allowed_origins)
            cors(app, allow_origin=allowed_origins, allow_methods=["GET", "POST"])

    return app
