const { getText, getGroupId, getSenderJid, toBareId, extractTargetJid } = require("../lib/helpers");
const { isOwner, getAdmins, addAdmin, removeAdmin } = require("../lib/permissions");

const HELP_TEXT = `
👑 *Owner commands:*

.setadmin <id> — grant private-tier admin access
.removeadmin <id> — revoke admin access
.admins — list current admins

Tip: reply to a user's message with .setadmin (no id needed) to grant
them access directly.
`.trim();

/**
 * Handles .setadmin / .removeadmin / .admins. Owner-only.
 * Returns true if it handled the message.
 */
async function handleOwner(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    const target = groupId || msg.key.remoteJid;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isOwner(senderId)) return false;

    const text = getText(msg.message).trim();
    const lower = text.toLowerCase();

    if (lower === ".owner" || lower === ".owner help") {
        await sock.sendMessage(target, { text: HELP_TEXT });
        return true;
    }

    if (lower.startsWith(".setadmin")) {
        const targetJid = extractTargetJid(msg, text, ".setadmin");
        const id = toBareId(targetJid);
        if (!id) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .setadmin <id>, or reply/tag a user." });
            return true;
        }

        addAdmin(id);
        await sock.sendMessage(target, { text: `✅ \`${id}\` is now a private-tier admin.` });
        return true;
    }

    if (lower.startsWith(".removeadmin")) {
        const targetJid = extractTargetJid(msg, text, ".removeadmin");
        const id = toBareId(targetJid);
        if (!id) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .removeadmin <id>, or reply/tag a user." });
            return true;
        }

        removeAdmin(id);
        await sock.sendMessage(target, { text: `🚫 \`${id}\` removed from admins.` });
        return true;
    }

    if (lower === ".admins") {
        const admins = getAdmins();
        const body = admins.length ? admins.map((id) => `• ${id}`).join("\n") : "(no dynamic admins yet)";
        await sock.sendMessage(target, { text: `👑 *Admins:*\n\n${body}` });
        return true;
    }

    return false;
}

module.exports = { handleOwner };

