// src/components/CompactArtifactSelector/CompactArtifactSelector.tsx
import React, { useState } from 'react';
import { ARTIFACT_CATEGORIES, getArtifactsByCategory } from '../../config/baArtifactConfig';
import { useArtifact } from '../../contexts/ArtifactContext';
import { useBot } from '../../contexts/BotContext';
import styles from './CompactArtifactSelector.module.css';

interface CompactArtifactSelectorProps {
    onArtifactChanged?: (artifactType: string) => void;
}

export const CompactArtifactSelector: React.FC<CompactArtifactSelectorProps> = ({ onArtifactChanged }) => {
    const { botId } = useBot();
    const { 
        selectedArtifactType, 
        setSelectedArtifactType, 
        selectedCategory, 
        setSelectedCategory 
    } = useArtifact();
    const [isExpanded, setIsExpanded] = useState(false);

    // Only show for BA bot
    if (botId !== 'ba') {
        return null;
    }

    const handleCategorySelect = (categoryId: string) => {
        if (selectedCategory === categoryId) {
            setIsExpanded(!isExpanded);
        } else {
            setSelectedCategory(categoryId);
            setIsExpanded(true);
        }
    };

    const handleArtifactSelect = (artifactType: string) => {
        setSelectedArtifactType(artifactType);
        setIsExpanded(false);
        onArtifactChanged?.(artifactType);
    };

    const currentArtifact = selectedArtifactType ? 
        Object.values(ARTIFACT_CATEGORIES).find(cat => 
            getArtifactsByCategory(cat.id).some(art => art.id === selectedArtifactType)
        ) : null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.label}>Current artifact:</span>
                <span className={styles.currentArtifact}>
                    {currentArtifact?.icon} {selectedArtifactType.replace('_', ' ')}
                </span>
                <button 
                    className={styles.changeButton}
                    onClick={() => setIsExpanded(!isExpanded)}
                    type="button"
                >
                    {isExpanded ? '↑' : '↓'}
                </button>
            </div>

            {isExpanded && (
                <div className={styles.expandedContent}>
                    {/* Category Pills */}
                    <div className={styles.categoryPills}>
                        {Object.values(ARTIFACT_CATEGORIES).map((category) => (
                            <button
                                key={category.id}
                                className={`${styles.categoryPill} ${
                                    selectedCategory === category.id ? styles.selectedCategory : ''
                                }`}
                                onClick={() => handleCategorySelect(category.id)}
                                type="button"
                                title={category.description}
                            >
                                <span className={styles.pillIcon}>{category.icon}</span>
                                <span className={styles.pillLabel}>{category.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Artifact Options */}
                    {selectedCategory && (
                        <div className={styles.artifactOptions}>
                            {getArtifactsByCategory(selectedCategory).map((artifact) => (
                                <button
                                    key={artifact.id}
                                    className={`${styles.artifactOption} ${
                                        selectedArtifactType === artifact.id ? styles.selectedArtifact : ''
                                    }`}
                                    onClick={() => handleArtifactSelect(artifact.id)}
                                    type="button"
                                    title={artifact.description}
                                >
                                    {artifact.icon && <span className={styles.artifactIcon}>{artifact.icon}</span>}
                                    <span className={styles.artifactLabel}>{artifact.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};