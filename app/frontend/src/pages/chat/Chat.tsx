import { useRef, useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Panel, DefaultButton } from "@fluentui/react";
import readNDJSONStream from "ndjson-readablestream";
import { MicrosoftSignIn } from "../../MicrosoftSignIn"; // Add this with other imports

import appLogo from "../../assets/ava.svg";
import confluencelogo from "../../assets/confluence-logo.png";
import defendersheild from "../../assets/defender-sheild.png";
import styles from "./Chat.module.css";

import {
    chatApi,
    configApi,
    RetrievalMode,
    ChatAppResponse,
    ChatAppResponseOrError,
    ChatAppRequest,
    ResponseMessage,
    VectorFields,
    GPT4VInput,
    SpeechConfig
} from "../../api";
import { Answer, AnswerError, AnswerLoading } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { ExampleList } from "../../components/Example";
import { UserChatMessage } from "../../components/UserChatMessage";
import { AnalysisPanel, AnalysisPanelTabs } from "../../components/AnalysisPanel";
import { HistoryPanel } from "../../components/HistoryPanel";
import { HistoryProviderOptions, useHistoryManager } from "../../components/HistoryProviders";
import { HistoryButton } from "../../components/HistoryButton";
import { CanvasPanel } from "../../components/CanvasPanel";
import { setCanvasOpenCallback } from "../../utils/storyMapRenderer";
// import { SettingsButton } from "../../components/SettingsButton";
import { ClearChatButton } from "../../components/ClearChatButton";
import { UploadFile } from "../../components/UploadFile";

import {
    useLogin,
    getToken,
    requireAccessControl,
    getUsername,
    getTokenClaims,
    getGraphToken,
    isMicrosoftAuthenticated,
    loginToMicrosoft,
    clearAllMsalCache
} from "../../authConfig";
import { useMsal } from "@azure/msal-react";
import { TokenClaimsDisplay } from "../../components/TokenClaimsDisplay";
import { LoginContext } from "../../loginContext";
import { LanguagePicker } from "../../i18n/LanguagePicker";
import { Settings } from "../../components/Settings/Settings";

// Import the Bot Selector
import BotSelector from "../../components/BotSelectorButton/BotSelector"; // adjust path
import { BOTS, DEFAULT_BOT_ID, BotProfile } from "../../config/botConfig";
import { useBot } from "../../contexts/BotContext"; // ✅ ADD
import { useBotTheme } from "../../hooks/useBotTheme";
import { BotContentFactory } from "../../components/BotContent/BotContentFactory";

// Import BaArtififactContext
import { useArtifact } from "../../contexts/ArtifactContext";

// submitContent Suggestions
import { submitContentSuggestion } from "../../api";

import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../../authConfig";
import { AttachmentRef } from "../../components/Attachments/AttachmentMenu";

