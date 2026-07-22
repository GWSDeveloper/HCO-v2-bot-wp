const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");

/**
 * Handles .tagall [message] — mentions every group member.
 * WhatsApp shows mention notifications for every JID in the `mentions`
 * array, even though they're not each visibly @-tagged in the text
 * body (keeps the message readable while still pinging everyone).
 * Returns true if it handled the message.
 */
async function handleTagAll(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.tagall\b/i.test(text)) return false;

    const customMessage = text.replace(/^\.tagall/i, "").trim();

    try {
        const metadata = await sock.groupMetadata(groupId);
        const participantJids = metadata.participants.map((p) => p.id);

        const header = customMessage || "📢 Attention everyone!";
        const body = `${header}\n\n${participantJids.map((jid) => `@${toBareId(jid)}`).join(" ")}`;

        await sock.sendMessage(groupId, { text: body, mentions: participantJids });
    } catch (error) {
        await sock.sendMessage(groupId, { text: `❌ Failed to tag everyone: ${error.message}` });
    }

    return true;
}

module.exports = { handleTagAll };

