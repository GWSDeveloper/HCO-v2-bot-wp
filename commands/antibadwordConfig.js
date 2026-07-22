const { getText, getGroupId, isAuthorized, getSenderJid, toBareId } = require("../lib/helpers");
const { getGroupConfig, updateGroupConfig, applyToLinkedGroups, findGroupsetsContaining } = require("../lib/store");

const VALID_PUNISHMENTS = ["warn", "kick", "delete"];

const HELP_TEXT = `
🚫 *.antibadword commands:*

.antibadword on / off — enable/disable the bad-word filter
.antibadword add <word> — add a word/phrase to the block list
.antibadword remove <word> — remove a word/phrase from the block list
.antibadword import — reply to a message with one word per line to bulk-add them all
.antibadword list — show all blocked words
.antibadword punish <warn|kick|delete> — set punishment
.antibadword status — show current settings

Add "sync" at the end of on/off/add/remove/import/punish to apply the
change to every group linked via .groupset, not just this one.
(e.g. ".antibadword add fuck sync")

Note: bot admins/owners are always exempt. Matching is word-boundary
aware — "abc" won't match inside "abcdef".
`.trim();

/** Strips a trailing "sync" token, if present, returning { rest, sync }. */
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

async function handleAntibadwordConfig(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.antibadword\b/i.test(text)) return false;

    const rawParts = text.replace(/^\.antibadword/i, "").trim().split(/\s+/).filter(Boolean);
    const [sub, ...afterSub] = rawParts;

    if (!sub || sub.toLowerCase() === "help") {
        await sock.sendMessage(groupId, { text: HELP_TEXT });
        return true;
    }

    const subLower = sub.toLowerCase();
    const { rest: wordParts, sync } = stripSync(afterSub);
    const wordArg = wordParts.join(" ").toLowerCase().trim();

    const apply = (patchFn) => sync ? applyToLinkedGroups(groupId, patchFn) : { config: updateGroupConfig(groupId, patchFn), updatedGroupIds: [groupId] };

    if (subLower === "on" || subLower === "off") {
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.antibadword.enabled = subLower === "on"; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Antibadword guard turned *${subLower.toUpperCase()}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "add") {
        if (!wordArg) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .antibadword add <word> [sync]" });
            return true;
        }
        const { config, updatedGroupIds } = apply((cfg) => {
            const words = new Set(cfg.guards.antibadword.words);
            words.add(wordArg);
            cfg.guards.antibadword.words = [...words];
            return cfg;
        });
        await sock.sendMessage(groupId, { text: `✅ Added \`${wordArg}\` to the block list. (${config.guards.antibadword.words.length} total)${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "remove") {
        if (!wordArg) {
            await sock.sendMessage(groupId, { text: "⚠️ Usage: .antibadword remove <word> [sync]" });
            return true;
        }
        const { config, updatedGroupIds } = apply((cfg) => {
            cfg.guards.antibadword.words = cfg.guards.antibadword.words.filter((w) => w !== wordArg);
            return cfg;
        });
        await sock.sendMessage(groupId, { text: `✅ Removed \`${wordArg}\` from the block list. (${config.guards.antibadword.words.length} total)${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "import") {
        const { sync: importSync } = stripSync(afterSub);
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quotedMsg?.conversation
            || quotedMsg?.extendedTextMessage?.text
            || "";

        if (!quotedText.trim()) {
            await sock.sendMessage(groupId, { text: "⚠️ Reply to a message containing one word per line with .antibadword import [sync]." });
            return true;
        }

        const newWords = quotedText
            .split(/\r?\n/)
            .map((line) => line.trim().toLowerCase())
            .filter(Boolean);

        if (newWords.length === 0) {
            await sock.sendMessage(groupId, { text: "⚠️ No words found in that message." });
            return true;
        }

        const applyImport = (patchFn) => importSync ? applyToLinkedGroups(groupId, patchFn) : { config: updateGroupConfig(groupId, patchFn), updatedGroupIds: [groupId] };

        const { config, updatedGroupIds } = applyImport((cfg) => {
            const words = new Set(cfg.guards.antibadword.words);
            for (const w of newWords) words.add(w);
            cfg.guards.antibadword.words = [...words];
            return cfg;
        });

        await sock.sendMessage(groupId, {
            text: `✅ Imported ${newWords.length} word(s). Block list now has ${config.guards.antibadword.words.length} total.${syncSuffix(importSync, updatedGroupIds)}`
        });
        return true;
    }

    if (subLower === "list") {
        const config = getGroupConfig(groupId);
        const words = config.guards.antibadword.words;
        const body = words.length ? words.map((w) => `• ${w}`).join("\n") : "(no words blocked yet)";
        await sock.sendMessage(groupId, { text: `📋 *Blocked words:*\n\n${body}` });
        return true;
    }

    if (subLower === "punish") {
        const punishment = wordArg;
        if (!VALID_PUNISHMENTS.includes(punishment)) {
            await sock.sendMessage(groupId, { text: `⚠️ Invalid punishment. Use one of: ${VALID_PUNISHMENTS.join(", ")}` });
            return true;
        }
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.antibadword.punishment = punishment; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Antibadword punishment set to *${punishment}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "status") {
        const config = getGroupConfig(groupId);
        const a = config.guards.antibadword;
        const linkedSets = findGroupsetsContaining(groupId);
        await sock.sendMessage(groupId, {
            text: `📊 *Antibadword Status*\n\nEnabled: ${a.enabled ? "✅ Yes" : "❌ No"}\nWords blocked: ${a.words.length}\nPunishment: ${a.punishment}\nLinked groupsets: ${linkedSets.join(", ") || "none"}`
        });
        return true;
    }

    await sock.sendMessage(groupId, { text: HELP_TEXT });
    return true;
}

module.exports = { handleAntibadwordConfig };

