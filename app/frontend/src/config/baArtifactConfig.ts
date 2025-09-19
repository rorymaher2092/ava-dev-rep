// src/config/baArtifactConfig.ts

export interface ArtifactType {
    id: string;
    label: string;
    description: string;
    icon?: string;
    promptHint: string;
    customInstructions?: string;
    category: string; // Maps to Stage from requirements
    inDevelopment?: boolean; // New field to mark items as in development
}

export interface ArtifactCategory {
    id: string;
    label: string;
    icon: string;
    description: string;
    artifacts: string[]; // Array of artifact IDs in this category
    inDevelopment?: boolean; // New field to mark entire categories as in development
}

// Define categories (stages from your process framework)
export const ARTIFACT_CATEGORIES: Record<string, ArtifactCategory> = {
    ideate: {
        id: "ideate",
        label: "Ideate",
        icon: "💡",
        description: "Initial concept development and prioritization",
        artifacts: [],
        inDevelopment: true
    },
    define: {
        id: "define",
        label: "Define",
        icon: "📝",
        description: "Define business requirements and stakeholder analysis",
        artifacts: ["business_discovery", "prfaq", "change_on_page", "change_schedule"]
    },
    design: {
        id: "design",
        label: "Design",
        icon: "🎨",
        description: "Feature design and process planning",
        artifacts: ["story_map", "acceptance_criteria", "business_process"]
    },
    refine_plan: {
        id: "refine_plan",
        label: "Refine & Plan",
        icon: "🔄",
        description: "Create implementation plans and breakdown work",
        artifacts: [],
        inDevelopment: true
    },
    develop: {
        id: "develop",
        label: "Develop",
        icon: "⚙️",
        description: "Support development and testing activities",
        artifacts: ["sit_test_scripts"]
    }
};

