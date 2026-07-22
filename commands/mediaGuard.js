const { createGuard } = require("../lib/guards/registry");

/**
 * Detects the media "type" of a message, if any.
 * Types match the strings used in group config:
 * "gif", "video", "voice", "document", "photo", "sticker".
 */
function detectMediaType(message) {
    if (!message) return null;

    if (message.videoMessage) {
        return message.videoMessage.gifPlayback ? "gif" : "video";
    }
    if (message.imageMessage?.gifPlayback === true) {
        return "gif";
    }
    if (message.imageMessage) {
        return "photo";
    }
    if (message.audioMessage?.ptt === true) {
        return "voice";
    }
    if (message.documentMessage) {
        return "document";
    }
    if (message.stickerMessage) {
        return "sticker";
    }
    return null;
}

const LABELS = {
    gif: "GIF",
    video: "Video",
    voice: "Voice Note",
    document: "Document",
    photo: "Photo",
    sticker: "Sticker"
};

const handleMediaGuard = createGuard({
    key: "media",
    detect(message, guardConfig) {
        const mediaType = detectMediaType(message);
        if (!mediaType) return null;
        if (!guardConfig.blocked.includes(mediaType)) return null;
        const label = LABELS[mediaType] || mediaType;
        return `Sending ${label} is not allowed here.`;
    }
});

module.exports = { handleMediaGuard, detectMediaType };

