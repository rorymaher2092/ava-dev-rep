// src/config/baArtifactConfig.ts

export interface ArtifactType {
    id: string;
    label: string;
    description: string;
    icon?: string;
    promptHint: string;
    customInstructions?: string;
    category: string; // Maps to Stage from requirements
}

export interface ArtifactCategory {
    id: string;
    label: string;
    icon: string;
    description: string;
    artifacts: string[]; // Array of artifact IDs in this category
}

// Define categories (stages from your process framework)
export const ARTIFACT_CATEGORIES: Record<string, ArtifactCategory> = {
    ideate: {
        id: "ideate",
        label: "Ideate",
        icon: "💡",
        description: "Initial concept development and prioritization",
        artifacts: ["dvf_prioritisation"]
    },
    define: {
        id: "define",
        label: "Define",
        icon: "📝",
        description: "Define business requirements and stakeholder analysis",
        artifacts: ["business_discovery", "prfaq", "change_on_page", "stakeholder_impact", "change_schedule"]
    },
    design: {
        id: "design",
        label: "Design",
        icon: "🎨",
        description: "Feature design and process planning",
        artifacts: ["feature_breakdown", "feature_details", "acceptance_criteria", "story_map", "business_process", "change_strategy"]
    },
    refine_plan: {
        id: "refine_plan",
        label: "Refine & Plan",
        icon: "🔄",
        description: "Create implementation plans and breakdown work",
        artifacts: ["engineering_breakdown", "business_activities"]
    },
    develop: {
        id: "develop",
        label: "Develop",
        icon: "⚙️",
        description: "Support development and testing activities",
        artifacts: ["uat_plan"]
    }
};

