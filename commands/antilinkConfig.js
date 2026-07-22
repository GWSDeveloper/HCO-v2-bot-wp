const { getText, getGroupId, isAuthorized, getSenderJid, toBareId } = require("../lib/helpers");
const { getGroupConfig, updateGroupConfig, applyToLinkedGroups, findGroupsetsContaining } = require("../lib/store");
const { extractDomain } = require("./antilinkGuard");

const VALID_PUNISHMENTS = ["warn", "kick", "delete"];

const HELP_TEXT = `
🔗 *.antilink commands:*

.antilink on / off — enable/disable the antilink guard
.antilink allow <domain> — whitelist a domain (e.g. github.com)
.antilink disallow <domain> — remove a domain from the whitelist
.antilink allowed — show all whitelisted domains
.antilink punish <warn|kick|delete> — set punishment
.antilink status — show current settings

Add "sync" at the end of on/off/allow/disallow/punish to apply the
change to every group linked via .groupset, not just this one.
(e.g. ".antilink allow github.com sync")

Note: bot admins/owners are always exempt. A message is only punished
if it contains at least one link that ISN'T on the whitelist.
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

async function handleAntilinkConfig(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.antilink\b/i.test(text)) return false;

    const rawArgs = text.replace(/^\.antilink/i, "").trim().split(/\s+/).filter(Boolean);
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
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.antilink.enabled = subLower === "on"; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Antilink guard turned *${subLower.toUpperCase()}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "allow" || subLower === "disallow") {
        if (!value) {
            await sock.sendMessage(groupId, { text: `⚠️ Usage: .antilink ${subLower} <domain> [sync]\nExample: .antilink allow github.com` });
            return true;
        }
        const domain = extractDomain(value) || value.toLowerCase().replace(/^www\./, "");

        const { config, updatedGroupIds } = apply((cfg) => {
            const domains = new Set(cfg.guards.antilink.allowedDomains || []);
            if (subLower === "allow") domains.add(domain); else domains.delete(domain);
            cfg.guards.antilink.allowedDomains = [...domains];
            return cfg;
        });

        await sock.sendMessage(groupId, {
            text: `✅ \`${domain}\` is now ${subLower === "allow" ? "whitelisted" : "removed from the whitelist"}.\nWhitelisted domains: ${config.guards.antilink.allowedDomains.join(", ") || "none"}${syncSuffix(sync, updatedGroupIds)}`
        });
        return true;
    }

    if (subLower === "allowed") {
        const config = getGroupConfig(groupId);
        const domains = config.guards.antilink.allowedDomains || [];
        const body = domains.length ? domains.map((d) => `• ${d}`).join("\n") : "(no domains whitelisted)";
        await sock.sendMessage(groupId, { text: `📋 *Whitelisted domains:*\n\n${body}` });
        return true;
    }

    if (subLower === "punish") {
        const punishment = (value || "").toLowerCase();
        if (!VALID_PUNISHMENTS.includes(punishment)) {
            await sock.sendMessage(groupId, { text: `⚠️ Invalid punishment. Use one of: ${VALID_PUNISHMENTS.join(", ")}` });
            return true;
        }
        const { updatedGroupIds } = apply((cfg) => { cfg.guards.antilink.punishment = punishment; return cfg; });
        await sock.sendMessage(groupId, { text: `✅ Antilink punishment set to *${punishment}*.${syncSuffix(sync, updatedGroupIds)}` });
        return true;
    }

    if (subLower === "status") {
        const config = getGroupConfig(groupId);
        const a = config.guards.antilink;
        const linkedSets = findGroupsetsContaining(groupId);
        await sock.sendMessage(groupId, {
            text: `📊 *Antilink Status*\n\nEnabled: ${a.enabled ? "✅ Yes" : "❌ No"}\nPunishment: ${a.punishment}\nWhitelisted domains: ${(a.allowedDomains || []).join(", ") || "none"}\nLinked groupsets: ${linkedSets.join(", ") || "none"}`
        });
        return true;
    }

    await sock.sendMessage(groupId, { text: HELP_TEXT });
    return true;
}

module.exports = { handleAntilinkConfig };

