const { getText, getGroupId, getSenderJid, toBareId, isAuthorized, applyPunishment, extractTargetJid } = require("../lib/helpers");
const { getGroupConfig, updateGroupConfig } = require("../lib/store");

const HELP_TEXT = `
⚠️ *.warn commands:*

.warn @user <reason> — manually warn a user (auto-kicks at 3/3)
.unwarn @user — remove one warning
.warnings @user — check a user's current warning count
.resetwarnings @user — clear all warnings for a user

(Works with @tag, replying to their message, or a typed number.)
`.trim();

/**
 * Handles .warn / .unwarn / .warnings / .resetwarnings. Admin/owner only.
 * Returns true if it handled the message.
 */
async function handleWarn(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false; // group-only

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    const lower = text.toLowerCase();

    if (lower === ".warn help") {
        await sock.sendMessage(groupId, { text: HELP_TEXT });
        return true;
    }

    // IMPORTANT: check longer/more-specific commands before the bare
    // ".warn" prefix, since ".warnings"/".unwarn"/".resetwarnings" all
    // start with or contain ".warn" as a substring.
    if (lower.startsWith(".warnings")) {
        const targetJid = extractTargetJid(msg, text, ".warnings");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .warnings @user, or reply to their message." });
            return true;
        }
        const targetId = toBareId(targetJid);
        const config = getGroupConfig(groupId);
        const count = config.warnings[targetId] || 0;
        await sock.sendMessage(groupId, { text: `📊 @${targetId} has ${count}/3 warnings.`, mentions: [targetJid] });
        return true;
    }

    if (lower.startsWith(".resetwarnings")) {
        const targetJid = extractTargetJid(msg, text, ".resetwarnings");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .resetwarnings @user, or reply to their message." });
            return true;
        }
        const targetId = toBareId(targetJid);
        updateGroupConfig(groupId, (cfg) => { cfg.warnings[targetId] = 0; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Warnings cleared for @${targetId}.`, mentions: [targetJid] });
        return true;
    }

    if (lower.startsWith(".unwarn")) {
        const targetJid = extractTargetJid(msg, text, ".unwarn");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .unwarn @user, or reply to their message." });
            return true;
        }
        const targetId = toBareId(targetJid);
        const config = updateGroupConfig(groupId, (cfg) => {
            cfg.warnings[targetId] = Math.max(0, (cfg.warnings[targetId] || 0) - 1);
            return cfg;
        });
        await sock.sendMessage(groupId, {
            text: `✅ @${targetId} now has ${config.warnings[targetId]}/3 warnings.`,
            mentions: [targetJid]
        });
        return true;
    }

    // Bare ".warn" (with a space or end of string after it) — checked last
    // since it's the shortest/most general prefix.
    if (/^\.warn(\s|$)/i.test(text)) {
        const targetJid = extractTargetJid(msg, text, ".warn");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .warn @user <reason>, or reply to their message." });
            return true;
        }

        // reason = whatever's left after stripping the command and any @mention
        const reason = text
            .replace(/^\.warn\s*/i, "")
            .replace(/@\d+/g, "")
            .trim() || "No reason given";

        const targetId = toBareId(targetJid);
        if (isAuthorized(targetId)) {
            await sock.sendMessage(groupId, { text: "❌ Can't warn an admin/owner." });
            return true;
        }

        const fakeMsg = { key: { remoteJid: groupId, participant: targetJid, id: msg.key.id } };
        await applyPunishment(sock, groupId, fakeMsg, reason, "warn");
        return true;
    }

    return false;
}

module.exports = { handleWarn };

