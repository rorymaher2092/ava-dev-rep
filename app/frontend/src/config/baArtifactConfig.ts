// src/config/baArtifactConfig.ts

export interface ArtifactType {
    id: string;
    label: string;
    description: string;
    icon?: string;
    promptHint: string;
    customInstructions?: string;
    category: string; // Add category field
}

export interface ArtifactCategory {
    id: string;
    label: string;
    icon: string;
    description: string;
    artifacts: string[]; // Array of artifact IDs in this category
}

// Define categories (top tier)
export const ARTIFACT_CATEGORIES: Record<string, ArtifactCategory> = {
    ideate: {
        id: "ideate",
        label: "Ideate",
        icon: "💡",
        description: "Brainstorm and conceptualize new ideas",
        artifacts: ["prfaq", "initiative"]
    },
    define: {
        id: "define",
        label: "Define",
        icon: "📝",
        description: "Define requirements and specifications",
        artifacts: ["feature", "acceptance_criteria"]
    },
    design: {
        id: "design",
        label: "Design",
        icon: "🎨",
        description: "Design user experiences and workflows",
        artifacts: ["story_map"]
    },
    refine_plan: {
        id: "refine_plan",
        label: "Refine & Plan",
        icon: "🔄",
        description: "Refine requirements and plan execution",
        artifacts: ["user_journey", "test_plan"]
    },
    develop: {
        id: "develop",
        label: "Develop",
        icon: "⚙️",
        description: "Support development and implementation",
        artifacts: ["api_spec", "technical_requirements"]
    }
};

// Define all artifacts (bottom tier - these get sent to backend)
export const BA_ARTIFACT_TYPES: Record<string, ArtifactType> = {
    // Ideate category
    prfaq: {
        id: "prfaq",
        label: "PR FAQ",
        description: "Press Release and Frequently Asked Questions document",
        icon: "📄",
        category: "ideate",
        promptHint: "Collaborate with AI to create a PR FAQ with the following details:\n- Product/Feature name\n- Target audience\n- Key benefits\n- Release timeline",
        customInstructions: "Help create a comprehensive PR FAQ document following Amazon's PR FAQ format. Focus on customer benefits and clear communication."
    },
    initiative: {
        id: "initiative",
        label: "Initiative",
        description: "Strategic business initiative planning",
        icon: "🎯",
        category: "ideate",
        promptHint: "Collaborate with AI to create an Initiative with the following details:\n- Initiative name and objectives\n- Success metrics\n- Timeline and milestones\n- Resource requirements",
        customInstructions: "Help plan and structure a business initiative with clear objectives, success criteria, and implementation roadmap."
    },
    
    // Define category
    feature: {
        id: "feature",
        label: "Feature",
        description: "Product feature specification and requirements",
        icon: "⚡",
        category: "define",
        promptHint: "Collaborate with AI to create a Feature with the following details:\n- Feature name and description\n- User stories\n- Acceptance criteria\n- Technical requirements",
        customInstructions: "Help define a product feature with comprehensive requirements, user stories, and acceptance criteria."
    },
    acceptance_criteria: {
        id: "acceptance_criteria",
        label: "Acceptance Criteria",
        description: "Detailed acceptance criteria for user stories",
        icon: "✅",
        category: "define",
        promptHint: "Collaborate with AI to create Acceptance Criteria with the following details:\n- User story context\n- Given/When/Then scenarios\n- Edge cases and validations\n- Definition of done",
        customInstructions: "Help create comprehensive acceptance criteria using Given/When/Then format and covering all necessary scenarios."
    },
    
    // Design category
    story_map: {
        id: "story_map",
        label: "Story map",
        description: "User story mapping and prioritization",
        icon: "🗺️",
        category: "design",
        promptHint: "Collaborate with AI to create a Story Map with the following details:\n- User journey overview\n- Epic breakdown\n- Story prioritization\n- Release planning",
        customInstructions: "Help create a user story map that visualizes the user journey and breaks down features into manageable stories."
    },
    
    // Refine & Plan category
    user_journey: {
        id: "user_journey",
        label: "User Journey",
        description: "Detailed user journey mapping",
        icon: "🛤️",
        category: "refine_plan",
        promptHint: "Collaborate with AI to create a User Journey with the following details:\n- User personas and goals\n- Journey stages and touchpoints\n- Pain points and opportunities\n- Success metrics",
        customInstructions: "Help map out detailed user journeys with clear stages, touchpoints, and optimization opportunities."
    },
    test_plan: {
        id: "test_plan",
        label: "Test Plan",
        description: "Comprehensive testing strategy",
        icon: "🧪",
        category: "refine_plan",
        promptHint: "Collaborate with AI to create a Test Plan with the following details:\n- Test scope and objectives\n- Test scenarios and cases\n- Acceptance criteria validation\n- Risk assessment",
        customInstructions: "Help create a comprehensive test plan covering functional, integration, and user acceptance testing."
    },
    
    // Develop category
    api_spec: {
        id: "api_spec",
        label: "API Spec",
        description: "API specification and documentation",
        icon: "🔌",
        category: "develop",
        promptHint: "Collaborate with AI to create an API Specification with the following details:\n- Endpoint definitions\n- Request/response formats\n- Authentication requirements\n- Error handling",
        customInstructions: "Help define clear API specifications with proper documentation for development teams."
    },
    technical_requirements: {
        id: "technical_requirements",
        label: "Technical Requirements",
        description: "Technical specifications and constraints",
        icon: "⚙️",
        category: "develop",
        promptHint: "Collaborate with AI to create Technical Requirements with the following details:\n- System architecture needs\n- Performance requirements\n- Security considerations\n- Integration points",
        customInstructions: "Help define comprehensive technical requirements covering architecture, performance, and integration needs."
    }
};

export const DEFAULT_ARTIFACT_TYPE = "prfaq";

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