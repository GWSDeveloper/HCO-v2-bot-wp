const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");
const { getGroupsets, createGroupset, deleteGroupset, addToGroupset, removeFromGroupset, findGroupsetsContaining } = require("../lib/store");

const HELP_TEXT = `
🔗 *.groupset commands:*

.groupset create <name> <jid1> <jid2> ... — create/overwrite a set of linked groups
.groupset add <name> — link the CURRENT group to a set
.groupset remove <name> — unlink the CURRENT group from a set
.groupset delete <name> — delete a set entirely
.groupset list — show all sets and their groups
.groupset here — show which set(s) this group belongs to

Once groups are linked, add "sync" at the end of a supported command
(e.g. ".antibadword add fuck sync") to apply that change to every
group in the same set(s), not just this one.

Get a group's JID with .jid inside that group.
`.trim();

async function handleGroupset(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    const target = groupId || msg.key.remoteJid;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.groupset\b/i.test(text)) return false;

    const rest = text.replace(/^\.groupset/i, "").trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    const [sub, ...args] = parts;
    const subLower = (sub || "").toLowerCase();

    if (!sub || subLower === "help") {
        await sock.sendMessage(target, { text: HELP_TEXT });
        return true;
    }

    if (subLower === "create") {
        const [name, ...jids] = args;
        if (!name || jids.length === 0) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .groupset create <name> <jid1> <jid2> ..." });
            return true;
        }
        const invalidJids = jids.filter((j) => !j.endsWith("@g.us"));
        if (invalidJids.length > 0) {
            await sock.sendMessage(target, { text: `⚠️ These don't look like group JIDs (must end in @g.us): ${invalidJids.join(", ")}` });
            return true;
        }
        const saved = createGroupset(name.toLowerCase(), jids);
        await sock.sendMessage(target, { text: `✅ Groupset \`${name}\` created with ${saved.length} group(s).` });
        return true;
    }

    if (subLower === "add") {
        const name = (args[0] || "").toLowerCase();
        if (!name) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .groupset add <name> (run this inside the group you want to link)" });
            return true;
        }
        if (!groupId) {
            await sock.sendMessage(target, { text: "⚠️ Run this inside the group you want to add to the set." });
            return true;
        }
        const updated = addToGroupset(name, groupId);
        await sock.sendMessage(target, { text: `✅ This group linked to \`${name}\`. Set now has ${updated.length} group(s).` });
        return true;
    }

    if (subLower === "remove") {
        const name = (args[0] || "").toLowerCase();
        if (!name) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .groupset remove <name> (run this inside the group you want to unlink)" });
            return true;
        }
        if (!groupId) {
            await sock.sendMessage(target, { text: "⚠️ Run this inside the group you want to remove from the set." });
            return true;
        }
        const updated = removeFromGroupset(name, groupId);
        await sock.sendMessage(target, { text: `✅ This group unlinked from \`${name}\`. Set now has ${updated.length} group(s).` });
        return true;
    }

    if (subLower === "delete") {
        const name = (args[0] || "").toLowerCase();
        if (!name) {
            await sock.sendMessage(target, { text: "⚠️ Usage: .groupset delete <name>" });
            return true;
        }
        deleteGroupset(name);
        await sock.sendMessage(target, { text: `✅ Groupset \`${name}\` deleted.` });
        return true;
    }

    if (subLower === "list") {
        const sets = getGroupsets();
        const names = Object.keys(sets);
        if (names.length === 0) {
            await sock.sendMessage(target, { text: "📋 No groupsets created yet." });
            return true;
        }
        const body = names.map((name) => `*${name}* (${sets[name].length} groups):\n${sets[name].map((id) => `  • ${id}`).join("\n")}`).join("\n\n");
        await sock.sendMessage(target, { text: `📋 *Groupsets:*\n\n${body}` });
        return true;
    }

    if (subLower === "here") {
        if (!groupId) {
            await sock.sendMessage(target, { text: "⚠️ Run this inside a group." });
            return true;
        }
        const names = findGroupsetsContaining(groupId);
        const body = names.length ? names.map((n) => `• ${n}`).join("\n") : "(this group isn't linked to any set)";
        await sock.sendMessage(target, { text: `🔗 *This group belongs to:*\n\n${body}` });
        return true;
    }

    await sock.sendMessage(target, { text: HELP_TEXT });
    return true;
}

module.exports = { handleGroupset };

