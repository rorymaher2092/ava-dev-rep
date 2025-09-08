// src/components/ArtifactSelector/ArtifactSelector.tsx
import React from 'react';
import { 
    ARTIFACT_CATEGORIES, 
    getArtifactsByCategory,
    getCategoryStatusMessage,
    categoryHasArtifacts 
} from '../../config/baArtifactConfig';
import { useArtifact } from '../../contexts/ArtifactContext';
import styles from './ArtifactSelector.module.css';

interface ArtifactSelectorProps {
    onArtifactSelected?: (artifactType: string) => void;
}

export const ArtifactSelector: React.FC<ArtifactSelectorProps> = ({ onArtifactSelected }) => {
    const { 
        selectedArtifactType, 
        setSelectedArtifactType, 
        selectedCategory, 
        setSelectedCategory 
    } = useArtifact();

    const handleCategorySelect = (categoryId: string) => {
        if (selectedCategory === categoryId) {
            // If clicking the same category, collapse it
            setSelectedCategory(null);
        } else {
            // Expand new category
            setSelectedCategory(categoryId);
        }
    };

    const handleArtifactSelect = (artifactType: string) => {
        setSelectedArtifactType(artifactType);
        onArtifactSelected?.(artifactType);
    };

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Select the artifact you would like to produce</h3>
            
            {/* Category Row (Top Tier) */}
            <div className={styles.categoryGrid}>
                {Object.values(ARTIFACT_CATEGORIES).map((category) => (
                    <button
                        key={category.id}
                        className={`${styles.categoryButton} ${
                            selectedCategory === category.id ? styles.selectedCategory : ''
                        }`}
                        onClick={() => handleCategorySelect(category.id)}
                        title={category.description}
                    >
                        <span className={styles.categoryIcon}>{category.icon}</span>
                        <span className={styles.categoryLabel}>{category.label}</span>
                    </button>
                ))}
            </div>

            {/* Artifact Row (Bottom Tier) - Only show when category is selected */}
            {selectedCategory && (
                <div className={styles.artifactSection}>
                    {categoryHasArtifacts(selectedCategory) ? (
                        <div className={styles.artifactGrid}>
                            {getArtifactsByCategory(selectedCategory).map((artifact) => (
                                <button
                                    key={artifact.id}
                                    className={`${styles.artifactButton} ${
                                        selectedArtifactType === artifact.id ? styles.selectedArtifact : ''
                                    }`}
                                    onClick={() => handleArtifactSelect(artifact.id)}
                                    title={artifact.description}
                                >
                                    {artifact.icon && <span className={styles.artifactIcon}>{artifact.icon}</span>}
                                    <span className={styles.artifactLabel}>{artifact.label}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.inDevelopmentMessage}>
                            {getCategoryStatusMessage(selectedCategory)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};