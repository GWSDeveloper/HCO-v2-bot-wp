const { getText, getGroupId, getSenderJid, toBareId, isOwner, isAuthorized } = require("../lib/helpers");
const { forceGlobalMode, clearLockdown, getGlobalModeState } = require("../lib/store");

const HELP_TEXT = `
🔒 *.lockdown commands* (owner only, except status):

.lockdown owner — instantly restrict EVERY group to owner-only, ignoring any per-group override
.lockdown private — instantly restrict EVERY group to admins+owner only
.lockdown off — release the lockdown; groups go back to their own modes/global default
.lockdown status — show whether a lockdown is currently active (admins can check this too)

Use this for emergencies (raids, spam floods) where you need every
group locked down right now, without visiting each one individually.
`.trim();

/**
 * Handles .lockdown <owner|private|off|status>. Owner-only, except
 * .lockdown status which any admin can check. Works from anywhere
 * (group or DM) since it's a global emergency action.
 * Returns true if it handled the message.
 */
async function handleLockdown(sock, msg) {
    if (!msg.message) return false;

    const text = getText(msg.message).trim();
    if (!/^\.lockdown\b/i.test(text)) return false;

    const groupId = getGroupId(msg);
    const target = groupId || msg.key.remoteJid;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);

    const lower = text.toLowerCase();

    // .lockdown status is admin-tier; everything else is owner-only.
    if (lower === ".lockdown status") {
        if (!isAuthorized(senderId)) return false;
        const state = getGlobalModeState();
        const statusText = state.forced
            ? `🔒 Lockdown ACTIVE — every group is forced to *${state.mode}* mode right now.`
            : `🔓 No lockdown active. Groups follow their own mode/global default.`;
        await sock.sendMessage(target, { text: statusText });
        return true;
    }

    if (!isOwner(senderId)) return false; // everything else is owner-only, silently ignore otherwise

    if (lower === ".lockdown" || lower === ".lockdown help") {
        await sock.sendMessage(target, { text: HELP_TEXT });
        return true;
    }

    if (lower === ".lockdown off") {
        clearLockdown();
        await sock.sendMessage(target, { text: "🔓 Lockdown released. Groups now follow their own mode settings again." });
        return true;
    }

    const match = lower.match(/^\.lockdown\s+(owner|private)$/);
    if (match) {
        const mode = match[1];
        forceGlobalMode(mode);
        await sock.sendMessage(target, {
            text: `🔒 *LOCKDOWN ENGAGED* — every group is now forced to *${mode}* mode, regardless of individual settings.\n\nUse *.lockdown off* to release.`
        });
        return true;
    }

    await sock.sendMessage(target, { text: HELP_TEXT });
    return true;
}

module.exports = { handleLockdown };

