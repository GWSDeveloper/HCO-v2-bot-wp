const { getText, getGroupId, getSenderJid, toBareId, isAuthorized, kickMember, extractTargetJid } = require("../lib/helpers");

/**
 * Handles admin commands (.ping, .kick, .delete) in group chats.
 * Returns true if this handler consumed the message (so index.js
 * can skip passing it to other command modules), false otherwise.
 */
async function handleAdmin(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false; // admin commands are group-only

    const sender = getSenderJid(msg);
    if (!sender) return false;

    const senderId = toBareId(sender);
    const authorized = isAuthorized(senderId);
    if (!authorized) return false;

    const text = getText(msg.message);
    const commandText = text.toLowerCase();

    // ----- .ping -----
    if (commandText === '.ping') {
        await sock.sendMessage(groupId, { text: '🏓 Pong!' });
        return true;
    }

    // ----- .kick @user (also works via reply, or typed number) -----
    if (commandText.startsWith('.kick')) {
        const targetJid = extractTargetJid(msg, text, ".kick");
        if (!targetJid) {
            await sock.sendMessage(groupId, { text: '⚠️ Tag a user, reply to their message, or type .kick <number>' });
            return true;
        }

        const targetId = toBareId(targetJid);
        const botId = toBareId(sock.user.id);

        if (targetId === botId) {
            await sock.sendMessage(groupId, { text: '❌ I cannot kick myself!' });
            return true;
        }

        if (isAuthorized(targetId)) {
            await sock.sendMessage(groupId, { text: '❌ This user is a protected Admin and cannot be kicked.' });
            return true;
        }

        try {
            await kickMember(sock, groupId, targetJid);
            await sock.sendMessage(groupId, { text: `✅ *Member [${targetId}] has been kicked successfully!*` });
        } catch (error) {
            await sock.sendMessage(groupId, { text: '❌ Failed to kick (Make sure bot is Admin): ' + error.message });
        }
        return true;
    }

    // ----- .delete (reply to a message) -----
    if (commandText === '.delete') {
        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
        if (!contextInfo || !contextInfo.stanzaId) {
            await sock.sendMessage(groupId, { text: '⚠️ Reply to a message with .delete to remove it.' });
            return true;
        }

        try {
            const botBareId = toBareId(sock.user.id);
            await sock.sendMessage(groupId, {
                delete: {
                    remoteJid: groupId,
                    fromMe: contextInfo.participant === botBareId + '@s.whatsapp.net',
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                }
            });
        } catch (error) {
            await sock.sendMessage(groupId, { text: '❌ Failed to delete (Make sure bot is Admin): ' + error.message });
        }
        return true;
    }

    return false;
}

module.exports = { handleAdmin };

