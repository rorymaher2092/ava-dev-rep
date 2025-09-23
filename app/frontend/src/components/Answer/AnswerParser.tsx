import { renderToStaticMarkup } from "react-dom/server";
import { ChatAppResponse, getCitationFilePath } from "../../api";

type HtmlParsedAnswer = {
    answerHtml: string;
    citations: string[];
    citationDetails: Map<string, { url: string; title: string; isConfluence: boolean }>;
    mermaidCode?: string;
    bpmnXml?: string;
    storyMapHtml?: string;
    storyMapTitle?: string;
};

// Add this function to detect if answer contains knowledge gap
function hasKnowledgeGap(content: string): boolean {
    return content.includes("[KNOWLEDGE_GAP]");
}

// Function to detect and extract Story Map HTML
function extractStoryMapHtml(content: string): { cleanedContent: string; storyMapHtml?: string; storyMapTitle?: string } {
    const startMarker = "STORY_MAP_HTML_START";
    const endMarker = "STORY_MAP_HTML_END";

    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    // Only process if BOTH markers are present
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return { cleanedContent: content };
    }

    // Extract the HTML code
    const htmlStart = startIndex + startMarker.length;
    const storyMapHtml = content.substring(htmlStart, endIndex).trim();

    // Extract title from HTML comment
    const titleMatch = storyMapHtml.match(/<!--\s*title:\s*([^-]+)\s*-->/);
    const storyMapTitle = titleMatch ? titleMatch[1].trim() : undefined;

    // Remove the HTML section from the content
    const beforeHtml = content.substring(0, startIndex);
    const afterHtml = content.substring(endIndex + endMarker.length);
    const cleanedContent = (beforeHtml + afterHtml).trim();

    return { cleanedContent, storyMapHtml: validateStoryMapHtml(storyMapHtml), storyMapTitle };
}

function extractBpmnXml(content: string): { cleanedContent: string; bpmnXml?: string } {
    const startMarker = "BPMN_PROCESS_XML_START";
    const endMarker = "BPMN_PROCESS_XML_END";

    // First check for markdown code block format
    const codeBlockRegex = /```xml\s*\n([\s\S]*?)```/;
    const codeBlockMatch = content.match(codeBlockRegex);

    if (codeBlockMatch) {
        // Extract XML from code block
        const bpmnXml = codeBlockMatch[1].trim();

        // Remove the code block from the display content
        const cleanedContent = content.replace(codeBlockRegex, "[BPMN Diagram Generated - Click button below to view]").trim();

        console.log("Extracted BPMN from code block, length:", bpmnXml.length);
        const validatedXml = validateBpmnXml(bpmnXml);
        if (validatedXml) {
            console.log("Final BPMN XML for image generation (from code block):", validatedXml);
        }
        return { cleanedContent, bpmnXml: validatedXml };
    }

    // Fall back to marker-based extraction
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return { cleanedContent: content };
    }

    // Extract the BPMN XML
    const xmlStart = startIndex + startMarker.length;
    let bpmnXml = content.substring(xmlStart, endIndex).trim();

    console.log("Raw extracted XML (first 200 chars):", bpmnXml.substring(0, 200));

    // Decode HTML entities that might be in the XML
    bpmnXml = bpmnXml
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");

    console.log("Decoded XML (first 200 chars):", bpmnXml.substring(0, 200));

    // Remove the BPMN XML section from the content
    const beforeXml = content.substring(0, startIndex);
    const afterXml = content.substring(endIndex + endMarker.length);
    const cleanedContent = (beforeXml + afterXml).trim();

    console.log("Extracted BPMN from markers, length:", bpmnXml.length);
    const validatedXml = validateBpmnXml(bpmnXml);
    if (validatedXml) {
        console.log("Final BPMN XML for image generation:", validatedXml);
    }
    return { cleanedContent, bpmnXml: validatedXml };
}

