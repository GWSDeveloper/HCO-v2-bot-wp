const { getText, getGroupId, getSenderJid, toBareId, isAuthorized } = require("../lib/helpers");

/**
 * Handles ".add <number>" — adds a member to the current group directly
 * by phone number (country code, digits only). Admin/owner only.
 * Returns true if it handled the message.
 */
async function handleAddMember(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false; // group-only command

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    if (!isAuthorized(senderId)) return false;

    const text = getText(msg.message).trim();
    if (!/^\.add\b/i.test(text)) return false;

    const rawNumber = text.replace(/^\.add/i, "").trim();
    const number = rawNumber.replace(/[^0-9]/g, "");

    if (!number) {
        await sock.sendMessage(groupId, { text: "⚠️ Usage: .add <number with country code>\nExample: .add 919876543210" });
        return true;
    }

    const jid = `${number}@s.whatsapp.net`;

    try {
        const result = await sock.groupParticipantsUpdate(groupId, [jid], 'add');
        const status = result?.[0]?.status;

        if (status === '200' || status === 200) {
            await sock.sendMessage(groupId, { text: `✅ Added \`${number}\` to the group.` });
        } else if (status === '403' || status === 403) {
            // WhatsApp privacy settings blocked a direct add — fall back to an invite link
            try {
                const inviteCode = await sock.groupInviteCode(groupId);
                await sock.sendMessage(groupId, {
                    text: `⚠️ Couldn't add \`${number}\` directly (their privacy settings block it).\nSend them this invite link instead:\nhttps://chat.whatsapp.com/${inviteCode}`
                });
            } catch (_) {
                await sock.sendMessage(groupId, { text: `⚠️ Couldn't add \`${number}\` directly, and failed to generate an invite link.` });
            }
        } else {
            await sock.sendMessage(groupId, { text: `⚠️ Add request sent for \`${number}\`, status: ${status ?? "unknown"}.` });
        }
    } catch (error) {
        await sock.sendMessage(groupId, { text: `❌ Failed to add \`${number}\`: ${error.message}` });
    }

    return true;
}

module.exports = { handleAddMember };

