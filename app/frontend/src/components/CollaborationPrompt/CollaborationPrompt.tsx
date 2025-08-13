// src/components/CollaborationPrompt/CollaborationPrompt.tsx
import React from 'react';
import { useArtifact } from '../../contexts/ArtifactContext';
import styles from './CollaborationPrompt.module.css';

interface CollaborationPromptProps {
    onGetStarted?: () => void;
}

export const CollaborationPrompt: React.FC<CollaborationPromptProps> = ({ onGetStarted }) => {
    const { getSelectedArtifact } = useArtifact();
    const selectedArtifact = getSelectedArtifact();

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
                    
                    {onGetStarted && (
                        <button 
                            className={styles.getStartedButton}
                            onClick={onGetStarted}
                        >
                            Get Started
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};