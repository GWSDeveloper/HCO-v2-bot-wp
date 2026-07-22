const { getGroupId, getSenderJid, toBareId, isAuthorized, applyPunishment } = require("../helpers");
const { getGroupConfig } = require("../store");

/**
 * Builds a guard handler from a small definition object, so every guard
 * (media, antilink, antispam, antiforward, ...) shares identical
 * plumbing: group-only, config lookup, admin exemption, and punishment.
 *
 * @param {object} def
 * @param {string} def.key - the guards.<key> field in group config (e.g. "media")
 * @param {(message: object, config: object) => string|null} def.detect
 *        Inspects the raw Baileys message and returns a short reason
 *        string if it should be punished, or null if it's fine. Receives
 *        the guard's own config sub-object as the second argument so
 *        detection can depend on settings (e.g. which types are blocked).
 * @returns {(sock, msg) => Promise<boolean>} a handler ready to drop into index.js's handlers list
 */
function createGuard({ key, detect }) {
    return async function handleGuard(sock, msg) {
        if (!msg.message) return false;

        const groupId = getGroupId(msg);
        if (!groupId) return false;

        const config = getGroupConfig(groupId);
        const guardConfig = config.guards[key];
        if (!guardConfig || !guardConfig.enabled) return false;

        const reason = detect(msg.message, guardConfig);
        if (!reason) return false;

        const sender = getSenderJid(msg);
        const senderId = toBareId(sender);
        if (isAuthorized(senderId)) return false; // admins/owner exempt from all guards

        await applyPunishment(sock, groupId, msg, reason, guardConfig.punishment);
        return true;
    };
}

module.exports = { createGuard };

