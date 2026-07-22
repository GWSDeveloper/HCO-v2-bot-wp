const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

/**
 * Regex to detect links in message text: full URLs (http/https), www.
 * prefixed domains, AND bare domains like "youtube.com" or "example.org"
 * with no scheme/www prefix at all. The bare-domain part is restricted
 * to a common TLD list so things like "file.txt" or "v1.2.3" aren't
 * misdetected as links.
 */
const COMMON_TLDS = "com|org|net|io|co|in|dev|app|xyz|me|info|biz|gov|edu|ai|so|to|us|uk|ca|de|fr|jp|cn|ru|link|site|online|store|tech|club|live|tv|gg";
const URL_REGEX = new RegExp(
    `https?:\\/\\/\\S+` +                                  // http(s)://...
    `|www\\.\\S+` +                                          // www....
    `|\\b(?:[a-z0-9-]+\\.)+(?:${COMMON_TLDS})\\b(?:\\/\\S*)?`, // bare-domain.tld
    "gi"
);

/**
 * Extracts the plain text body from any supported message type
 * (conversation, extended text, or image/video caption).
 */
function getText(message) {
    if (!message) return "";
    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        ""
    ).trim();
}

/** True if the message was sent in a group chat. */
function isGroupMessage(msg) {
    return !!msg.key.remoteJid?.endsWith('@g.us');
}

/** Returns the group JID if this is a group message, else null. */
function getGroupId(msg) {
    return isGroupMessage(msg) ? msg.key.remoteJid : null;
}

/**
 * Returns the raw sender JID (participant for group messages,
 * remoteJid for DMs).
 */
function getSenderJid(msg) {
    return isGroupMessage(msg) ? (msg.key.participant || msg.participant) : msg.key.remoteJid;
}

/** Strips a JID down to the bare numeric/user id (no @server, no :device). */
function toBareId(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
}

/**
 * Extracts a "target user" JID for admin commands that act on a person
 * (.kick, .warn, .promote, .add-to-blacklist, etc). Checks, in order:
 *   1. An @mentioned user in the message
 *   2. The author of a message being replied to
 *   3. A phone number typed directly after the command
 *
 * @param {object} msg - the raw Baileys message
 * @param {string} text - the message's text body (already extracted via getText)
 * @param {string} commandPrefix - e.g. ".warn" — stripped off when looking for a typed number
 * @returns {string|null} a JID like "919876543210@s.whatsapp.net", or null if none found
 */
function extractTargetJid(msg, text, commandPrefix) {
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (mentioned) return mentioned;

    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedParticipant) return quotedParticipant;

    // fall back to a typed number after the command
    const escapedPrefix = commandPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const typed = text.replace(new RegExp(`^${escapedPrefix}`, "i"), "").trim().split(/\s+/)[0];
    const digits = (typed || "").replace(/[^0-9]/g, "");
    return digits ? `${digits}@s.whatsapp.net` : null;
}

