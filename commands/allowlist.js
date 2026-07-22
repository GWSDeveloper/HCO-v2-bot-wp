const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");
const { getAllowlist, addToAllowlist, removeFromAllowlist } = require("../lib/store");

const HELP_TEXT = `
📋 *Access control commands:*

.allowhere — allow the bot to respond in this chat
.disallowhere — remove this chat from the allowlist
.allow <id> — allow a specific group/DM/LID by its bare ID
.disallow <id> — remove a specific ID from the allowlist
.allowlist — show all currently allowed chats

Note: if the allowlist is empty, the bot responds everywhere (default).
Once you add at least one chat, ONLY listed chats will get replies.
`.trim();

/**
 * Handles .allowhere / .allow / .disallowhere / .disallow / .allowlist.
 * Only authorized admins can run these. Works in both groups and DMs.
 * Returns true if it handled the message.
 */
async function handleAllowlist(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    const remoteJid = msg.key.remoteJid;
    const target = groupId || remoteJid; // where to send the reply

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    const lower = text.toLowerCase();

    if (lower === ".allowhere") {
        const chatId = toBareId(remoteJid);
        addToAllowlist(chatId);
        await sock.sendMessage(target, { text: `✅ This chat (\`${chatId}\`) is now allowed.` });
        return true;
    }

    if (lower === ".disallowhere") {
        const chatId = toBareId(remoteJid);
        removeFromAllowlist(chatId);
        await sock.sendMessage(target, { text: `🚫 This chat (\`${chatId}\`) has been removed from the allowlist.` });
        return true;
    }

    if (lower.startsWith(".allow ")) {
        const id = text.slice(".allow ".length).trim().replace(/[^0-9-]/g, "");
        if (!id) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .allow <id>" });
            return true;
        }
        addToAllowlist(id);
        await sock.sendMessage(target, { text: `✅ ID \`${id}\` added to the allowlist.` });
        return true;
    }

    if (lower.startsWith(".disallow ")) {
        const id = text.slice(".disallow ".length).trim().replace(/[^0-9-]/g, "");
        if (!id) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .disallow <id>" });
            return true;
        }
        removeFromAllowlist(id);
        await sock.sendMessage(target, { text: `🚫 ID \`${id}\` removed from the allowlist.` });
        return true;
    }

    if (lower === ".allowlist") {
        const list = getAllowlist();
        const body = list.length
            ? list.map((id) => `• ${id}`).join("\n")
            : "(empty — bot responds everywhere)";
        await sock.sendMessage(target, { text: `📋 *Allowed chats:*\n\n${body}` });
        return true;
    }

    if (lower === ".access" || lower === ".access help") {
        await sock.sendMessage(target, { text: HELP_TEXT });
        return true;
    }

    return false;
}

module.exports = { handleAllowlist };

