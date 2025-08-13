// src/contexts/ArtifactContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { BA_ARTIFACT_TYPES, DEFAULT_ARTIFACT_TYPE, ArtifactType, ARTIFACT_CATEGORIES, ArtifactCategory } from '../config/baArtifactConfig';

interface ArtifactContextType {
    selectedArtifactType: string;
    setSelectedArtifactType: (artifactType: string) => void;
    getSelectedArtifact: () => ArtifactType;
    selectedCategory: string | null;
    setSelectedCategory: (categoryId: string | null) => void;
    getSelectedCategory: () => ArtifactCategory | null;
    isArtifactSelectionMode: boolean;
    setIsArtifactSelectionMode: (mode: boolean) => void;
}

const ArtifactContext = createContext<ArtifactContextType | undefined>(undefined);

interface ArtifactProviderProps {
    children: ReactNode;
}

export const ArtifactProvider: React.FC<ArtifactProviderProps> = ({ children }) => {
    const [selectedArtifactType, setSelectedArtifactType] = useState<string>(DEFAULT_ARTIFACT_TYPE);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isArtifactSelectionMode, setIsArtifactSelectionMode] = useState<boolean>(false);

    const getSelectedArtifact = (): ArtifactType => {
        return BA_ARTIFACT_TYPES[selectedArtifactType] || BA_ARTIFACT_TYPES[DEFAULT_ARTIFACT_TYPE];
    };

    const getSelectedCategory = (): ArtifactCategory | null => {
        return selectedCategory ? ARTIFACT_CATEGORIES[selectedCategory] : null;
    };

    // When artifact is selected, auto-select its category
    const handleArtifactSelection = (artifactType: string) => {
        setSelectedArtifactType(artifactType);
        const artifact = BA_ARTIFACT_TYPES[artifactType];
        if (artifact) {
            setSelectedCategory(artifact.category);
        }
    };

    return (
        <ArtifactContext.Provider
            value={{
                selectedArtifactType,
                setSelectedArtifactType: handleArtifactSelection,
                getSelectedArtifact,
                selectedCategory,
                setSelectedCategory,
                getSelectedCategory,
                isArtifactSelectionMode,
                setIsArtifactSelectionMode,
            }}
        >
            {children}
        </ArtifactContext.Provider>
    );
};

export const useArtifact = (): ArtifactContextType => {
    const context = useContext(ArtifactContext);
    if (!context) {
        throw new Error('useArtifact must be used within an ArtifactProvider');
    }
    return context;
};