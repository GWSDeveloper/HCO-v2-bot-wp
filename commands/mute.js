const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");

/**
 * Handles .mute / .unmute — toggles WhatsApp's native
 * "only admins can send messages" group setting.
 * Returns true if it handled the message.
 */
async function handleMute(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim().toLowerCase();

    if (text === ".mute") {
        try {
            await sock.groupSettingUpdate(groupId, 'announcement'); // only admins can send
            await sock.sendMessage(groupId, { text: "🔇 Group muted — only admins can send messages now." });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `❌ Failed to mute (bot must be a group admin): ${error.message}` });
        }
        return true;
    }

    if (text === ".unmute") {
        try {
            await sock.groupSettingUpdate(groupId, 'not_announcement'); // everyone can send
            await sock.sendMessage(groupId, { text: "🔊 Group unmuted — everyone can send messages again." });
        } catch (error) {
            await sock.sendMessage(groupId, { text: `❌ Failed to unmute (bot must be a group admin): ${error.message}` });
        }
        return true;
    }

    return false;
}

module.exports = { handleMute };

