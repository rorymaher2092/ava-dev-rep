import { useRef, useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Panel, DefaultButton } from "@fluentui/react";
import readNDJSONStream from "ndjson-readablestream";

import appLogo from "../../assets/ava.svg";
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
// import { SettingsButton } from "../../components/SettingsButton";
import { ClearChatButton } from "../../components/ClearChatButton";
import { UploadFile } from "../../components/UploadFile";
import { useLogin, getToken, requireAccessControl, getUsername } from "../../authConfig";
import { useMsal } from "@azure/msal-react";
import { TokenClaimsDisplay } from "../../components/TokenClaimsDisplay";
import { LoginContext } from "../../loginContext";
import { LanguagePicker } from "../../i18n/LanguagePicker";
import { Settings } from "../../components/Settings/Settings";

const Chat = () => {
    const [searchParams] = useSearchParams();
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(searchParams.get('history') === 'true');
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

    const [activeCitation, setActiveCitation] = useState<string>();
    const [activeAnalysisPanelTab, setActiveAnalysisPanelTab] = useState<AnalysisPanelTabs | undefined>(undefined);

    const [selectedAnswer, setSelectedAnswer] = useState<number>(0);
    const [answers, setAnswers] = useState<[user: string, response: ChatAppResponse][]>([]);
    const [streamedAnswers, setStreamedAnswers] = useState<[user: string, response: ChatAppResponse][]>([]);
    const [speechUrls, setSpeechUrls] = useState<(string | null)[]>([]);

    const [showGPT4VOptions, setShowGPT4VOptions] = useState<boolean>(false);
    const [showSemanticRankerOption, setShowSemanticRankerOption] = useState<boolean>(false);
    const [showQueryRewritingOption, setShowQueryRewritingOption] = useState<boolean>(false);
    const [showReasoningEffortOption, setShowReasoningEffortOption] = useState<boolean>(false);
    const [showVectorOption, setShowVectorOption] = useState<boolean>(false);
    const [showUserUpload, setShowUserUpload] = useState<boolean>(false);
    const [showLanguagePicker, setshowLanguagePicker] = useState<boolean>(false);
    const [showSpeechInput, setShowSpeechInput] = useState<boolean>(false);
    const [showSpeechOutputBrowser, setShowSpeechOutputBrowser] = useState<boolean>(false);
    const [showSpeechOutputAzure, setShowSpeechOutputAzure] = useState<boolean>(false);
    const [showChatHistoryBrowser, setShowChatHistoryBrowser] = useState<boolean>(false);
    const [showChatHistoryCosmos, setShowChatHistoryCosmos] = useState<boolean>(false);
    const [showAgenticRetrievalOption, setShowAgenticRetrievalOption] = useState<boolean>(false);
    const [useAgenticRetrieval, setUseAgenticRetrieval] = useState<boolean>(false);

    const audio = useRef(new Audio()).current;
    const [isPlaying, setIsPlaying] = useState(false);

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

    const handleAsyncRequest = async (question: string, answers: [string, ChatAppResponse][], responseBody: ReadableStream<any>) => {
        let answer: string = "";
        let askResponse: ChatAppResponse = {} as ChatAppResponse;

        const updateState = (newContent: string) => {
            return new Promise(resolve => {
                setTimeout(() => {
                    answer += newContent;
                    const latestResponse: ChatAppResponse = {
                        ...askResponse,
                        message: { content: answer, role: askResponse.message.role }
                    };
                    setStreamedAnswers([...answers, [question, latestResponse]]);
                    resolve(null);
                }, 33);
            });
        };
        try {
            setIsStreaming(true);
            for await (const event of readNDJSONStream(responseBody)) {
                if (event["context"] && event["context"]["data_points"]) {
                    event["message"] = event["delta"];
                    askResponse = event as ChatAppResponse;
                } else if (event["delta"] && event["delta"]["content"]) {
                    setIsLoading(false);
                    await updateState(event["delta"]["content"]);
                } else if (event["context"]) {
                    // Update context with new keys from latest event
                    askResponse.context = { ...askResponse.context, ...event["context"] };
                } else if (event["error"]) {
                    throw Error(event["error"]);
                }
            }
        } finally {
            setIsStreaming(false);
        }
        const fullResponse: ChatAppResponse = {
            ...askResponse,
            message: { content: answer, role: askResponse.message.role }
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

    const makeApiRequest = async (question: string) => {
        lastQuestionRef.current = question;

        // Clear follow-up questions when a new question is asked
        setCurrentFollowupQuestions([]);

        error && setError(undefined);
        setIsLoading(true);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);

        const token = client ? await getToken(client) : undefined;

        try {
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
                        ...(seed !== null ? { seed: seed } : {})
                    }
                },
                // AI Chat Protocol: Client must pass on any session state received from the server
                session_state: answers.length ? answers[answers.length - 1][1].session_state : null
            };

            const response = await chatApi(request, shouldStream, token);
            if (!response.body) {
                throw Error("No response body");
            }
            if (response.status > 299 || !response.ok) {
                throw Error(`Request failed with status ${response.status}`);
            }
            if (shouldStream) {
                const parsedResponse: ChatAppResponse = await handleAsyncRequest(question, answers, response.body);
                setAnswers([...answers, [question, parsedResponse]]);

                // Set follow-up questions if available
                if (useSuggestFollowupQuestions) {
                    setCurrentFollowupQuestions(parsedResponse.context?.followup_questions || []);
                }

                if (typeof parsedResponse.session_state === "string" && parsedResponse.session_state !== "") {
                    const token = client ? await getToken(client) : undefined;
                    historyManager.addItem(parsedResponse.session_state, [...answers, [question, parsedResponse]], token);
                }
            } else {
                const parsedResponse: ChatAppResponseOrError = await response.json();
                if (parsedResponse.error) {
                    throw Error(parsedResponse.error);
                }
                setAnswers([...answers, [question, parsedResponse as ChatAppResponse]]);

                // Set follow-up questions if available
                if (useSuggestFollowupQuestions) {
                    setCurrentFollowupQuestions((parsedResponse as ChatAppResponse).context?.followup_questions || []);
                }

                if (typeof parsedResponse.session_state === "string" && parsedResponse.session_state !== "") {
                    const token = client ? await getToken(client) : undefined;
                    historyManager.addItem(parsedResponse.session_state, [...answers, [question, parsedResponse as ChatAppResponse]], token);
                }
            }
            setSpeechUrls([...speechUrls, null]);
        } catch (e) {
            setError(e);
        } finally {
            setIsLoading(false);
        }
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
    };

    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" }), [isLoading]);
    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "auto" }), [streamedAnswers]);
    useEffect(() => {
        getConfig();
        
        // Check URL parameters for actions
        if (searchParams.get('clear') === 'true') {
            clearChat();
        }
    }, [searchParams]);
    
    // Get the user's name and welcome message when logged in
    useEffect(() => {
        const fetchUserDetails = async () => {
            if (client && loggedIn) {
                const name = await getUsername(client);
                if (name) {
                    // Extract first name if possible
                    const firstName = name.split(' ')[0];
                    setUserName(firstName);
                    
                    // Import the getUserWelcomeMessage function
                    const { getUserWelcomeMessage } = await import('../../api');
                    
                    try {
                        // Get user claims from the token
                        const accounts = client.getAllAccounts();
                        const account = accounts[0];
                        const claims = account?.idTokenClaims || {};
                        
                        // Debug: Log claims to console
                        console.log("DEBUG - Token claims:", claims);
                        
                        // Prepare user details with available information
                        const userDetails = {
                            name: firstName,
                            username: claims.preferred_username
                        };
                        
                        // Debug: Log user details being sent
                        console.log("DEBUG - User details being sent:", userDetails);
                        
                        // Fetch custom welcome message
                        const message = await getUserWelcomeMessage(userDetails);
                        setWelcomeMessage(message);
                    } catch (error) {
                        console.error("Error fetching user details:", error);
                        setWelcomeMessage(`Hello ${firstName}!`);
                    }
                }
            }
        };
        
        fetchUserDetails();
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
        
        window.addEventListener('openChatHistory', handleOpenChatHistory);
        window.addEventListener('clearChat', handleClearChat);
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('openChatHistory', handleOpenChatHistory);
            window.removeEventListener('clearChat', handleClearChat);
            window.removeEventListener('resize', handleResize);
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

    const { t, i18n } = useTranslation();

    return (
        <div className={styles.container}>
            {/* Setting the page title using react-helmet-async */}
            <Helmet>
                <title>{t("pageTitle")}</title>
            </Helmet>
            {/* Removed command buttons as they're now in the header menu */}
            <div className={styles.commandsSplitContainer}>
                <div className={styles.commandsContainer}>
                    {showUserUpload && <UploadFile className={styles.commandButton} disabled={!loggedIn} />}
                </div>
            </div>
            <div className={styles.chatRoot} style={{ 
                marginRight: activeAnalysisPanelTab && !isMobile ? "40%" : "0"
            }}>
                <div className={styles.chatContainer}>
                    {!lastQuestionRef.current ? (
                        <div className={styles.chatEmptyState}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                                    borderRadius: '50%',
                                    padding: '20px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                                }}>
                                    <img src={appLogo} alt="App logo" width="80" height="80" />
                                </div>
                                <h1 style={{ 
                                    fontSize: '2.5rem',
                                    fontWeight: '700',
                                    color: 'var(--text)',
                                    margin: 0
                                }}>
                                    Hello {userName}!
                                </h1>
                            </div>

                            <h2 style={{ 
                                color: 'var(--text)',
                                marginBottom: '16px',
                                fontSize: '20px',
                                fontWeight: '500',
                                textAlign: 'center'
                            }}>
                                {welcomeMessage !== `Hello ${userName}!` ? welcomeMessage : ''}
                            </h2>
                            

                            
                            {/* Quick stats or tips */}
                            <div style={{
                                display: 'flex',
                                gap: '24px',
                                marginBottom: '32px',
                                flexWrap: 'wrap',
                                justifyContent: 'center'
                            }}>
                                <div style={{
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    padding: '16px 20px',
                                    textAlign: 'center',
                                    minWidth: '140px'
                                }}>
                                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                                    <div style={{ color: 'var(--text)', fontWeight: '600', fontSize: '14px' }}>Ask Anything</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Get instant answers</div>
                                </div>
                                <div style={{
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    padding: '16px 20px',
                                    textAlign: 'center',
                                    minWidth: '140px'
                                }}>
                                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
                                    <div style={{ color: 'var(--text)', fontWeight: '600', fontSize: '14px' }}>Smart Search</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Find information fast</div>
                                </div>
                                <div style={{
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    padding: '16px 20px',
                                    textAlign: 'center',
                                    minWidth: '140px'
                                }}>
                                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚡</div>
                                    <div style={{ color: 'var(--text)', fontWeight: '600', fontSize: '14px' }}>Fast Response</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Powered by AI</div>
                                </div>
                            </div>

                            {showLanguagePicker && (
                                <div style={{ marginBottom: '32px' }}>
                                    <LanguagePicker onLanguageChange={newLang => i18n.changeLanguage(newLang)} />
                                </div>
                            )}

                            {/* Only show examples on non-mobile */}
                            {!isMobile && (
                                <div style={{ marginTop: '40px', marginBottom: '120px' }}>
                                    <ExampleList onExampleClicked={onExampleClicked} useGPT4V={useGPT4V} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.chatMessageStream}>
                            {isStreaming &&
                                streamedAnswers.map((streamedAnswer, index) => (
                                    <div key={index}>
                                        <UserChatMessage message={streamedAnswer[0]} />
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
                                        <UserChatMessage message={answer[0]} />
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
                                            />
                                        </div>
                                    </div>
                                ))}
                            {isLoading && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerLoading />
                                    </div>
                                </>
                            )}
                            {error ? (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current)} />
                                    </div>
                                </>
                            ) : null}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    <div className={styles.chatInput} style={{ 
                        right: activeAnalysisPanelTab && !isMobile ? "40%" : "0",
                        width: isHistoryPanelOpen && !isMobile ? "calc(100% - 300px)" : "100%",
                        backgroundColor: 'var(--background)',
                        borderTop: '1px solid var(--border)',
                        padding: '16px 20px'
                    }}>
                        <div style={{
                            backgroundColor: 'var(--surface)',
                            border: '2px solid var(--border)',
                            borderRadius: '24px',
                            padding: '4px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                        }}>
                            <QuestionInput
                                clearOnSend
                                placeholder={t("defaultExamples.placeholder")}
                                disabled={isLoading}
                                onSend={question => makeApiRequest(question)}
                                showSpeechInput={showSpeechInput}
                                followupQuestions={currentFollowupQuestions}
                                onFollowupQuestionClicked={question => {
                                    setCurrentFollowupQuestions([]);
                                    makeApiRequest(question);
                                }}
                            />
                        </div>
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
                    <div style={{ 
                        position: "fixed", 
                        top: "64px", 
                        left: "0", 
                        width: "300px", 
                        height: "calc(100vh - 128px)",
                        zIndex: 900,
                        display: isHistoryPanelOpen ? "block" : "none"
                    }}>
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
            </div>
        </div>
    );
};

export default Chat;
