const { getText, getGroupId, getSenderJid, toBareId, isAuthorized, resolveKickableJid, extractTargetJid } = require("../lib/helpers");

/**
 * Handles .promote / .demote — makes a member a WhatsApp group admin
 * or removes their admin status. This is WhatsApp's own admin role,
 * separate from this bot's owner/private/public permission tiers.
 * Works with @tag, replying to their message, or a typed number.
 * Returns true if it handled the message.
 */
async function handlePromote(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    const lower = text.toLowerCase();

    if (lower.startsWith(".promote")) {
        const targetJid = extractTargetJid(msg, text, ".promote");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Tag a user, reply to their message, or type .promote <number>." });
            return true;
        }
        try {
            const kickableJid = await resolveKickableJid(sock, groupId, targetJid);
            await sock.groupParticipantsUpdate(groupId, [kickableJid], 'promote');
            await sock.sendMessage(groupId, { text: `✅ @${toBareId(targetJid)} is now a WhatsApp group admin.`, mentions: [targetJid] });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `❌ Failed to promote: ${error.message}` });
        }
        return true;
    }

    if (lower.startsWith(".demote")) {
        const targetJid = extractTargetJid(msg, text, ".demote");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Tag a user, reply to their message, or type .demote <number>." });
            return true;
        }
        try {
            const kickableJid = await resolveKickableJid(sock, groupId, targetJid);
            await sock.groupParticipantsUpdate(groupId, [kickableJid], 'demote');
            await sock.sendMessage(groupId, { text: `✅ @${toBareId(targetJid)} is no longer a WhatsApp group admin.`, mentions: [targetJid] });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `❌ Failed to demote: ${error.message}` });
        }
        return true;
    }

    return false;
}

module.exports = { handlePromote };