// Define all artifacts based on your requirements document
export const BA_ARTIFACT_TYPES: Record<string, ArtifactType> = {
    // Ideate Stage
    dvf_prioritisation: {
        id: "dvf_prioritisation",
        label: "DVF Prioritisation Framework",
        description: "Desirability, Viability, Feasibility framework for initiative prioritization",
        icon: "📊",
        category: "ideate",
        promptHint: "Collaborate with AI to create a DVF Prioritisation with the following details:\n- Initiative description\n- Desirability assessment\n- Viability analysis\n- Feasibility evaluation\n- Overall priority score",
        customInstructions: "Help assess an initiative using the DVF (Desirability, Viability, Feasibility) framework. Ask clarifying questions to understand the initiative and provide a comprehensive breakdown with scoring."
    },

    // Define Stage
    business_discovery: {
        id: "business_discovery",
        label: "Business Discovery",
        description: "Comprehensive business analysis and impact assessment for initiatives",
        icon: "🔍",
        category: "define",
        promptHint: "Collaborate with AI to create a Business Discovery with the following details:\n- Initiative description\n- Current state analysis\n- Impact assessment\n- High-level business requirements\n- Key business engagements",
        customInstructions: "Help perform a thorough business discovery by asking clarifying questions, analyzing current state, assessing impact, and capturing business requirements and key engagements needed."
    },
    prfaq: {
        id: "prfaq",
        label: "PR FAQ",
        description: "Press Release and Frequently Asked Questions document",
        icon: "📄",
        category: "define",
        promptHint: "Collaborate with AI to create a PR FAQ with the following details:\n- Initiative description\n- Target audience and benefits\n- Key features and capabilities\n- Timeline and availability\n- Common questions and concerns",
        customInstructions: "Help create a comprehensive PR FAQ document. Ask clarifying questions about the initiative and create both a press release style announcement and FAQ section addressing common questions."
    },
    change_on_page: {
        id: "change_on_page",
        label: "Change on a Page",
        description: "One-page summary of change initiative for stakeholder communication",
        icon: "📋",
        category: "define",
        promptHint: "Collaborate with AI to create a Change on a Page with the following details:\n- Change overview and rationale\n- Key stakeholders affected\n- Timeline and milestones\n- Success measures\n- Key messages",
        customInstructions: "Help create a concise one-page change summary that clearly communicates the what, why, when, and how of the change initiative for stakeholder distribution."
    },
    stakeholder_impact: {
        id: "stakeholder_impact",
        label: "Stakeholder & Change Impact Assessment",
        description: "Analysis of stakeholders and change impact across business teams",
        icon: "👥",
        category: "define",
        promptHint: "Collaborate with AI to create a Stakeholder Impact Assessment with the following details:\n- Business teams to be engaged\n- Key stakeholders and SMEs\n- Change impact analysis\n- Engagement requirements\n- Risk assessment",
        customInstructions: "Help identify and assess stakeholders, analyze change impacts across business teams, and recommend engagement strategies and change management approaches."
    },
    change_schedule: {
        id: "change_schedule",
        label: "Change Schedule & Activities Planner",
        description: "Detailed schedule and activities for change management execution",
        icon: "📅",
        category: "define",
        promptHint: "Collaborate with AI to create a Change Schedule with the following details:\n- Change timeline and phases\n- Communication activities\n- Training requirements\n- Stakeholder engagement plan\n- Success metrics and checkpoints",
        customInstructions: "Help create a comprehensive change schedule with detailed activities in both activity view and planner view formats, including communication and engagement activities."
    },

    // Design Stage
    feature_breakdown: {
        id: "feature_breakdown",
        label: "Feature Breakdown (L1)",
        description: "High-level breakdown of features and capabilities",
        icon: "⚡",
        category: "design",
        promptHint: "Collaborate with AI to create a Feature Breakdown with the following details:\n- Feature hierarchy and grouping\n- Core capabilities\n- User value propositions\n- Dependencies and relationships\n- Priority levels",
        customInstructions: "Help break down the initiative into logical feature groups and capabilities, focusing on user value and implementation priorities."
    },
    feature_details: {
        id: "feature_details",
        label: "Feature Details",
        description: "Detailed feature specifications and requirements",
        icon: "📐",
        category: "design",
        promptHint: "Collaborate with AI to create Feature Details with the following details:\n- Detailed feature descriptions\n- Functional requirements\n- User interactions\n- Business rules\n- Integration points",
        customInstructions: "Help create comprehensive feature specifications with detailed requirements, user interactions, and business rules for development teams."
    },
    acceptance_criteria: {
        id: "acceptance_criteria",
        label: "Acceptance Criteria",
        description: "Detailed acceptance criteria for features and user stories",
        icon: "✅",
        category: "design",
        promptHint: "Collaborate with AI to create Acceptance Criteria with the following details:\n- Given/When/Then scenarios\n- Functional validation rules\n- Edge cases and error handling\n- Performance criteria\n- Definition of done",
        customInstructions: "Help create comprehensive acceptance criteria using Given/When/Then format, covering all scenarios including edge cases and error conditions."
    },
    story_map: {
        id: "story_map",
        label: "Story Map",
        description: "User story mapping and journey visualization",
        icon: "🗺️",
        category: "design",
        promptHint: "Collaborate with AI to create a Story Map with the following details:\n- User journey flow\n- Epic and story organization\n- Priority and release planning\n- User value mapping\n- Dependency identification",
        customInstructions: "Help create a user story map that visualizes the complete user journey and organizes features into a logical flow with clear priorities."
    },
    business_process: {
        id: "business_process",
        label: "Business Process Design",
        description: "Design of business processes and workflows",
        icon: "🔄",
        category: "design",
        promptHint: "Collaborate with AI to create Business Process Design with the following details:\n- Process flow description\n- Key decision points\n- Roles and responsibilities\n- Input/output requirements\n- Exception handling",
        customInstructions: "Help design business processes by understanding the initiative and creating detailed process descriptions that can be used to create process maps."
    },
    change_strategy: {
        id: "change_strategy",
        label: "Change Strategy",
        description: "Comprehensive change strategy including message house and communication plan",
        icon: "📢",
        category: "design",
        promptHint: "Collaborate with AI to create a Change Strategy with the following details:\n- Change approach and methodology\n- Message house framework\n- Communication strategy\n- Stakeholder engagement plan\n- Success measures",
        customInstructions: "Help create a comprehensive change strategy including message house and communication plan to effectively manage and communicate change across the organization."
    },

    // Refine & Plan Stage
    engineering_breakdown: {
        id: "engineering_breakdown",
        label: "Engineering Epics, Stories, and Tasks",
        description: "Technical breakdown into epics, stories, and development tasks",
        icon: "⚙️",
        category: "refine_plan",
        promptHint: "Collaborate with AI to create Engineering Breakdown with the following details:\n- Epic structure and themes\n- User stories and technical stories\n- Development tasks\n- Effort estimation\n- Dependencies and sequencing",
        customInstructions: "Help break down the solution design into implementable epics, stories, and tasks for development teams, including effort estimates and dependencies."
    },
    business_activities: {
        id: "business_activities",
        label: "Business Activities Epics and Stories",
        description: "Business-focused breakdown of activities into epics and stories",
        icon: "📋",
        category: "refine_plan",
        promptHint: "Collaborate with AI to create Business Activities with the following details:\n- Business epic themes\n- Business activity stories\n- Process implementation tasks\n- Training and communication activities\n- Success criteria",
        customInstructions: "Help break down business activities and processes into manageable epics and stories that support the overall initiative implementation."
    },

    // Develop Stage
    uat_plan: {
        id: "uat_plan",
        label: "UAT Plan",
        description: "User Acceptance Testing plan and scenarios",
        icon: "🧪",
        category: "develop",
        promptHint: "Collaborate with AI to create a UAT Plan with the following details:\n- Test scope and objectives\n- User scenarios and test cases\n- Acceptance criteria validation\n- Test data requirements\n- Success criteria",
        customInstructions: "Help create a comprehensive User Acceptance Testing plan with detailed test scenarios, cases, and validation criteria to ensure solution meets business requirements."
    }
};

export const DEFAULT_ARTIFACT_TYPE = "dvf_prioritisation";

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