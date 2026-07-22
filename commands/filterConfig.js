const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");
const { getGroupConfig, updateGroupConfig, applyToLinkedGroups, findGroupsetsContaining } = require("../lib/store");

const HELP_TEXT = `
🌹 *.filter commands:*

.filter <name> — reply to a message with this to save it as that filter's response
.filter remove <name> — delete a filter
.filter list — show all filter names in this group
.filter info <name> — show a filter's trigger word and full response
.filter on / off — enable/disable the whole filter system here

Add "sync" at the end of "<name>"/remove/on/off to apply the change to
every group linked via .groupset, not just this one.
(e.g. ".filter intro sync" while replying, or ".filter remove intro sync")

How it works: once saved, any message in this group containing
<name> as a standalone word will get that saved reply automatically.

Example:
  (reply to "Welcome! Read the rules before posting.")
  .filter welcome
  → now anyone typing "welcome" gets that reply.
`.trim();

/** Extracts the raw text of the message being replied to, if any. */
function getQuotedText(msg) {
    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) return null;
    return quotedMsg.conversation
        || quotedMsg.extendedTextMessage?.text
        || quotedMsg.imageMessage?.caption
        || quotedMsg.videoMessage?.caption
        || null;
}

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
 * Handles .filter <name> / .filter remove/list/info/on/off. Admin/owner
 * only. Returns true if it handled the message.
 */
async function handleFilterConfig(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.filter\b/i.test(text)) return false;

    const rawParts = text.replace(/^\.filter/i, "").trim().split(/\s+/).filter(Boolean);
    const [sub, ...restParts] = rawParts;
    const subLower = (sub || "").toLowerCase();

    if (!sub || subLower === "help") {
        await sock.sendMessage(groupId, { text: HELP_TEXT });
        return true;
    }

    const apply = (patchFn, sync) => sync ? applyToLinkedGroups(groupId, patchFn) : { config: updateGroupConfig(groupId, patchFn), updatedGroupIds: [groupId] };

    if (subLower === "on" || subLower === "off") {
        const { sync } = stripSync(restParts);
        const { updatedGroupIds } = apply((cfg) => { cfg.filters.enabled = subLower === "on"; return cfg; }, sync);
        await sock.sendMessage(groupId, { text: `✅ Filters turned *${subLower.toUpperCase()}* for this group.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "list") {
        const config = getGroupConfig(groupId);
        const names = Object.keys(config.filters.items);
        const body = names.length ? names.map((n) => `• ${n}`).join("\n") : "(no filters saved yet)";
        await sock.sendMessage(groupId, { text: `🌹 *Filters in this group:*\n\n${body}` });
        return true;
    }

    if (subLower === "remove") {
        const { rest, sync } = stripSync(restParts);
        const name = rest.join(" ").toLowerCase().trim();
        if (!name) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .filter remove <name> [sync]" });
            return true;
        }
        const existing = getGroupConfig(groupId);
        if (!existing.filters.items[name]) {
            await sock.sendMessage(groupId, { text: `⚠️ No filter named \`${name}\` exists.` });
            return true;
        }
        const { updatedGroupIds } = apply((cfg) => { delete cfg.filters.items[name]; return cfg; }, sync);
        await sock.sendMessage(groupId, { text: `✅ Filter \`${name}\` removed.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "info") {
        const name = restParts.join(" ").toLowerCase().trim();
        if (!name) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .filter info <name>" });
            return true;
        }
        const config = getGroupConfig(groupId);
        const response = config.filters.items[name];
        if (!response) {
            await sock.sendMessage(groupId, { text: `⚠️ No filter named \`${name}\` exists.` });
            return true;
        }
        await sock.sendMessage(groupId, { text: `🌹 *Filter:* ${name}\n\n*Response:*\n${response}` });
        return true;
    }

    // Anything else is treated as: .filter <name> [sync] — save a new filter.
    // Requires a reply to the message that should become the response.
    const { rest, sync } = stripSync(rawParts);
    const name = rest.join(" ").toLowerCase().trim();
    if (!name || /\s/.test(name)) {
        await sock.sendMessage(groupId, { text: "⚠️ Filter names must be a single word. Usage: reply to a message with `.filter <name>`" });
        return true;
    }

    const quotedText = getQuotedText(msg);
    if (!quotedText) {
        await sock.sendMessage(groupId, { text: "⚠️ Reply to the message you want saved, with `.filter <name>`." });
        return true;
    }

    const { config, updatedGroupIds } = apply((cfg) => { cfg.filters.items[name] = quotedText; return cfg; }, sync);

    await sock.sendMessage(groupId, {
        text: `✅ Filter \`${name}\` saved. (${Object.keys(config.filters.items).length} total)\nAnyone typing "${name}" will now get that reply.${syncSuffix(sync, updatedGroupIds)}`
    });
    return true;
}

module.exports = { handleFilterConfig, getQuotedText };

