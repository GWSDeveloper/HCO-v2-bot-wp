const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");
const { getGroupConfig, updateGroupConfig, applyToLinkedGroups, findGroupsetsContaining } = require("../lib/store");

const VALID_TYPES = ["gif", "video", "voice", "document", "photo", "sticker"];
const VALID_PUNISHMENTS = ["warn", "kick", "delete"];

const HELP_TEXT = `
📋 *.media commands:*

.media on / off — enable/disable the media guard
.media block <type> — block a media type (${VALID_TYPES.join(", ")})
.media allow <type> — unblock a media type
.media punish <warn|kick|delete> — set punishment
.media status — show current settings

Add "sync" at the end of on/off/block/allow/punish to apply the change
to every group linked via .groupset, not just this one.
(e.g. ".media block gif sync")
`.trim();

function stripSync(parts) {
    if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === "sync") {
        return { rest: parts.slice(0, -1), sync: true };
    }
    return { rest: parts, sync: false };
}

function syncSuffix(sync, updatedGroupIds) {
    if (!sync) return "";
    if (updatedGroupIds.length <= 1) return "\n\n⚠️ Synced, but this group isn't linked to any groupset — only this group was updated.";
    return `\n\n🔗 Synced to ${updatedGroupIds.length} linked group(s).`;
}

/**
 * Handles ".media ..." admin subcommands to configure the media guard
 * for the current group. Returns true if it handled the message.
 */
async function handleMediaConfig(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.media\b/i.test(text)) return false;

    const rawArgs = text.replace(/^\.media/i, "").trim().split(/\s+/).filter(Boolean);
    const [sub, ...afterSub] = rawArgs;

    if (!sub || sub.toLowerCase() === "help") {
        await sock.sendMessage(groupId, { text: HELP_TEXT });
        return true;
    }

    const subLower = sub.toLowerCase();
    const { rest, sync } = stripSync(afterSub);
    const value = rest[0];

    const apply = (patchFn) => sync ? applyToLinkedGroups(groupId, patchFn) : { config: updateGroupConfig(groupId, patchFn), updatedGroupIds: [groupId] };

    if (subLower === "on" || subLower === "off") {
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.media.enabled = subLower === "on"; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Media guard turned *${subLower.toUpperCase()}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "block" || subLower === "allow") {
        const type = (value || "").toLowerCase();
        if (!VALID_TYPES.includes(type)) {
            await sock.sendMessage(groupId, { text: `⚠️ Invalid type. Use one of: ${VALID_TYPES.join(", ")}` });
            return true;
        }
        const { config, updatedGroupIds } = apply((cfg) => {
            const blocked = new Set(cfg.guards.media.blocked);
            if (subLower === "block") blocked.add(type); else blocked.delete(type);
            cfg.guards.media.blocked = [...blocked];
            return cfg;
        });
        await sock.sendMessage(groupId, {
            text: `✅ *${type}* is now ${subLower === "block" ? "blocked" : "allowed"}.\nCurrently blocked: ${config.guards.media.blocked.join(", ") || "none"}${syncSuffix(sync, updatedGroupIds)}`
        });
        return true;
    }

    if (subLower === "punish") {
        const punishment = (value || "").toLowerCase();
        if (!VALID_PUNISHMENTS.includes(punishment)) {
            await sock.sendMessage(groupId, { text: `⚠️ Invalid punishment. Use one of: ${VALID_PUNISHMENTS.join(", ")}` });
            return true;
        }
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.media.punishment = punishment; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Media guard punishment set to *${punishment}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "status") {
        const config = getGroupConfig(groupId);
        const m = config.guards.media;
        const linkedSets = findGroupsetsContaining(groupId);
        await sock.sendMessage(groupId, {
            text: `📊 *Media Guard Status*\n\nEnabled: ${m.enabled ? "✅ Yes" : "❌ No"}\nBlocked types: ${m.blocked.join(", ") || "none"}\nPunishment: ${m.punishment}\nLinked groupsets: ${linkedSets.join(", ") || "none"}`
        });
        return true;
    }

    await sock.sendMessage(groupId, { text: HELP_TEXT });
    return true;
}

module.exports = { handleMediaConfig };