// Function to detect and extract Mermaid code (kept for backward compatibility)
function extractMermaidCode(content: string): { cleanedContent: string; mermaidCode?: string } {
    const startMarker = "MERMAID_PROCESS_CODE_START";
    const endMarker = "MERMAID_PROCESS_CODE_END";

    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return { cleanedContent: content };
    }

    // Extract the Mermaid code
    const mermaidStart = startIndex + startMarker.length;
    const mermaidCode = content.substring(mermaidStart, endIndex).trim();

    // Remove the Mermaid code section from the content
    const beforeMermaid = content.substring(0, startIndex);
    const afterMermaid = content.substring(endIndex + endMarker.length);
    const cleanedContent = (beforeMermaid + afterMermaid).trim();

    return { cleanedContent, mermaidCode: validateAndCleanMermaidCode(mermaidCode) };
}

function validateBpmnXml(xml: string): string | undefined {
    if (!xml) return undefined;

    console.log("BPMN Validation - Original XML length:", xml.length);
    console.log("BPMN Validation - Contains BPMNEdge?", xml.includes("BPMNEdge"));
    console.log("BPMN Validation - Contains 'Edges omitted'?", xml.includes("Edges omitted"));

    // Aggressively trim whitespace and newlines
    let cleanedXml = xml.trim();

    // Remove any leading newlines that might be hidden
    cleanedXml = cleanedXml.replace(/^[\r\n]+/, "");

    // Remove any content after the closing BPMN tag
    const bpmnEndTag = "</bpmn:definitions>";
    const bpmnEndIndex = cleanedXml.indexOf(bpmnEndTag);

    if (bpmnEndIndex !== -1) {
        console.log("BPMN Validation - Found closing tag at index:", bpmnEndIndex);
        cleanedXml = cleanedXml.substring(0, bpmnEndIndex + bpmnEndTag.length);
    } else {
        // Try alternative closing tag without namespace
        const altEndTag = "</definitions>";
        const altEndIndex = cleanedXml.indexOf(altEndTag);
        if (altEndIndex !== -1) {
            console.log("BPMN Validation - Found alt closing tag at index:", altEndIndex);
            cleanedXml = cleanedXml.substring(0, altEndIndex + altEndTag.length);
        } else {
            console.log("BPMN Validation - No closing tag found!");
        }
    }

    // Final trim after extraction
    cleanedXml = cleanedXml.trim();
    console.log("BPMN Validation - Final XML length:", cleanedXml.length);
    console.log("BPMN Validation - Final XML contains BPMNEdge?", cleanedXml.includes("BPMNEdge"));

    // More lenient validation
    const bpmnKeywords = [
        "<?xml", // XML declaration
        "<definitions",
        "<bpmn:definitions",
        "xmlns" // Any namespace
    ];

    const isValid = bpmnKeywords.some(keyword => cleanedXml.includes(keyword));

    if (!isValid) {
        console.warn("Generated content doesn't appear to be valid BPMN XML");
        console.warn("First 200 chars:", cleanedXml.substring(0, 200));
        return undefined;
    }

    // Try XML parsing but be lenient with errors
    try {
        if (typeof DOMParser !== "undefined") {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(cleanedXml, "text/xml");
            const parseError = xmlDoc.getElementsByTagName("parsererror");

            if (parseError.length > 0) {
                console.warn("XML parsing warning:", parseError[0].textContent);
                // Still return the XML - let the renderer handle it
            }
        }
    } catch (e) {
        console.warn("Error during XML validation (non-critical):", e);
    }

    return cleanedXml;
}

// Validate and clean Mermaid code
function validateAndCleanMermaidCode(code: string): string | undefined {
    if (!code) return undefined;

    // Clean the code
    let cleanedCode = code
        .replace(/```mermaid/g, "")
        .replace(/```/g, "")
        .replace(/;/g, "")
        .trim();

    // Basic validation
    const mermaidKeywords = ["graph", "flowchart", "sequenceDiagram", "classDiagram", "-->", "---"];
    const isValid = mermaidKeywords.some(keyword => cleanedCode.includes(keyword));

    if (!isValid) {
        console.warn("Generated code doesn't appear to be valid Mermaid syntax");
        return undefined;
    }

    return cleanedCode;
}

// Validate Story Map HTML
function validateStoryMapHtml(html: string): string | undefined {
    if (!html) return undefined;

    // Clean the HTML
    let cleanedHtml = html.trim();

    // Strict validation - must contain actual HTML table tags (not just markdown)
    const hasHtmlTable = cleanedHtml.includes("<table") && cleanedHtml.includes("</table>");

    if (!hasHtmlTable) {
        console.warn("Content doesn't contain valid HTML table structure for story map");
        return undefined;
    }

    return cleanedHtml;
}

