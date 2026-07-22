const { createGuard } = require("../lib/guards/registry");
const { URL_REGEX } = require("../lib/helpers");

/** Extracts all URLs found in a text string. */
function extractUrls(text) {
    return text.match(URL_REGEX) || [];
}

/** Pulls the bare domain (e.g. "github.com") out of a URL string, lowercase. */
function extractDomain(url) {
    try {
        const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
        return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    } catch (_) {
        return null;
    }
}

const handleAntilinkGuard = createGuard({
    key: "antilink",
    detect(message, guardConfig) {
        const text = message.conversation
            || message.extendedTextMessage?.text
            || message.imageMessage?.caption
            || message.videoMessage?.caption
            || "";
        if (!text) return null;

        const urls = extractUrls(text);
        if (urls.length === 0) return null;

        const allowedDomains = guardConfig.allowedDomains || [];

        // If EVERY link found is on the allowlist, let the message through.
        // If even one link isn't allowed, it gets punished.
        const hasDisallowedLink = urls.some((url) => {
            const domain = extractDomain(url);
            if (!domain) return true; // couldn't parse — treat as disallowed to be safe
            return !allowedDomains.includes(domain);
        });

        if (!hasDisallowedLink) return null;
        return "Sharing external links is not allowed here.";
    }
});

module.exports = { handleAntilinkGuard, extractDomain };

