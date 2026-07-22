const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");
const { setGlobalMode, setGroupMode, clearGroupMode, resolveMode, getGlobalMode } = require("../lib/store");

const VALID_MODES = ["private", "public"];

const HELP_TEXT = `
🎛️ *.mode commands:*

.mode private — only owner + admins can use the bot here
.mode public — everyone can use public commands here (admin commands stay admin-only)
.mode status — show the effective mode for this chat
.mode reset — clear this group's override, fall back to the global default

📌 Sent in a group: sets that group's mode only.
📌 Sent in your own "Message Yourself" chat: sets the global default
   mode for any group that hasn't set its own override.

For emergencies (locking down ALL groups at once), use .lockdown instead.
`.trim();

/**
 * Handles .mode <private|public|status|reset>. Admin/owner only.
 * Returns true if it handled the message.
 */
async function handleMode(sock, msg) {
    if (!msg.message) return false;

    const text = getText(msg.message).trim();
    if (!/^\.mode\b/i.test(text)) return false; // not a .mode command at all — ignore

    const groupId = getGroupId(msg);
    const remoteJid = msg.key.remoteJid;
    const target = groupId || remoteJid;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const lower = text.toLowerCase();

    if (lower === ".mode" || lower === ".mode help") {
        await sock.sendMessage(target, { text: HELP_TEXT });
        return true;
    }

    if (lower === ".mode status") {
        const effective = resolveMode(groupId);
        const scope = groupId ? "this group" : "global default";
        await sock.sendMessage(target, { text: `🎛️ Current mode for ${scope}: *${effective}*\n(Global default: ${getGlobalMode()})` });
        return true;
    }

    if (lower === ".mode reset") {
        if (!groupId) {
            await sock.sendMessage(target, { text: "⚠️ .mode reset only applies inside a group." });
            return true;
        }
        clearGroupMode(groupId);
        await sock.sendMessage(target, { text: `♻️ This group's mode override cleared. Now using global default: *${getGlobalMode()}*.` });
        return true;
    }

    const match = lower.match(/^\.mode\s+(private|public)$/);
    if (match) {
        const mode = match[1];

        // A bot's own "Message Yourself" chat has remoteJid === the bot's
        // own number/lid and is NOT a group — that's our global-scope signal.
        const isSelfChat = !groupId && toBareId(remoteJid) === senderId;

        if (isSelfChat) {
            setGlobalMode(mode);
            await sock.sendMessage(target, { text: `🌐 Global default mode set to *${mode}*.\nApplies to any group without its own override.` });
        } else if (groupId) {
            setGroupMode(groupId, mode);
            await sock.sendMessage(target, { text: `🎛️ This group's mode set to *${mode}*.` });
        } else {
            // DM with someone other than self (shouldn't normally happen for an
            // authorized admin messaging the bot, but handle gracefully)
            await sock.sendMessage(target, { text: "⚠️ .mode can be set in a group, or in your own 'Message Yourself' chat for the global default." });
        }
        return true;
    }

    await sock.sendMessage(target, { text: HELP_TEXT });
    return true;
}

module.exports = { handleMode, VALID_MODES };