// Define production-ready artifacts
export const BA_ARTIFACT_TYPES: Record<string, ArtifactType> = {
    // Define Stage - Production Ready
    business_discovery: {
        id: "business_discovery",
        label: "Business Discovery",
        description: "Comprehensive business analysis and impact assessment for initiatives",
        icon: "🔍",
        category: "define",
        promptHint:
            "Collaborate with AI to create a Business Discovery with the following details:\n- Initiative description\n- Current state analysis\n- Impact assessment\n- High-level business requirements\n- Key business engagements",
        customInstructions:
            "Help perform a thorough business discovery by asking clarifying questions, analyzing current state, assessing impact, and capturing business requirements and key engagements needed."
    },
    prfaq: {
        id: "prfaq",
        label: "PR FAQ",
        description: "Press Release and Frequently Asked Questions document",
        icon: "📄",
        category: "define",
        promptHint:
            "Collaborate with AI to create a PR FAQ with the following details:\n- Initiative description\n- Target audience and benefits\n- Key features and capabilities\n- Timeline and availability\n- Common questions and concerns",
        customInstructions:
            "Help create a comprehensive PR FAQ document. Ask clarifying questions about the initiative and create both a press release style announcement and FAQ section addressing common questions."
    },
    change_on_page: {
        id: "change_on_page",
        label: "Change on a Page",
        description: "One-page summary of change initiative for stakeholder communication",
        icon: "📋",
        category: "define",
        promptHint:
            "Collaborate with AI to create a Change on a Page with the following details:\n- Change overview and rationale\n- Key stakeholders affected\n- Timeline and milestones\n- Success measures\n- Key messages",
        customInstructions:
            "Help create a concise one-page change summary that clearly communicates the what, why, when, and how of the change initiative for stakeholder distribution."
    },
    change_schedule: {
        id: "change_schedule",
        label: "Change Schedule",
        description: "Detailed timeline and scheduling for change implementation",
        icon: "📅",
        category: "define",
        promptHint:
            "Collaborate with AI to create a Change Schedule with the following details:\n- Implementation timeline\n- Key milestones and deliverables\n- Resource allocation\n- Dependencies and risks\n- Communication schedule",
        customInstructions:
            "Help create a comprehensive change schedule that outlines the timeline, milestones, resources, and dependencies for successful change implementation."
    },

    // Design Stage - Production Ready
    story_map: {
        id: "story_map",
        label: "Story Map",
        description: "User story mapping and journey visualization",
        icon: "🗺️",
        category: "design",
        promptHint:
            "Collaborate with AI to create a Story Map with the following details:\n- User journey flow\n- Epic and story organization\n- Priority and release planning\n- User value mapping\n- Dependency identification",
        customInstructions:
            "Help create a user story map that visualizes the complete user journey and organizes features into a logical flow with clear priorities."
    },
    acceptance_criteria: {
        id: "acceptance_criteria",
        label: "Acceptance Criteria",
        description: "Define testable conditions for feature completion",
        icon: "✅",
        category: "design",
        promptHint:
            "Collaborate with AI to create Acceptance Criteria with the following details:\n- Feature or story description\n- Testable conditions\n- Success scenarios\n- Edge cases and constraints\n- Definition of done",
        customInstructions: "Help create clear, testable acceptance criteria that define when a feature or story is considered complete and ready for delivery."
    },
    business_process: {
        id: "business_process",
        label: "Business Process",
        description: "Structured process documentation and workflow analysis",
        icon: "🔄",
        category: "design",
        promptHint:
            "Collaborate with AI to create Business Process documentation with the following details:\n- Process overview and purpose\n- Stakeholders and roles\n- Detailed process steps\n- Decision points and workflows\n- Exception handling",
        customInstructions:
            "Help create comprehensive business process documentation by analyzing unstructured information and converting it into clear, actionable process maps and workflows."
    },

    // Develop Stage - Production Ready
    sit_test_scripts: {
        id: "sit_test_scripts",
        label: "SIT Test Scripts",
        description: "System Integration Testing scripts and test cases",
        icon: "🧪",
        category: "develop",
        promptHint:
            "Collaborate with AI to create SIT Test Scripts with the following details:\n- Test scenarios and cases\n- Integration points\n- Data setup requirements\n- Expected outcomes\n- Test execution steps",
        customInstructions: "Help create comprehensive System Integration Testing scripts that validate system interactions and integration points."
    }
};

// Set business_discovery as the new default
export const DEFAULT_ARTIFACT_TYPE = "business_discovery";

// Helper functions
export const getArtifactsByCategory = (categoryId: string): ArtifactType[] => {
    const category = ARTIFACT_CATEGORIES[categoryId];
    if (!category) return [];

    return category.artifacts.map(artifactId => BA_ARTIFACT_TYPES[artifactId]).filter(Boolean);
};

export const getCategoryForArtifact = (artifactId: string): ArtifactCategory | null => {
    const artifact = BA_ARTIFACT_TYPES[artifactId];
    if (!artifact) return null;

    return ARTIFACT_CATEGORIES[artifact.category] || null;
};

// Get all categories in order
export const getAllCategories = (): ArtifactCategory[] => {
    return Object.values(ARTIFACT_CATEGORIES);
};

// Get all artifacts in a specific category
export const getArtifactsInCategory = (categoryId: string): ArtifactType[] => {
    return Object.values(BA_ARTIFACT_TYPES).filter(artifact => artifact.category === categoryId);
};

// New helper function to check if category has any artifacts
export const categoryHasArtifacts = (categoryId: string): boolean => {
    const category = ARTIFACT_CATEGORIES[categoryId];
    return category ? category.artifacts.length > 0 : false;
};

// New helper function to get development status message
export const getCategoryStatusMessage = (categoryId: string): string | null => {
    const category = ARTIFACT_CATEGORIES[categoryId];
    if (!category) return null;

    if (category.inDevelopment || category.artifacts.length === 0) {
        return "In development";
    }

    return null;
};

// Default category to show first
export const DEFAULT_CATEGORY = "define";