/** Downloads an image message and returns it as a Buffer. */
async function downloadImage(imageMessage) {
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// ---------------------------------------------------------------------
// Permission checks — delegates to lib/permissions.js (owner hardcoded,
// admin dynamic via .setadmin). isAuthorized() is kept as an alias for
// isPrivate() so existing command modules don't need changes.
// ---------------------------------------------------------------------
const { isOwner, isPrivate } = require("./permissions");

/** True if the bare user id is an owner or a private-tier admin. */
function isAuthorized(senderId) {
    return isPrivate(senderId);
}

// ---------------------------------------------------------------------
// Shared punishment engine — used by every guard (media, antilink,
// antispam, antiforward, ...) so punishment behavior stays consistent
// and warning counts are tracked in one place.
// ---------------------------------------------------------------------

const { updateGroupConfig } = require("./store");

/**
 * Resolves the JID that WhatsApp will actually accept for
 * groupParticipantsUpdate. If `jid` is already a phone-number JID
 * (@s.whatsapp.net), it's returned as-is. If it's a @lid, we look up the
 * group's participant list (which includes both jid and lid pairings)
 * and return the matching phone-number JID — kicking a raw @lid can
 * silently no-op on some WhatsApp versions.
 */
async function resolveKickableJid(sock, groupId, jid) {
    if (!jid.endsWith('@lid')) return jid;

    try {
        const metadata = await sock.groupMetadata(groupId);
        const participant = metadata.participants.find((p) => p.id === jid || p.lid === jid);
        if (participant) {
            // Prefer the phone-number JID if Baileys exposed one alongside the lid
            if (participant.jid && participant.jid.endsWith('@s.whatsapp.net')) return participant.jid;
            if (participant.id && participant.id.endsWith('@s.whatsapp.net')) return participant.id;
        }
    } catch (_) { /* fall through and try the lid directly as a last resort */ }

    return jid;
}

/**
 * Removes a member from a group, resolving @lid to a phone-JID first
 * so the removal actually takes effect (see resolveKickableJid above).
 * Both call sites in applyPunishment share this so the LID fix only
 * needs to live in one place.
 */
async function kickMember(sock, groupId, jid) {
    const kickableJid = await resolveKickableJid(sock, groupId, jid);
    await sock.groupParticipantsUpdate(groupId, [kickableJid], 'remove');
}

/**
 * Applies a punishment ("warn" | "kick" | "delete") to a message sender
 * in a group. Warn punishments escalate to a kick after 3 warnings.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} groupId
 * @param {object} msg - the original message object (for deletion/quoting)
 * @param {string} reasonText - human-readable reason shown in the warning message
 * @param {"warn"|"kick"|"delete"} punishment
 */
async function applyPunishment(sock, groupId, msg, reasonText, punishment) {
    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);

    // Always try to delete the offending message first, regardless of
    // punishment type, unless the punishment is explicitly "warn"-only
    // with no deletion desired. Guards can opt out by passing punishment
    // "warn-only" if ever needed; for now warn/kick/delete all delete.
    try {
        await sock.sendMessage(groupId, {
            delete: {
                remoteJid: groupId,
                fromMe: false,
                id: msg.key.id,
                participant: sender
            }
        });
    } catch (_) { /* bot may not be admin, best-effort */ }

    if (punishment === "kick") {
        try {
            await kickMember(sock, groupId, sender);
            await sock.sendMessage(groupId, {
                text: `🚫 @${senderId} was removed.\nReason: ${reasonText}`,
                mentions: [sender]
            });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `⚠️ Tried to kick @${senderId} but failed: ${error.message}`, mentions: [sender] });
        }
        return;
    }

    if (punishment === "delete") {
        await sock.sendMessage(groupId, {
            text: `🗑️ Message from @${senderId} deleted.\nReason: ${reasonText}`,
            mentions: [sender]
        });
        return;
    }

    // Default: "warn" — track count, auto-kick after 3 warnings
    const config = updateGroupConfig(groupId, (cfg) => {
        cfg.warnings[senderId] = (cfg.warnings[senderId] || 0) + 1;
        return cfg;
    });
    const count = config.warnings[senderId];

    if (count >= 3) {
        try {
            await kickMember(sock, groupId, sender);
            await sock.sendMessage(groupId, {
                text: `🚫 @${senderId} reached 3 warnings and was removed.\nLast reason: ${reasonText}`,
                mentions: [sender]
            });
            updateGroupConfig(groupId, (cfg) => { cfg.warnings[senderId] = 0; return cfg; });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `⚠️ @${senderId} hit 3 warnings but kick failed: ${error.message}`, mentions: [sender] });
        }
    } else {
        await sock.sendMessage(groupId, {
            text: `⚠️ @${senderId} warned (${count}/3).\nReason: ${reasonText}`,
            mentions: [sender]
        });
    }
}

module.exports = {
    URL_REGEX,
    getText,
    isGroupMessage,
    getGroupId,
    getSenderJid,
    toBareId,
    downloadImage,
    isAuthorized,
    isOwner,
    applyPunishment,
    kickMember,
    resolveKickableJid,
    extractTargetJid
};

