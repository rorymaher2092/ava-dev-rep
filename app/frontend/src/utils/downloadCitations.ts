export const downloadCitation = async (citation: string) => {
    // Full URL? –> just let the browser handle it.
    if (/^https?:\/\//i.test(citation)) {
        const a = document.createElement("a");
        a.href = citation;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.download = citation.split("/").pop() ?? "download";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
    }

    // Otherwise assume it’s a blob‐relative path, e.g. “policies/LeavePolicy.pdf”
    try {
        const res = await fetch(`/api/download?blobName=${encodeURIComponent(citation)}`, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = citation.split("/").pop() ?? "file";
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Download failed", err);
        alert("Sorry, I couldn’t download that file.");
    }
};