// Helper function to validate URL format
function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

// Enhanced citation validation
function validateCitationFormat(citation: string): { isValid: boolean; type: "confluence" | "azure" | "invalid"; reason?: string } {
    // Check for Confluence format
    if (citation.startsWith("CONFLUENCE_LINK|||")) {
        const parts = citation.substring("CONFLUENCE_LINK|||".length).split("|||");

        // Must have exactly 2 parts: URL and title
        if (parts.length !== 2) {
            return { isValid: false, type: "invalid", reason: "Confluence citation must have exactly 2 parts" };
        }

        const [url, title] = parts;

        // URL must be valid
        if (!isValidUrl(url)) {
            return { isValid: false, type: "invalid", reason: "Invalid URL in Confluence citation" };
        }

        // Title must exist and be non-empty
        if (!title || title.trim().length === 0) {
            return { isValid: false, type: "invalid", reason: "Confluence citation missing title" };
        }

        // Check for common Confluence domains (add your domains here)
        const validDomains = ["atlassian.net", "confluence.com"];
        const urlObj = new URL(url);
        const isValidDomain = validDomains.some(domain => urlObj.hostname.includes(domain));

        if (!isValidDomain) {
            console.warn(`Confluence URL domain ${urlObj.hostname} not in whitelist`);
        }

        return { isValid: true, type: "confluence" };
    }

    // Check for Azure PDF format
    const pdfRegex = /^[^\/\\]+\.pdf(?:#page=\d+)?$/i;
    if (pdfRegex.test(citation)) {
        // Additional validation: filename shouldn't contain URL-like patterns
        if (citation.includes("http://") || citation.includes("https://") || citation.includes("|||")) {
            return { isValid: false, type: "invalid", reason: "PDF citation contains invalid characters" };
        }

        return { isValid: true, type: "azure" };
    }

    // Check if it's a misplaced URL trying to be an Azure citation
    if (isValidUrl(citation)) {
        return { isValid: false, type: "invalid", reason: "Raw URL cannot be used as Azure citation" };
    }

    return { isValid: false, type: "invalid", reason: "Unknown citation format" };
}

// Parse citation to extract URL and title
function parseCitation(citation: string): { url: string; title: string; isConfluence: boolean } {
    // Check for Confluence link marker
    if (citation.startsWith("CONFLUENCE_LINK|||")) {
        const parts = citation.substring("CONFLUENCE_LINK|||".length).split("|||");
        if (parts.length >= 2) {
            const url = parts[0];
            let title = parts[1];

            try {
                title = decodeURIComponent(title.replace(/\+/g, " "));
            } catch (e) {
                title = title.replace(/\+/g, " ");
            }

            return { url, title, isConfluence: true };
        }
    }

    // Everything else is Azure PDF
    const filename = citation.split("/").pop() || citation;
    return { url: citation, title: filename, isConfluence: false };
}

// Enhanced citation validation against data points
function isCitationValid(contextDataPoints: any, citationCandidate: string): boolean {
    console.log("Validating citation:", citationCandidate);

    // First, check if the citation format is valid
    const formatValidation = validateCitationFormat(citationCandidate);
    if (!formatValidation.isValid) {
        console.warn(`Citation format invalid: ${formatValidation.reason}`, citationCandidate);
        return false;
    }

    // Check if contextDataPoints is an object with a text property that is an array
    let dataPointsArray: string[];
    if (Array.isArray(contextDataPoints)) {
        dataPointsArray = contextDataPoints;
    } else if (contextDataPoints && Array.isArray(contextDataPoints.text)) {
        dataPointsArray = contextDataPoints.text;
    } else {
        console.log("No valid data points array found");
        return false;
    }

    console.log("Data points array length:", dataPointsArray.length);

    // For Confluence citations, ensure they exist in data points
    if (formatValidation.type === "confluence") {
        const isValid = dataPointsArray.some(dataPoint => {
            // Check if the data point starts with or contains the exact citation
            return dataPoint.startsWith(citationCandidate) || (dataPoint.includes("CONFLUENCE_LINK|||") && dataPoint.includes(citationCandidate));
        });

        if (!isValid) {
            console.warn("Confluence citation not found in data points:", citationCandidate);
        }
        return isValid;
    }

    // For Azure citations, be more flexible with matching
    if (formatValidation.type === "azure") {
        const isValid = dataPointsArray.some(dataPoint => {
            // Check various matching patterns
            return (
                dataPoint.includes(citationCandidate) ||
                dataPoint.startsWith(citationCandidate) ||
                dataPoint.toLowerCase().includes(citationCandidate.toLowerCase())
            );
        });

        if (!isValid) {
            console.warn("Azure citation not found in data points:", citationCandidate);
        }
        return isValid;
    }

    return false;
}

// Helper function to fix common citation formatting issues
function preprocessCitations(content: string): string {
    // Fix pattern: [citation1, citation2] -> [citation1][citation2]
    return content.replace(/\[([^\]]+)\]/g, (match, citations) => {
        // Check if this contains multiple citations separated by comma
        if (citations.includes(", ")) {
            // Look for patterns that indicate multiple citations
            const hasMultipleCitations =
                (citations.includes(".pdf") && citations.includes("CONFLUENCE_LINK|||")) ||
                citations.split(", ").every((part: string) => part.includes(".pdf") || part.includes("CONFLUENCE_LINK|||"));

            if (hasMultipleCitations) {
                // Split by comma and reformat
                const parts = citations.split(/,\s*/);
                return parts.map((part: string) => `[${part.trim()}]`).join("");
            }
        }
        return match;
    });
}

