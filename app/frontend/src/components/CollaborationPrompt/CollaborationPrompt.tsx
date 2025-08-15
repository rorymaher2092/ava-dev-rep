// src/components/CollaborationPrompt/CollaborationPrompt.tsx
import React from 'react';
import { useArtifact } from '../../contexts/ArtifactContext';
import styles from './CollaborationPrompt.module.css';

interface CollaborationPromptProps {
    onGetStarted?: () => void;
    // Add this new prop to receive the chat function
    onSendMessage?: (message: string) => void;
}

export const CollaborationPrompt: React.FC<CollaborationPromptProps> = ({ 
    onGetStarted, 
    onSendMessage 
}) => {
    const { getSelectedArtifact } = useArtifact();
    const selectedArtifact = getSelectedArtifact();

    const handleGetStarted = () => {
        // Send the "Let's get started" message to chat
        if (onSendMessage) {
            onSendMessage("Let's get started");
        }
        
        // Call the original onGetStarted callback if provided
        if (onGetStarted) {
            onGetStarted();
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.promptBox}>
                <div className={styles.header}>
                    <span className={styles.icon}>🤝</span>
                    <span className={styles.title}>Collaborate with AI to create a {selectedArtifact.label}</span>
                </div>
                
                <div className={styles.content}>
                    <div className={styles.promptText}>
                        {selectedArtifact.promptHint}
                    </div>
                    
                    <button 
                        className={styles.getStartedButton}
                        onClick={handleGetStarted}
                    >
                        Get Started
                    </button>
                </div>
            </div>
        </div>
    );
};