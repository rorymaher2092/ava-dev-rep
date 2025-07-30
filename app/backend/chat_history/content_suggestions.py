# chat_history/content_suggestions.py
#
# The blueprint is still registered in app.py.
# POST  /api/content-suggestions         → writes <guid>.json into the blob container
# GET   /api/content-suggestions         → lists user’s own suggestions
# GET   /api/content-suggestions/admin   → lists *all* suggestions
#
# Env‑vars required:
#   AZURE_STORAGE_ACCOUNT   (re‑use the one you already set)
#   AZURE_SUGGESTED_CONTENT_CONTAINER   (optional; default "suggested_content")

import os
import json
import uuid
import time
from typing import Dict, Any, List, Optional

from quart import Blueprint, jsonify, request, current_app
from decorators import authenticated
from azure.storage.blob.aio import ContainerClient

from azure.identity.aio import (
    ManagedIdentityCredential,
    AzureDeveloperCliCredential,
)

# -------------------------------------------------------------------
#  Lazy blob‑container helper
# -------------------------------------------------------------------

class SuggestionBlobStore:
    _container: Optional[ContainerClient] = None

    async def _get_container(self) -> ContainerClient:
        if self._container:
            return self._container

        account   = os.getenv("AZURE_STORAGE_ACCOUNT")
        container = os.getenv("AZURE_SUGGESTED_CONTENT_CONTAINER", "suggested_content")
        if not account:
            raise RuntimeError("AZURE_STORAGE_ACCOUNT env‑var not set")

        credential = current_app.config.get("credential")
        if credential is None:
            credential = (
                ManagedIdentityCredential()
                if os.getenv("WEBSITE_HOSTNAME")
                else AzureDeveloperCliCredential(process_timeout=60)
            )

        url = f"https://{account}.blob.core.windows.net"
        client = ContainerClient(url, container, credential=credential)

        # Create container if it doesn’t exist
        try:
            await client.get_container_properties()
        except Exception:
            await client.create_container(public_access=None)

        self._container = client
        return client

    async def save(self, entra_oid: str, question: str, suggestion: str) -> str:
        """Save suggestion JSON and return blob name."""
        container = await self._get_container()
        blob_name = f"{uuid.uuid4()}.json"
        payload = {
            "id": blob_name[:-5],
            "entra_oid": entra_oid,
            "question": question,
            "suggestion": suggestion,
            "timestamp": int(time.time() * 1000),
            "status": "pending",
        }
        await container.upload_blob(
            name=blob_name,
            data=json.dumps(payload, ensure_ascii=False),
            overwrite=False,
            content_type="application/json",
        )
        return blob_name

    async def list_user(self, entra_oid: str) -> List[Dict[str, Any]]:
        container = await self._get_container()
        results: List[Dict[str, Any]] = []
        async for blob in container.list_blobs(name_starts_with=""):   # no prefix filter
            prop = blob.metadata or {}
            if prop.get("entra_oid") == entra_oid:
                # download content quickly (small files)
                data = await container.download_blob(blob.name)
                results.append(json.loads(await data.content_as_text()))
        # newest first
        return sorted(results, key=lambda x: x["timestamp"], reverse=True)

    async def list_all(self) -> List[Dict[str, Any]]:
        container = await self._get_container()
        items: List[Dict[str, Any]] = []
        async for blob in container.list_blobs():
            data = await container.download_blob(blob.name)
            items.append(json.loads(await data.content_as_text()))
        return sorted(items, key=lambda x: x["timestamp"], reverse=True)


store = SuggestionBlobStore()

# -------------------------------------------------------------------
#  Blueprint
# -------------------------------------------------------------------

content_suggestions_bp = Blueprint(
    "content_suggestions",
    __name__,
)


@content_suggestions_bp.post("/add-suggestion")
@authenticated
async def submit_suggestion(auth_claims: Dict[str, Any]):
    """Save suggestion to blob storage."""
    data = await request.get_json()
    question   = data.get("question", "").strip()
    suggestion = data.get("suggestion", "").strip()
    if not question or not suggestion:
        return jsonify({"error": "Both 'question' and 'suggestion' are required"}), 400

    entra_oid = auth_claims.get("oid")
    if not entra_oid:
        return jsonify({"error": "User OID missing"}), 401

    try:
        blob_name = await store.save(entra_oid, question, suggestion)
        return jsonify({"message": "Suggestion stored", "id": blob_name[:-5]}), 201
    except Exception as err:
        current_app.logger.exception("Failed to save content suggestion")
        return jsonify({"error": str(err)}), 500


@content_suggestions_bp.get("/")
@authenticated
async def list_user_suggestions(auth_claims: Dict[str, Any]):
    """Return current user’s suggestions."""
    entra_oid = auth_claims.get("oid")
    if not entra_oid:
        return jsonify({"error": "User OID missing"}), 401

    try:
        items = await store.list_user(entra_oid)
        return jsonify({"suggestions": items}), 200
    except Exception as err:
        current_app.logger.exception("List user suggestions failed")
        return jsonify({"error": str(err)}), 500
