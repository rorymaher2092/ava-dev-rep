import { renderToStaticMarkup } from "react-dom/server";
import { ChatAppResponse, getCitationFilePath } from "../../api";

type HtmlParsedAnswer = {
    answerHtml: string;
    citations: string[];
    citationDetails: Map<string, { url: string; title: string; isConfluence: boolean }>; // Changed from isUrl to isConfluence
};

// Helper function to check if a string is a URL (for validation purposes)
function isUrl(str: string): boolean {
    try {
        new URL(str);
        return str.startsWith("http://") || str.startsWith("https://");
    } catch {
        return false;
    }
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

    // Special handling for Confluence links
    if (citationCandidate.startsWith("CONFLUENCE_LINK|||")) {
        const isValid = dataPointsArray.some(dataPoint => {
            return dataPoint.startsWith(citationCandidate) || dataPoint.includes(citationCandidate);
        });
        if (isValid) {
            console.log("Found matching Confluence link");
            return true;
        }
    }

    // For citations with |||, check if any part matches
    if (citationCandidate.includes("|||")) {
        const parts = citationCandidate.split("|||");
        const url = parts[0];
        const isValid = dataPointsArray.some(dataPoint => {
            return dataPoint.startsWith(citationCandidate) || dataPoint.includes(url) || dataPoint.startsWith(url);
        });
        if (isValid) {
            console.log("Found matching data point for ||| citation");
            return true;
        }
    }

    // Rest of the validation logic remains the same...
    const isValid = dataPointsArray.some(dataPoint => {
        return dataPoint.includes(citationCandidate) || dataPoint.startsWith(citationCandidate);
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
    const citationDetails = new Map<string, { url: string; title: string; isConfluence: boolean }>(); // Changed from isUrl to isConfluence

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
                <a className="supContainer" title={details.title} onClick={() => onCitationClicked(part)} data-citation-index={citationIndex}>
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