// Clean up hallucinated or malformed citations
function cleanCitation(citation: string): string | null {
    // Remove any leading/trailing whitespace
    citation = citation.trim();

    // Fix common malformations
    // Remove quotes that might wrap citations
    citation = citation.replace(/^["']|["']$/g, "");

    // Fix double prefixes
    citation = citation.replace(/^CONFLUENCE_LINK\|\|\|CONFLUENCE_LINK\|\|\|/, "CONFLUENCE_LINK|||");

    // Validate after cleaning
    const validation = validateCitationFormat(citation);
    if (!validation.isValid) {
        console.warn(`Removing invalid citation after cleaning: ${citation} (${validation.reason})`);
        return null;
    }

    return citation;
}

export function parseAnswerToHtml(
    answer: ChatAppResponse,
    isStreaming: boolean,
    onCitationClicked: (citationFilePath: string) => void
): HtmlParsedAnswer & { hasKnowledgeGap: boolean } {
    const contextDataPoints = answer.context.data_points;
    const citations: string[] = [];
    const citationDetails = new Map<string, { url: string; title: string; isConfluence: boolean }>();

    // Check for knowledge gap before processing
    const hasGap = hasKnowledgeGap(answer.message.content);

    // Extract Story Map HTML and clean content
    const { cleanedContent: contentAfterStoryMap, storyMapHtml, storyMapTitle } = extractStoryMapHtml(answer.message.content);

    // Extract BPMN XML and clean content
    const { cleanedContent: contentAfterBpmn, bpmnXml } = extractBpmnXml(contentAfterStoryMap);
    console.log("BPMN extraction:", {
        hasBpmn: !!bpmnXml,
        originalLength: contentAfterStoryMap.length,
        cleanedLength: contentAfterBpmn.length,
        bpmnLength: bpmnXml?.length || 0,
        hasStartMarker: contentAfterStoryMap.includes("BPMN_PROCESS_XML_START"),
        hasEndMarker: contentAfterStoryMap.includes("BPMN_PROCESS_XML_END")
    });

    // Extract Mermaid code and clean content (kept for backward compatibility)
    const { cleanedContent: contentAfterMermaid, mermaidCode } = extractMermaidCode(contentAfterBpmn);

    // Remove the knowledge gap tag from the displayed content
    let cleanedContent = contentAfterMermaid.replace(/\[KNOWLEDGE_GAP\]/g, "");

    console.log("Raw answer content:", cleanedContent);
    console.log("Has knowledge gap:", hasGap);
    console.log("Has BPMN XML:", !!bpmnXml);
    console.log("Has Mermaid code:", !!mermaidCode);

    // Continue with existing parsing logic using cleanedContent instead of answer.message.content
    let parsedAnswer = preprocessCitations(cleanedContent.trim());

    // Omit a citation that is still being typed during streaming
    if (isStreaming) {
        let lastIndex = parsedAnswer.length;
        for (let i = parsedAnswer.length - 1; i >= 0; i--) {
            if (parsedAnswer[i] === "]") {
                break;
            } else if (parsedAnswer[i] === "[") {
                lastIndex = i;
                break;
            }
        }
        const truncatedAnswer = parsedAnswer.substring(0, lastIndex);
        parsedAnswer = truncatedAnswer;
    }

    console.log("Parsed answer after streaming check:", parsedAnswer);

    const parts = parsedAnswer.split(/\[([^\]]+)\]/g);
    console.log("Split parts:", parts);

    const fragments: string[] = parts.map((part: string, index: number) => {
        if (index % 2 === 0) {
            return part;
        } else {
            console.log("Processing potential citation:", part);

            // Check if this contains multiple citations (common error pattern)
            if (part.includes(", ")) {
                console.warn("WARNING: Found combined citations, attempting to split:", part);

                // Try to split combined citations
                const splitCitations = part.split(/,\s*/);
                const fragmentParts: string[] = [];

                splitCitations.forEach((subCitation: string) => {
                    // Clean the citation first
                    const cleanedCitation = cleanCitation(subCitation);
                    if (!cleanedCitation) {
                        return; // Skip invalid citations
                    }

                    if (isCitationValid(contextDataPoints, cleanedCitation)) {
                        const details = parseCitation(cleanedCitation);
                        let citationIndex: number;

                        if (citations.indexOf(cleanedCitation) !== -1) {
                            citationIndex = citations.indexOf(cleanedCitation) + 1;
                        } else {
                            citations.push(cleanedCitation);
                            citationIndex = citations.length;
                            citationDetails.set(cleanedCitation, details);
                        }

                        fragmentParts.push(
                            renderToStaticMarkup(
                                <a
                                    className="supContainer"
                                    title={details.title}
                                    onClick={() => onCitationClicked(cleanedCitation)}
                                    data-citation-index={citationIndex}
                                    data-citation-type={details.isConfluence ? "confluence" : "azure"}
                                >
                                    <sup>{citationIndex}</sup>
                                </a>
                            )
                        );
                    } else {
                        console.warn("Citation validation failed for split citation:", cleanedCitation);
                    }
                });

                return fragmentParts.join("") || `[${part}]`; // Return original if all citations invalid
            }

            // Single citation processing
            // Clean the citation first
            const cleanedCitation = cleanCitation(part);
            if (!cleanedCitation) {
                console.warn("Citation cleaning failed, keeping as text:", part);
                return `[${part}]`;
            }

            if (!isCitationValid(contextDataPoints, cleanedCitation)) {
                console.log("Citation validation failed, keeping as text:", cleanedCitation);
                return `[${part}]`;
            }

            // Parse the citation to get details
            const details = parseCitation(cleanedCitation);
            let citationIndex: number;

            // Store citation details for later use
            if (citations.indexOf(cleanedCitation) !== -1) {
                citationIndex = citations.indexOf(cleanedCitation) + 1;
            } else {
                citations.push(cleanedCitation);
                citationIndex = citations.length;
                citationDetails.set(cleanedCitation, details);
                console.log("Added new citation:", cleanedCitation, "with index:", citationIndex, "details:", details);
            }

            // Create the citation link with type attribute for debugging
            return renderToStaticMarkup(
                <a
                    className="supContainer"
                    title={details.title}
                    onClick={() => onCitationClicked(cleanedCitation)}
                    data-citation-index={citationIndex}
                    data-citation-type={details.isConfluence ? "confluence" : "azure"}
                >
                    <sup>{citationIndex}</sup>
                </a>
            );
        }
    });

    console.log("Final citations array:", citations);
    console.log("Citation details map:", citationDetails);

    return {
        answerHtml: fragments.join(""),
        citations,
        citationDetails,
        hasKnowledgeGap: hasGap,
        mermaidCode,
        bpmnXml,
        storyMapHtml,
        storyMapTitle
    };
}
