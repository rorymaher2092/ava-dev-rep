import { renderToStaticMarkup } from "react-dom/server";
import { ChatAppResponse, getCitationFilePath } from "../../api";

type HtmlParsedAnswer = {
    answerHtml: string;
    citations: string[];
    citationDetails: Map<string, { url: string; title: string; isUrl: boolean }>;
};

// Helper function to determine if a citation is a URL
function isUrl(citation: string): boolean {
    try {
        // Check if it's our special format first
        if (citation.includes("|||")) {
            const [url] = citation.split("|||");
            new URL(url);
            return true;
        }
        // Otherwise check if it's a plain URL
        new URL(citation);
        return citation.startsWith("http://") || citation.startsWith("https://");
    } catch {
        return false;
    }
}

// Parse citation to extract URL and title
function parseCitation(citation: string): { url: string; title: string; isUrl: boolean } {
    // Check for our special format: "url|||title"
    if (citation.includes("|||")) {
        const [url, title] = citation.split("|||");
        return { url, title, isUrl: true };
    }

    // Check if it's a plain URL
    if (isUrl(citation)) {
        const title = citation.split("/").pop() || "Confluence Page"; // Extract title or default to "Confluence Page"
        return { url: citation, title, isUrl: true };
    }

    // It's a file citation
    return { url: citation, title: citation, isUrl: false };
}

// Function to validate citation format and check if dataPoint contains the citation
function isCitationValid(contextDataPoints: any, citationCandidate: string): boolean {
    console.log("Validating citation:", citationCandidate);

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

    // For any citation format, check if it exists in data points
    const isValid = dataPointsArray.some(dataPoint => {
        // Check if the data point contains or starts with the citation
        const contains =
            dataPoint.includes(citationCandidate) ||
            dataPoint.startsWith(citationCandidate) ||
            // Also check if citation is part of a larger format
            (citationCandidate.includes("|||") && dataPoint.includes(citationCandidate.split("|||")[0]));

        if (contains) {
            console.log("Found matching data point for citation:", citationCandidate);
        }
        return contains;
    });

    // If not found but it's a file format, do the regex check
    if (!isValid && !isUrl(citationCandidate)) {
        const regex = /.+\.\w{1,}(?:#\S*)?$/;
        if (regex.test(citationCandidate)) {
            return dataPointsArray.some(dataPoint => dataPoint.startsWith(citationCandidate));
        }
    }

    console.log("Citation valid:", isValid);
    return isValid;
}

export function parseAnswerToHtml(answer: ChatAppResponse, isStreaming: boolean, onCitationClicked: (citationFilePath: string) => void): HtmlParsedAnswer {
    const contextDataPoints = answer.context.data_points;
    const citations: string[] = [];
    const citationDetails = new Map<string, { url: string; title: string; isUrl: boolean }>();

    console.log("Raw answer content:", answer.message.content);
    console.log("Context data points:", contextDataPoints);

    // Trim any whitespace from the end of the answer
    let parsedAnswer = answer.message.content.trim();

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

    const fragments: string[] = parts.map((part, index) => {
        if (index % 2 === 0) {
            return part;
        } else {
            let citationIndex: number;

            console.log("Processing potential citation:", part);

            if (!isCitationValid(contextDataPoints, part)) {
                console.log("Citation validation failed, keeping as text:", part);
                return `[${part}]`;
            }

            // Parse the citation to get details
            const details = parseCitation(part);

            // Store citation details for later use
            if (citations.indexOf(part) !== -1) {
                citationIndex = citations.indexOf(part) + 1;
            } else {
                citations.push(part);
                citationIndex = citations.length;
                citationDetails.set(part, details);
                console.log("Added new citation:", part, "with index:", citationIndex, "details:", details);
            }

            // Create the citation link
            return renderToStaticMarkup(
                <a
                    className="supContainer"
                    title={details.isUrl ? details.title : part}
                    onClick={() => onCitationClicked(part)}
                    data-citation-index={citationIndex}
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
        citationDetails
    };
}