const Chat = () => {
    const [searchParams] = useSearchParams();
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(searchParams.get("history") === "true");
    const [promptTemplate, setPromptTemplate] = useState<string>("");
    const [temperature, setTemperature] = useState<number>(0.3);
    const [seed, setSeed] = useState<number | null>(null);
    const [minimumRerankerScore, setMinimumRerankerScore] = useState<number>(0);
    const [minimumSearchScore, setMinimumSearchScore] = useState<number>(0);
    const [retrieveCount, setRetrieveCount] = useState<number>(3);
    const [maxSubqueryCount, setMaxSubqueryCount] = useState<number>(10);
    const [resultsMergeStrategy, setResultsMergeStrategy] = useState<string>("interleaved");
    const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>(RetrievalMode.Hybrid);
    const [useSemanticRanker, setUseSemanticRanker] = useState<boolean>(true);
    const [useQueryRewriting, setUseQueryRewriting] = useState<boolean>(false);
    const [reasoningEffort, setReasoningEffort] = useState<string>("");
    const [streamingEnabled, setStreamingEnabled] = useState<boolean>(true);
    const [shouldStream, setShouldStream] = useState<boolean>(true);
    const [useSemanticCaptions, setUseSemanticCaptions] = useState<boolean>(false);
    const [includeCategory, setIncludeCategory] = useState<string>("");
    const [excludeCategory, setExcludeCategory] = useState<string>("");
    const [useSuggestFollowupQuestions, setUseSuggestFollowupQuestions] = useState<boolean>(true);
    const [vectorFields, setVectorFields] = useState<VectorFields>(VectorFields.TextAndImageEmbeddings);
    const [useOidSecurityFilter, setUseOidSecurityFilter] = useState<boolean>(false);
    const [useGroupsSecurityFilter, setUseGroupsSecurityFilter] = useState<boolean>(false);
    const [gpt4vInput, setGPT4VInput] = useState<GPT4VInput>(GPT4VInput.TextAndImages);
    const [useGPT4V, setUseGPT4V] = useState<boolean>(false);
    const [currentFollowupQuestions, setCurrentFollowupQuestions] = useState<string[]>([]);

    const lastQuestionRef = useRef<string>("");
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [error, setError] = useState<unknown>();

    // Type definition for conversation tuples
    type AnswerTuple = [user: string, response: ChatAppResponse, attachmentRefs?: AttachmentRef[]];

    const [activeCitation, setActiveCitation] = useState<string>();
    const [activeAnalysisPanelTab, setActiveAnalysisPanelTab] = useState<AnalysisPanelTabs | undefined>(undefined);

    const [selectedAnswer, setSelectedAnswer] = useState<number>(0);
    const [answers, setAnswers] = useState<AnswerTuple[]>([]);
    const [streamedAnswers, setStreamedAnswers] = useState<AnswerTuple[]>([]);
    const [currentAttachments, setCurrentAttachments] = useState<AttachmentRef[]>([]);
    const [speechUrls, setSpeechUrls] = useState<(string | null)[]>([]);

    const [showGPT4VOptions, setShowGPT4VOptions] = useState<boolean>(false);
    const [showSemanticRankerOption, setShowSemanticRankerOption] = useState<boolean>(false);
    const [showQueryRewritingOption, setShowQueryRewritingOption] = useState<boolean>(false);
    const [showReasoningEffortOption, setShowReasoningEffortOption] = useState<boolean>(false);
    const [showVectorOption, setShowVectorOption] = useState<boolean>(false);
    const [showUserUpload, setShowUserUpload] = useState<boolean>(false);
    const [showLanguagePicker, setshowLanguagePicker] = useState<boolean>(false);
    const [showSpeechInput, setShowSpeechInput] = useState<boolean>(true);
    const [showSpeechOutputBrowser, setShowSpeechOutputBrowser] = useState<boolean>(false);
    const [showSpeechOutputAzure, setShowSpeechOutputAzure] = useState<boolean>(false);
    const [showChatHistoryBrowser, setShowChatHistoryBrowser] = useState<boolean>(false);
    const [showChatHistoryCosmos, setShowChatHistoryCosmos] = useState<boolean>(false);
    const [showAgenticRetrievalOption, setShowAgenticRetrievalOption] = useState<boolean>(false);
    const [useAgenticRetrieval, setUseAgenticRetrieval] = useState<boolean>(false);

    // Canvas panel state
    const [isCanvasPanelOpen, setIsCanvasPanelOpen] = useState<boolean>(false);
    const [canvasContent, setCanvasContent] = useState<string>("");
    const [canvasTitle, setCanvasTitle] = useState<string>("Canvas");

    // added to deal with cancelling mid request
    const [abortController, setAbortController] = useState<AbortController | null>(null);

    // --- Attachments typed union for backend ---
    type Attachment =
        | { kind: "jira_ticket"; key: string }
        | { kind: "confluence_page"; url: string; title?: string }
        | { kind: "file"; name: string; size: number; mime?: string };

    // These match what QuestionInput emits (keep minimal)
    type UITicket = { key: string };
    type UIConfluence = { url: string; title?: string };

    // Merge UI args into a single attachments[] payload
    function toAttachments(tickets?: UITicket[], confluence?: UIConfluence[], files?: File[]): Attachment[] {
        const out: Attachment[] = [];
        (tickets ?? []).forEach(t => t?.key && out.push({ kind: "jira_ticket", key: t.key }));
        (confluence ?? []).forEach(p => p?.url && out.push({ kind: "confluence_page", url: p.url, title: p.title }));
        (files ?? []).forEach(f => out.push({ kind: "file", name: f.name, size: f.size, mime: f.type }));
        return out;
    }

    // Add artifact context
    const { selectedArtifactType, getSelectedArtifact } = useArtifact();

    const audio = useRef(new Audio()).current;
    const [isPlaying, setIsPlaying] = useState(false);

    /* ─── Bot selection ─────────────────────────────────────────── */
    const { botId, setBotId } = useBot();
    console.log("Current botId:", botId); // Log the botId
    const botProfile: BotProfile = BOTS[botId] ?? BOTS[DEFAULT_BOT_ID];

    useBotTheme(botId);

    const { t, i18n } = useTranslation();

    const speechConfig: SpeechConfig = {
        speechUrls,
        setSpeechUrls,
        audio,
        isPlaying,
        setIsPlaying
    };

    const getConfig = async () => {
        configApi().then(config => {
            setShowGPT4VOptions(config.showGPT4VOptions);
            if (config.showGPT4VOptions) {
                setUseGPT4V(true);
            }
            setUseSemanticRanker(config.showSemanticRankerOption);
            setShowSemanticRankerOption(config.showSemanticRankerOption);
            setUseQueryRewriting(config.showQueryRewritingOption);
            setShowQueryRewritingOption(config.showQueryRewritingOption);
            setShowReasoningEffortOption(config.showReasoningEffortOption);
            setStreamingEnabled(config.streamingEnabled);
            if (!config.streamingEnabled) {
                setShouldStream(false);
            }
            if (config.showReasoningEffortOption) {
                setReasoningEffort(config.defaultReasoningEffort);
            }
            setShowVectorOption(config.showVectorOption);
            if (!config.showVectorOption) {
                setRetrievalMode(RetrievalMode.Text);
            }
            setShowUserUpload(config.showUserUpload);
            setshowLanguagePicker(config.showLanguagePicker);
            setShowSpeechInput(config.showSpeechInput);
            setShowSpeechOutputBrowser(config.showSpeechOutputBrowser);
            setShowSpeechOutputAzure(config.showSpeechOutputAzure);
            setShowChatHistoryBrowser(config.showChatHistoryBrowser);
            setShowChatHistoryCosmos(config.showChatHistoryCosmos);
            setShowAgenticRetrievalOption(config.showAgenticRetrievalOption);
            setUseAgenticRetrieval(config.showAgenticRetrievalOption);
            if (config.showAgenticRetrievalOption) {
                setRetrieveCount(10);
            }
        });
    };

    const handleAsyncRequest = async (question: string, answers: AnswerTuple[], responseBody: ReadableStream<any>, signal?: AbortSignal) => {
        let answer = "";
        let askResponse = {} as ChatAppResponse;
        let seededRow = false;

        // --- typewriter knobs ---
        const STEP_CHARS = 6; // characters to reveal per animation frame (2–10 feels nice)
        let queue = ""; // not-yet-rendered chars buffered from the network
        let rafId: number | null = null;

        const renderLatest = () => {
            const role = askResponse?.message?.role ?? "assistant";
            const latest: ChatAppResponse = { ...askResponse, message: { content: answer, role } };

            setStreamedAnswers(prev => {
                if (!seededRow) {
                    seededRow = true;
                    return [...answers, [question, latest]];
                }
                if (prev.length === 0) return [[question, latest]];
                const next = prev.slice();
                next[next.length - 1] = [question, latest];
                return next;
            });
        };

        const tick = () => {
            // Check for cancellation first
            if (signal?.aborted) {
                rafId = null;
                return;
            }

            // animate only when visible; background continues buffering
            if (document.visibilityState !== "visible") {
                rafId = null;
                return;
            }

            if (queue.length > 0) {
                const take = Math.min(STEP_CHARS, queue.length);
                answer += queue.slice(0, take);
                queue = queue.slice(take);
                renderLatest();
            }

            // keep animating while there’s more to show
            if (queue.length > 0) {
                rafId = requestAnimationFrame(tick);
            } else {
                rafId = null;
            }
        };

        const startAnimationIfNeeded = () => {
            if (rafId == null && document.visibilityState === "visible" && queue.length > 0) {
                rafId = requestAnimationFrame(tick);
            }
        };

        const onVisibility = () => {
            if (document.visibilityState === "visible") {
                // when the user comes back, animate the queued text
                startAnimationIfNeeded();
            } else if (rafId) {
                // stop animating in the background (network still fills `queue`)
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        };

        document.addEventListener("visibilitychange", onVisibility);

        setIsStreaming(true);
        try {
            for await (const event of readNDJSONStream(responseBody)) {
                // Check for cancellation
                if (signal?.aborted) {
                    break;
                }

                if (event.context?.data_points) {
                    event.message = event.delta;
                    askResponse = event as ChatAppResponse;
                } else if (event.delta?.content) {
                    setIsLoading(false);
                    // accumulate raw chunk from server
                    queue += event.delta.content;
                    // animate it (if visible); otherwise it sits buffered
                    startAnimationIfNeeded();
                } else if (event.context) {
                    askResponse.context = { ...askResponse.context, ...event.context };
                } else if (event.error) {
                    throw Error(event.error);
                }
            }
        } catch (error: any) {
            if (error.name === "AbortError") {
                console.log("Stream was cancelled");
            } else {
                throw error;
            }
        } finally {
            // drain any remaining buffer (finish fast, no animation)
            if (queue.length) {
                answer += queue;
                queue = "";
                renderLatest();
            }
            if (rafId) cancelAnimationFrame(rafId);
            document.removeEventListener("visibilitychange", onVisibility);
            setIsStreaming(false);
        }

        const fullResponse: ChatAppResponse = {
            ...askResponse,
            message: { content: answer, role: askResponse?.message?.role ?? "assistant" }
        };
        return fullResponse;
    };

    const client = useLogin ? useMsal().instance : undefined;
    const { loggedIn } = useContext(LoginContext);
    const [userName, setUserName] = useState<string>("there");
    const [welcomeMessage, setWelcomeMessage] = useState<string>(`Hello ${userName}!`);

    const historyProvider: HistoryProviderOptions = (() => {
        if (useLogin && showChatHistoryCosmos) return HistoryProviderOptions.CosmosDB;
        if (showChatHistoryBrowser) return HistoryProviderOptions.IndexedDB;
        return HistoryProviderOptions.None;
    })();
    const historyManager = useHistoryManager(historyProvider);

    // In Chat.tsx, add this useEffect
    useEffect(() => {
        const setupTokenRefresh = async () => {
            const isAuthenticated = await isMicrosoftAuthenticated();
            if (!isAuthenticated) return;

            const tokenRefreshInterval = setInterval(
                async () => {
                    try {
                        console.log("Proactive token refresh check");
                        await getGraphToken(true);
                    } catch (error) {
                        console.error("Proactive token refresh failed:", error);
                        await clearAllMsalCache(); // Clear cache if background refresh fails
                    }
                },
                10 * 60 * 1000
            );

            return () => clearInterval(tokenRefreshInterval);
        };

        setupTokenRefresh();
    }, []);

    const makeApiRequest = async (question: string, attachmentRefs?: AttachmentRef[]) => {
        // Store current attachments for loading/error states
        setCurrentAttachments(attachmentRefs || []);

        // Extra code to deal with cancelled requests
        if (abortController) {
            abortController.abort();
        }
        const controller = new AbortController();
        setAbortController(controller);

        lastQuestionRef.current = question;
        console.log("Sending API request with botId:", botId);

        // Log attachment references if any
        if (attachmentRefs && attachmentRefs.length > 0) {
            console.log("Including attachment references:", attachmentRefs);
        }

        setCurrentFollowupQuestions([]);
        error && setError(undefined);
        setIsLoading(true);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);

        try {
            // ✅ Auth validation with immediate re-auth on failure
            let authToken;
            let graphToken;

            try {
                authToken = await getToken();
                graphToken = await getGraphToken();

                if (!authToken || !graphToken) {
                    throw new Error("No auth token available");
                }
            } catch (authError) {
                console.error("Auth failed:", authError);

                // Force immediate re-authentication for any auth error
                const confirmLogin = window.confirm("Your session has expired. Please sign in again to continue.");

                if (!confirmLogin) {
                    setError(new Error("Authentication required to continue"));
                    setIsLoading(false);
                    return;
                }

                try {
                    // Clear everything and force fresh login
                    await clearAllMsalCache();
                    await loginToMicrosoft();

                    // Get fresh tokens after login
                    authToken = await getToken();
                    graphToken = await getGraphToken();

                    if (!authToken || !graphToken) {
                        throw new Error("Failed to obtain token after re-authentication");
                    }
                } catch (loginError) {
                    console.error("Re-authentication failed:", loginError);
                    setError(new Error("Failed to authenticate. Please refresh the page and try again."));
                    setIsLoading(false);
                    return;
                }
            }
            // Get artifact information for BA bot
            let artifactContext = {};
            if (botId === "ba") {
                const selectedArtifact = getSelectedArtifact();
                artifactContext = {
                    artifact_type: selectedArtifactType,
                    artifact_instructions: selectedArtifact.customInstructions,
                    artifact_prompt_hint: selectedArtifact.promptHint
                };
            } else {
                artifactContext = {
                    artifact_type: null,
                    artifact_instructions: null,
                    artifact_prompt_hint: null
                };
            }

            const messages: ResponseMessage[] = answers.flatMap(a => [
                { content: a[0], role: "user" },
                { content: a[1].message.content, role: "assistant" }
            ]);

            const request: ChatAppRequest = {
                messages: [...messages, { content: question, role: "user" }],
                context: {
                    overrides: {
                        prompt_template: promptTemplate.length === 0 ? undefined : promptTemplate,
                        include_category: includeCategory.length === 0 ? undefined : includeCategory,
                        exclude_category: excludeCategory.length === 0 ? undefined : excludeCategory,
                        top: retrieveCount,
                        max_subqueries: maxSubqueryCount,
                        results_merge_strategy: resultsMergeStrategy,
                        temperature: temperature,
                        minimum_reranker_score: minimumRerankerScore,
                        minimum_search_score: minimumSearchScore,
                        retrieval_mode: retrievalMode,
                        semantic_ranker: useSemanticRanker,
                        semantic_captions: useSemanticCaptions,
                        query_rewriting: useQueryRewriting,
                        reasoning_effort: reasoningEffort,
                        suggest_followup_questions: useSuggestFollowupQuestions,
                        use_oid_security_filter: useOidSecurityFilter,
                        use_groups_security_filter: useGroupsSecurityFilter,
                        vector_fields: vectorFields,
                        use_gpt4v: useGPT4V,
                        gpt4v_input: gpt4vInput,
                        language: i18n.language,
                        use_agentic_retrieval: useAgenticRetrieval,
                        bot_id: botId,
                        graph_token: graphToken,
                        artifact_type: selectedArtifactType,
                        // Include attachment IDs for UUID-based fetching
                        attachment_ids: attachmentRefs ? attachmentRefs.map(ref => ref.id).filter((id): id is string => Boolean(id)) : [],
                        // Also include legacy attachment_refs for backward compatibility
                        attachment_refs: attachmentRefs ? attachmentRefs.filter(ref => ref.type !== "document") : [],
                        // CRITICAL: Tell backend to consume attachments if any exist
                        consume_attachments: (attachmentRefs && attachmentRefs.length > 0) || false,
                        ...(seed !== null ? { seed: seed } : {})
                    }
                },
                session_state: answers.length ? answers[answers.length - 1][1].session_state : null
            };

            console.log("📡 Making API call...");
            console.log("📡 Making API call...");
            const response = await chatApi(request, shouldStream, authToken);

            if (!response.body) {
                throw Error("No response body");
            }
            if (response.status > 299 || !response.ok) {
                throw Error(`Request failed with status ${response.status}`);
            }

            console.log("✅ API call successful, processing response...");

            // STEP 3: Handle the response

            console.log("✅ API call successful, processing response...");

            // STEP 3: Handle the response
            if (shouldStream) {
                const parsedResponse: ChatAppResponse = await handleAsyncRequest(question, answers, response.body, abortController?.signal);
                setAnswers([...answers, [question, parsedResponse, attachmentRefs]]);

                if (useSuggestFollowupQuestions) {
                    setCurrentFollowupQuestions(parsedResponse.context?.followup_questions || []);
                }

                if (typeof parsedResponse.session_state === "string" && parsedResponse.session_state !== "") {
                    const authToken = await getToken();
                    // Convert to old format for history manager compatibility
                    const historyData = [...answers, [question, parsedResponse, attachmentRefs]].map(
                        answer => [answer[0], answer[1]] as [string, ChatAppResponse]
                    );

                    // Add bot context for history saving
                    const historyContext = {
                        bot_id: botId,
                        artifact_label: botId === "ba" ? getSelectedArtifact().label : undefined
                    };

                    historyManager.addItem(parsedResponse.session_state, historyData, authToken, historyContext);
                }
            } else {
                const parsedResponse: ChatAppResponseOrError = await response.json();
                if (parsedResponse.error) {
                    throw Error(parsedResponse.error);
                }
                setAnswers([...answers, [question, parsedResponse as ChatAppResponse, attachmentRefs]]);

                if (useSuggestFollowupQuestions) {
                    setCurrentFollowupQuestions((parsedResponse as ChatAppResponse).context?.followup_questions || []);
                }

                if (typeof parsedResponse.session_state === "string" && parsedResponse.session_state !== "") {
                    const authToken = await getToken();
                    // Convert to old format for history manager compatibility
                    const historyData = [...answers, [question, parsedResponse as ChatAppResponse, attachmentRefs]].map(
                        answer => [answer[0], answer[1]] as [string, ChatAppResponse]
                    );

                    // Add bot context for history saving
                    const historyContext = {
                        bot_id: botId,
                        artifact_label: botId === "ba" ? getSelectedArtifact().label : undefined
                    };

                    historyManager.addItem(parsedResponse.session_state, historyData, authToken, historyContext);
                }
            }

            setSpeechUrls([...speechUrls, null]);
        } catch (e: any) {
            // Check if error is due to cancellation
            if (e.name === "AbortError") {
                console.log("Request was cancelled");
                // Don't set error state for cancelled requests
            } else {
                setError(e);
            }
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setAbortController(null);
            setCurrentAttachments([]);
        }
    };

    // Add cancel function
    const cancelGeneration = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            setIsLoading(false);
            setIsStreaming(false);
            setError(undefined);
        }
    };

    const sendProgrammaticMessage = (message: string) => {
        // Get current attachments (likely empty for programmatic messages)
        makeApiRequest(message);
    };

    const clearChat = () => {
        lastQuestionRef.current = "";
        error && setError(undefined);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);
        setAnswers([]);
        setSpeechUrls([]);
        setStreamedAnswers([]);
        setCurrentFollowupQuestions([]);
        setIsLoading(false);
        setIsStreaming(false);
        setCurrentAttachments([]);
    };

    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" }), [isLoading]);
    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "auto" }), [streamedAnswers]);
    useEffect(() => {
        getConfig();

        // Set up canvas callback
        setCanvasOpenCallback((htmlContent: string) => {
            // Extract title from HTML comment or use default
            const titleMatch = htmlContent.match(/<!--\s*title:\s*([^-]+)\s*-->/);
            const extractedTitle = titleMatch ? titleMatch[1].trim() : "Canvas";

            setCanvasContent(htmlContent);
            setCanvasTitle(extractedTitle);
            setIsCanvasPanelOpen(true);
        });

        // Check URL parameters for actions
        if (searchParams.get("clear") === "true") {
            clearChat();
        }
    }, [searchParams]);

    // Listen for focus events to refresh user details
    useEffect(() => {
        const handleFocus = async () => {
            if (client && loggedIn) {
                try {
                    const name = await getUsername();
                    if (name) {
                        const firstName = name.split(" ")[0];
                        if (firstName !== userName) {
                            setUserName(firstName);

                            const { getUserWelcomeMessage } = await import("../../api");
                            const token = await getToken();
                            const claims = (await getTokenClaims()) || {};

                            const userDetails = {
                                name: firstName,
                                username: claims.preferred_username || claims.upn || claims.email
                            };

                            const message = await getUserWelcomeMessage(userDetails);
                            setWelcomeMessage(message);
                        }
                    }
                } catch (error) {
                    console.error("Error refreshing user details on focus:", error);
                }
            }
        };

        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [client, loggedIn, userName]);

    // Get the user's name and welcome message when logged in
    useEffect(() => {
        const fetchUserDetails = async () => {
            if (client && loggedIn) {
                try {
                    // Force refresh of user details
                    const name = await getUsername();
                    if (name) {
                        // Extract first name if possible
                        const firstName = name.split(" ")[0];
                        setUserName(firstName);

                        // Import the getUserWelcomeMessage function
                        const { getUserWelcomeMessage } = await import("../../api");

                        // Get fresh token claims
                        const token = await getToken();
                        const claims = (await getTokenClaims()) || {};

                        // Prepare user details with available information
                        const userDetails = {
                            name: firstName,
                            username: claims.preferred_username || claims.upn || claims.email
                        };

                        console.log("Fetching welcome message for:", userDetails);

                        // Fetch custom welcome message
                        const message = await getUserWelcomeMessage(userDetails);
                        setWelcomeMessage(message);
                    } else {
                        // Fallback if no name found
                        setUserName("there");
                        setWelcomeMessage("Hello there!");
                    }
                } catch (error) {
                    console.error("Error fetching user details:", error);
                    // Fallback on error
                    setUserName("there");
                    setWelcomeMessage("Hello there!");
                }
            } else {
                // Clear cache and try to get user from app services
                try {
                    globalThis.cachedAppServicesToken = null;
                    await fetch("/.auth/refresh", { method: "POST" });
                    const name = await getUsername();
                    if (name) {
                        const firstName = name.split(" ")[0];
                        setUserName(firstName);
                        setWelcomeMessage(`Hello ${firstName}!`);
                        return;
                    }
                } catch (error) {
                    console.log("Could not get username:", error);
                }
                // Final fallback
                setUserName("there");
                setWelcomeMessage("Hello there!");
            }
        };

        // Fetch immediately and set up interval for periodic refresh
        fetchUserDetails();

        // Refresh user details every 5 minutes to handle token expiry
        const interval = setInterval(fetchUserDetails, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [client, loggedIn]);

    // Listen for custom events and window resize
    useEffect(() => {
        const handleOpenChatHistory = () => {
            setIsHistoryPanelOpen(true);
        };

        const handleClearChat = () => {
            clearChat();
        };

        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);

            // Close panels on mobile when resizing to mobile
            if (window.innerWidth <= 768) {
                if (activeAnalysisPanelTab) {
                    setActiveAnalysisPanelTab(undefined);
                }
                if (isHistoryPanelOpen) {
                    setIsHistoryPanelOpen(false);
                }
            }
        };

        window.addEventListener("openChatHistory", handleOpenChatHistory);
        window.addEventListener("clearChat", handleClearChat);
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("openChatHistory", handleOpenChatHistory);
            window.removeEventListener("clearChat", handleClearChat);
            window.removeEventListener("resize", handleResize);
        };
    }, [activeAnalysisPanelTab, isHistoryPanelOpen]);

    const handleSettingsChange = (field: string, value: any) => {
        switch (field) {
            case "promptTemplate":
                setPromptTemplate(value);
                break;
            case "temperature":
                setTemperature(value);
                break;
            case "seed":
                setSeed(value);
                break;
            case "minimumRerankerScore":
                setMinimumRerankerScore(value);
                break;
            case "minimumSearchScore":
                setMinimumSearchScore(value);
                break;
            case "retrieveCount":
                setRetrieveCount(value);
                break;
            case "maxSubqueryCount":
                setMaxSubqueryCount(value);
                break;
            case "resultsMergeStrategy":
                setResultsMergeStrategy(value);
                break;
            case "useSemanticRanker":
                setUseSemanticRanker(value);
                break;
            case "useQueryRewriting":
                setUseQueryRewriting(value);
                break;
            case "reasoningEffort":
                setReasoningEffort(value);
                break;
            case "useSemanticCaptions":
                setUseSemanticCaptions(value);
                break;
            case "excludeCategory":
                setExcludeCategory(value);
                break;
            case "includeCategory":
                setIncludeCategory(value);
                break;
            case "useOidSecurityFilter":
                setUseOidSecurityFilter(value);
                break;
            case "useGroupsSecurityFilter":
                setUseGroupsSecurityFilter(value);
                break;
            case "shouldStream":
                setShouldStream(value);
                break;
            case "useSuggestFollowupQuestions":
                setUseSuggestFollowupQuestions(value);
                break;
            case "useGPT4V":
                setUseGPT4V(value);
                break;
            case "gpt4vInput":
                setGPT4VInput(value);
                break;
            case "vectorFields":
                setVectorFields(value);
                break;
            case "retrievalMode":
                setRetrievalMode(value);
                break;
            case "useAgenticRetrieval":
                setUseAgenticRetrieval(value);
        }
    };

    const onExampleClicked = (example: string) => {
        makeApiRequest(example);
    };

    const onShowCitation = (citation: string, index: number) => {
        if (activeCitation === citation && activeAnalysisPanelTab === AnalysisPanelTabs.CitationTab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveCitation(citation);
            setActiveAnalysisPanelTab(AnalysisPanelTabs.CitationTab);
        }

        setSelectedAnswer(index);
    };

    const onToggleTab = (tab: AnalysisPanelTabs, index: number) => {
        if (activeAnalysisPanelTab === tab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveAnalysisPanelTab(tab);
        }

        setSelectedAnswer(index);
    };

    // Add this handler function in the Chat component
    const handleContentSuggestion = async (suggestion: string, questionAsked: string) => {
        try {
            // Use the same token acquisition logic as makeApiRequest
            const authToken = await getGraphToken();

            // Submit the suggestion using the graph token (or auth token as fallback)
            await submitContentSuggestion(questionAsked, suggestion, authToken);
        } catch (error) {
            console.error("Error submitting content suggestion:", error);
            throw error; // Re-throw to let Answer component handle the error
        }
    };

    return (
        <div className={styles.container}>
            {/* Setting the page title using react-helmet-async */}
            <Helmet>
                <title>{t("pageTitle")}</title>
            </Helmet>
            {/* Removed command buttons as they're now in the header menu */}
            <div className={styles.commandsSplitContainer}>
                <div className={styles.commandsContainer}>{showUserUpload && <UploadFile className={styles.commandButton} disabled={!loggedIn} />}</div>
            </div>
            <div
                className={styles.chatRoot}
                style={{
                    marginRight: activeAnalysisPanelTab && !isMobile ? "40%" : isCanvasPanelOpen && !isMobile ? "50%" : "0",
                    marginLeft: isHistoryPanelOpen && !isMobile ? "320px" : "0"
                }}
            >
                <div className={styles.chatContainer}>
                    {!lastQuestionRef.current ? (
                        <div className={styles.chatEmptyState}>
                            <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "24px" }}>
                                <div
                                    style={{
                                        background: "var(--surface-elevated)",
                                        border: "3px solid var(--border)",
                                        borderRadius: "50%",
                                        padding: "20px",
                                        boxShadow: "0 8px 32px rgba(0,0,0,0.1)"
                                    }}
                                >
                                    <img src={botProfile.logo} alt={botProfile.label} width="80" height="80" />
                                </div>
                                <h1
                                    style={{
                                        fontSize: "2.5rem",
                                        fontWeight: "700",
                                        color: "var(--text)",
                                        margin: 0
                                    }}
                                >
                                    Hello {userName}!
                                </h1>
                            </div>

                            <h2
                                style={{
                                    color: "var(--text)",
                                    marginBottom: "16px",
                                    fontSize: "20px",
                                    fontWeight: "500",
                                    textAlign: "center"
                                }}
                            >
                                {welcomeMessage !== `Hello ${userName}!` ? welcomeMessage : ""}
                            </h2>

                            {BotContentFactory.render(botId, {
                                userName,
                                welcomeMessage,
                                isMobile,
                                onSendMessage: sendProgrammaticMessage
                            })}

                            {/* Microsoft Sign-In */}
                            <div style={{ marginBottom: "32px", display: "flex", justifyContent: "center" }}>
                                <MicrosoftSignIn />
                            </div>

                            {showLanguagePicker && (
                                <div style={{ marginBottom: "32px" }}>
                                    <LanguagePicker onLanguageChange={newLang => i18n.changeLanguage(newLang)} />
                                </div>
                            )}

                            {/* Only show examples on non-mobile */}
                            {!isMobile && (
                                <div style={{ marginTop: "40px", marginBottom: "120px" }}>
                                    <ExampleList onExampleClicked={onExampleClicked} useGPT4V={useGPT4V} botId={botId} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`${styles.chatMessageStream} ${botId === "ba" ? styles.baBot : ""}`}>
                            {isStreaming &&
                                streamedAnswers.map((streamedAnswer, index) => (
                                    <div key={index}>
                                        <UserChatMessage message={streamedAnswer[0]} attachmentRefs={streamedAnswer[2]} />
                                        <div className={styles.chatMessageGpt}>
                                            <Answer
                                                isStreaming={true}
                                                key={index}
                                                answer={streamedAnswer[1]}
                                                index={index}
                                                speechConfig={speechConfig}
                                                isSelected={false}
                                                onCitationClicked={c => onShowCitation(c, index)}
                                                onThoughtProcessClicked={() => onToggleTab(AnalysisPanelTabs.ThoughtProcessTab, index)}
                                                onSupportingContentClicked={() => onToggleTab(AnalysisPanelTabs.SupportingContentTab, index)}
                                                showSpeechOutputAzure={showSpeechOutputAzure}
                                                showSpeechOutputBrowser={showSpeechOutputBrowser}
                                            />
                                        </div>
                                    </div>
                                ))}

                            {!isStreaming &&
                                answers.map((answer, index) => (
                                    <div key={index}>
                                        <UserChatMessage message={answer[0]} attachmentRefs={answer[2]} />
                                        <div className={styles.chatMessageGpt}>
                                            <Answer
                                                isStreaming={false}
                                                key={index}
                                                answer={answer[1]}
                                                index={index}
                                                speechConfig={speechConfig}
                                                isSelected={selectedAnswer === index && activeAnalysisPanelTab !== undefined}
                                                onCitationClicked={c => onShowCitation(c, index)}
                                                onThoughtProcessClicked={() => onToggleTab(AnalysisPanelTabs.ThoughtProcessTab, index)}
                                                onSupportingContentClicked={() => onToggleTab(AnalysisPanelTabs.SupportingContentTab, index)}
                                                showSpeechOutputAzure={showSpeechOutputAzure}
                                                showSpeechOutputBrowser={showSpeechOutputBrowser}
                                                userQuestion={answer[0]} // Pass the user's question
                                                onContentSuggestion={suggestion => handleContentSuggestion(suggestion, answer[0])}
                                            />
                                        </div>
                                    </div>
                                ))}

                            {isLoading && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} attachmentRefs={currentAttachments} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerLoading />
                                    </div>
                                </>
                            )}

                            {error ? (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} attachmentRefs={currentAttachments} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current, currentAttachments)} />
                                    </div>
                                </>
                            ) : null}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    <div
                        className={`${styles.chatInput} ${botId === "ba" ? styles.baBot : ""}`}
                        style={{
                            right: activeAnalysisPanelTab && !isMobile ? "40%" : isCanvasPanelOpen && !isMobile ? "50%" : "0",
                            left: isHistoryPanelOpen && !isMobile ? "320px" : "0",
                            width: "auto",
                            backgroundColor: "var(--background)",
                            borderTop: "1px solid var(--border)",
                            padding: "16px 20px"
                        }}
                    >
                        <QuestionInput
                            clearOnSend
                            placeholder={t("defaultExamples.placeholder")}
                            disabled={isLoading}
                            isGenerating={isLoading || isStreaming} // Add this
                            onCancel={cancelGeneration} // Add this
                            onSend={(question, attachmentRefs) => {
                                makeApiRequest(question, attachmentRefs);
                            }}
                            showSpeechInput={showSpeechInput}
                            followupQuestions={currentFollowupQuestions}
                            onFollowupQuestionClicked={question => {
                                setCurrentFollowupQuestions([]);
                                makeApiRequest(question);
                            }}
                        />
                    </div>
                </div>

                {answers.length > 0 && activeAnalysisPanelTab && (
                    <AnalysisPanel
                        className={styles.chatAnalysisPanel}
                        activeCitation={activeCitation}
                        onActiveTabChanged={x => onToggleTab(x, selectedAnswer)}
                        citationHeight="810px"
                        answer={answers[selectedAnswer][1]}
                        activeTab={activeAnalysisPanelTab}
                    />
                )}

                {((useLogin && showChatHistoryCosmos) || showChatHistoryBrowser) && (
                    <div
                        style={{
                            position: "fixed",
                            top: "64px",
                            left: "0",
                            width: "320px",
                            height: "calc(100vh - 128px)",
                            background: "var(--surface-elevated)",
                            backdropFilter: "blur(20px)",
                            borderRight: "1px solid var(--border-light)",
                            boxShadow: "var(--shadow-lg)",
                            zIndex: 900,
                            display: isHistoryPanelOpen ? "block" : "none"
                        }}
                    >
                        <HistoryPanel
                            provider={historyProvider}
                            isOpen={isHistoryPanelOpen}
                            notify={!isStreaming && !isLoading}
                            onClose={() => setIsHistoryPanelOpen(false)}
                            onChatSelected={answers => {
                                if (answers.length === 0) return;
                                setAnswers(answers);
                                lastQuestionRef.current = answers[answers.length - 1][0];
                            }}
                        />
                    </div>
                )}

                <Panel
                    headerText={t("labels.headerText")}
                    isOpen={isConfigPanelOpen}
                    isBlocking={false}
                    onDismiss={() => setIsConfigPanelOpen(false)}
                    closeButtonAriaLabel={t("labels.closeButton")}
                    onRenderFooterContent={() => <DefaultButton onClick={() => setIsConfigPanelOpen(false)}>{t("labels.closeButton")}</DefaultButton>}
                    isFooterAtBottom={true}
                >
                    <Settings
                        promptTemplate={promptTemplate}
                        temperature={temperature}
                        retrieveCount={retrieveCount}
                        maxSubqueryCount={maxSubqueryCount}
                        resultsMergeStrategy={resultsMergeStrategy}
                        seed={seed}
                        minimumSearchScore={minimumSearchScore}
                        minimumRerankerScore={minimumRerankerScore}
                        useSemanticRanker={useSemanticRanker}
                        useSemanticCaptions={useSemanticCaptions}
                        useQueryRewriting={useQueryRewriting}
                        reasoningEffort={reasoningEffort}
                        excludeCategory={excludeCategory}
                        includeCategory={includeCategory}
                        retrievalMode={retrievalMode}
                        useGPT4V={useGPT4V}
                        gpt4vInput={gpt4vInput}
                        vectorFields={vectorFields}
                        showSemanticRankerOption={showSemanticRankerOption}
                        showQueryRewritingOption={showQueryRewritingOption}
                        showReasoningEffortOption={showReasoningEffortOption}
                        showGPT4VOptions={showGPT4VOptions}
                        showVectorOption={showVectorOption}
                        useOidSecurityFilter={useOidSecurityFilter}
                        useGroupsSecurityFilter={useGroupsSecurityFilter}
                        useLogin={!!useLogin}
                        loggedIn={loggedIn}
                        requireAccessControl={requireAccessControl}
                        shouldStream={shouldStream}
                        streamingEnabled={streamingEnabled}
                        useSuggestFollowupQuestions={useSuggestFollowupQuestions}
                        showSuggestFollowupQuestions={true}
                        showAgenticRetrievalOption={showAgenticRetrievalOption}
                        useAgenticRetrieval={useAgenticRetrieval}
                        onChange={handleSettingsChange}
                    />
                    {useLogin && <TokenClaimsDisplay />}
                </Panel>

                {/* Canvas Panel */}
                <CanvasPanel htmlContent={canvasContent} isOpen={isCanvasPanelOpen} onClose={() => setIsCanvasPanelOpen(false)} title={canvasTitle} />
            </div>
        </div>
    );
};

export default Chat;
