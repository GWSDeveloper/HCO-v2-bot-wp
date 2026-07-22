const { getAdmins, addAdmin, removeAdmin } = require("./store");

// ---------------------------------------------------------------------
// OWNER — hardcoded on purpose. This is the most sensitive tier (can
// grant/revoke admins, broadcast, etc), so it's not editable at runtime
// via WhatsApp commands — only by editing this file directly.
// ---------------------------------------------------------------------
const OWNER_IDS = [
    "55126324682860",
    "20766921859270",
//    "103629591687360", // LID form seen inside groups — see helpers.js note
];

/** True if the bare user id is the bot owner. */
function isOwner(userId) {
    return OWNER_IDS.includes(userId);
}

/**
 * True if the bare user id is a private-tier admin (or owner — owners
 * always pass admin checks too).
 */
function isPrivate(userId) {
    if (isOwner(userId)) return true;
    return getAdmins().includes(userId);
}

/** Everyone passes the public tier — kept for readability at call sites. */
function isPublic(_userId) {
    return true;
}

module.exports = {
    OWNER_IDS,
    isOwner,
    isPrivate,
    isPublic,
    getAdmins,
    addAdmin,
    removeAdmin
};

