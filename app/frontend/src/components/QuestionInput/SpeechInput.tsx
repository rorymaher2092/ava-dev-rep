import { useState, useRef, useEffect } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { Mic28Filled, Stop24Regular, Pause24Regular, Play24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { pipeline } from '@xenova/transformers';
import styles from "./QuestionInput.module.css";

interface Props {
    updateQuestion: (question: string) => void;
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

export const SpeechInput = ({ updateQuestion }: Props) => {
    const { t } = useTranslation();
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const [recordingTime, setRecordingTime] = useState(0);
    const [transcriber, setTranscriber] = useState<any>(null);
    const [isLoadingTranscriber, setIsLoadingTranscriber] = useState(true);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(0);
    const pausedTimeRef = useRef<number>(0);

    // Initialize Whisper transcriber once with proper error handling
    useEffect(() => {
        let mounted = true;
        
        const initTranscriber = async () => {
            console.log("Starting Whisper initialization...");
            try {
                // Add progress callback to see loading progress
                const pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                    progress_callback: (progress: any) => {
                        if (progress.status === 'downloading') {
                            console.log(`Downloading model: ${progress.name} - ${Math.round(progress.progress || 0)}%`);
                        } else if (progress.status === 'loading') {
                            console.log(`Loading model: ${progress.name}`);
                        }
                    }
                });
                
                // Verify the pipeline is actually a function
                if (typeof pipe !== 'function') {
                    throw new Error('Pipeline did not return a function');
                }
                
                if (mounted) {
                    setTranscriber(pipe);
                    setInitializationError(null);
                    console.log("Whisper transcriber loaded successfully and verified");
                }
            } catch (error) {
                console.error('Failed to load Whisper transcriber:', error);
                if (mounted) {
                    setInitializationError(error instanceof Error ? error.message : 'Unknown error');
                    setTranscriber(null);
                }
            } finally {
                if (mounted) {
                    setIsLoadingTranscriber(false);
                }
            }
        };
        
        initTranscriber();
        
        return () => { 
            mounted = false; 
        };
    }, []);

    // Timer for recording duration
    useEffect(() => {
        if (recordingState === 'recording') {
            timerRef.current = setInterval(() => {
                const now = Date.now();
                const elapsed = Math.floor((now - startTimeRef.current - pausedTimeRef.current) / 1000);
                setRecordingTime(elapsed);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [recordingState]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
        // Strict validation of transcriber
        if (!transcriber || typeof transcriber !== 'function') {
            throw new Error('Transcriber not properly initialized or not a function');
        }
        
        try {
            console.log("Starting transcription...");
            console.log("Audio blob size:", audioBlob.size, "type:", audioBlob.type);
            
            // Convert blob to array buffer for better compatibility
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log("Converted to ArrayBuffer, size:", arrayBuffer.byteLength);
            
            // Call the transcriber function
            const result = await transcriber(arrayBuffer);
            console.log("Transcription result:", result);
            
            return result.text || '';
        } catch (error) {
            console.error('Client-side transcription error:', error);
            // Log the actual error details
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    };

    const startRecording = async () => {
        // Check if transcriber is ready
        if (!transcriber || typeof transcriber !== 'function') {
            if (isLoadingTranscriber) {
                alert('Speech recognition is still loading. Please wait a moment and try again.');
            } else if (initializationError) {
                alert(`Speech recognition failed to load: ${initializationError}`);
            } else {
                alert('Speech recognition is not available. Please refresh the page.');
            }
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000, // Whisper prefers 16kHz
                }
            });
            
            streamRef.current = stream;
            audioChunksRef.current = [];
            
            // Use a compatible MIME type
            const options: MediaRecorderOptions = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                options.mimeType = 'audio/wav';
            }
            
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                    console.log("Audio chunk collected, size:", event.data.size);
                }
            };
            
            mediaRecorder.onstop = async () => {
                setRecordingState('processing');
                
                try {
                    const audioBlob = new Blob(audioChunksRef.current, { 
                        type: options.mimeType || 'audio/webm' 
                    });
                    console.log("Audio recording completed. Total size:", audioBlob.size, "type:", audioBlob.type);
                    
                    if (audioBlob.size === 0) {
                        throw new Error('No audio data recorded');
                    }
                    
                    const transcription = await transcribeAudio(audioBlob);
                    
                    if (transcription && transcription.trim()) {
                        updateQuestion(transcription.trim());
                    } else {
                        console.warn('Transcription returned empty result');
                        alert('No speech detected. Please try again.');
                    }
                } catch (error) {
                    console.error('Transcription failed:', error);
                    alert(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                } finally {
                    cleanup();
                }
            };
            
            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                alert('Recording failed. Please try again.');
                cleanup();
            };
            
            startTimeRef.current = Date.now();
            pausedTimeRef.current = 0;
            setRecordingTime(0);
            setRecordingState('recording');
            
            // Start recording with time slices to ensure data is captured
            mediaRecorder.start(1000); // Collect data every second
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Failed to access microphone. Please check permissions and try again.');
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && recordingState === 'recording') {
            mediaRecorderRef.current.pause();
            setRecordingState('paused');
            const pauseStart = Date.now();
            pausedTimeRef.current += pauseStart - startTimeRef.current;
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && recordingState === 'paused') {
            mediaRecorderRef.current.resume();
            setRecordingState('recording');
            startTimeRef.current = Date.now();
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && (recordingState === 'recording' || recordingState === 'paused')) {
            console.log("Stopping recording...");
            mediaRecorderRef.current.stop();
        }
    };

    const cleanup = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setRecordingState('idle');
        setRecordingTime(0);
        pausedTimeRef.current = 0;
        
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, []);

    // Check if MediaRecorder is supported
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        return (
            <div style={{ fontSize: '12px', color: '#666' }}>
                Voice recording not supported in this browser
            </div>
        );
    }

    return (
        <div className={styles.questionInputButtonsContainer}>
            {recordingState === 'idle' && (
                <Tooltip 
                    content={
                        isLoadingTranscriber 
                            ? "Loading speech recognition..." 
                            : initializationError 
                                ? `Error: ${initializationError}` 
                                : t("tooltips.askWithVoice")
                    } 
                    relationship="label"
                >
                    <Button 
                        size="large" 
                        icon={<Mic28Filled primaryFill="rgba(115, 118, 225, 1)" />} 
                        onClick={startRecording}
                        disabled={isLoadingTranscriber || !!initializationError || !transcriber}
                    />
                </Tooltip>
            )}
            
            {(recordingState === 'recording' || recordingState === 'paused') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Recording indicator with timer */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        padding: '4px 8px',
                        background: recordingState === 'recording' ? 'rgba(255, 0, 0, 0.1)' : 'rgba(255, 165, 0, 0.1)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: recordingState === 'recording' ? '#d32f2f' : '#f57c00'
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: recordingState === 'recording' ? '#d32f2f' : '#f57c00',
                            animation: recordingState === 'recording' ? 'pulse 1.5s infinite' : 'none'
                        }} />
                        {formatTime(recordingTime)}
                    </div>
                    
                    {/* Pause/Resume button */}
                    {recordingState === 'recording' ? (
                        <Tooltip content="Pause recording" relationship="label">
                            <Button 
                                size="large" 
                                icon={<Pause24Regular />} 
                                onClick={pauseRecording}
                                appearance="subtle"
                                style={{ color: '#f57c00' }}
                            />
                        </Tooltip>
                    ) : (
                        <Tooltip content="Resume recording" relationship="label">
                            <Button 
                                size="large" 
                                icon={<Play24Regular />} 
                                onClick={resumeRecording}
                                appearance="subtle"
                                style={{ color: '#4caf50' }}
                            />
                        </Tooltip>
                    )}
                    
                    {/* Stop button */}
                    <Tooltip content={t("tooltips.stopRecording")} relationship="label">
                        <Button 
                            size="large" 
                            icon={<Stop24Regular />} 
                            onClick={stopRecording}
                            appearance="subtle"
                            style={{ color: '#d32f2f' }}
                        />
                    </Tooltip>
                </div>
            )}
            
            {recordingState === 'processing' && (
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '4px 8px',
                    background: 'rgba(115, 118, 225, 0.1)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: 'rgba(115, 118, 225, 1)'
                }}>
                    <div style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid rgba(115, 118, 225, 0.3)',
                        borderTop: '2px solid rgba(115, 118, 225, 1)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    Processing...
                </div>
            )}

            {/* Show loading or error state */}
            {isLoadingTranscriber && recordingState === 'idle' && (
                <div style={{ 
                    fontSize: '10px', 
                    color: '#666', 
                    marginTop: '4px',
                    textAlign: 'center'
                }}>
                    Loading speech recognition...
                </div>
            )}

            {initializationError && recordingState === 'idle' && (
                <div style={{ 
                    fontSize: '10px', 
                    color: '#d32f2f', 
                    marginTop: '4px',
                    textAlign: 'center'
                }}>
                    Failed to load speech recognition
                </div>
            )}
            
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};