const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data", "groups");
const ALLOWLIST_FILE = path.join(__dirname, "..", "data", "allowlist.json");
const ADMINS_FILE = path.join(__dirname, "..", "data", "admins.json");
const GLOBAL_MODE_FILE = path.join(__dirname, "..", "data", "globalMode.json");
const GROUPSETS_FILE = path.join(__dirname, "..", "data", "groupsets.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePathFor(groupId) {
    // groupId looks like "1234567890-1234567890@g.us" — strip the @g.us suffix for a clean filename
    const safeName = groupId.replace(/[^0-9-]/g, "");
    return path.join(DATA_DIR, `${safeName}.json`);
}

/** Default shape for a brand-new group's config. */
function defaultConfig() {
    return {
        mode: null, // null = use global default; else "owner" | "private" | "public"
        guards: {
            media: {
                enabled: false,
                blocked: [],        // any of: "gif", "video", "voice", "document", "photo", "sticker"
                punishment: "warn"  // "warn" | "kick" | "delete"
            },
            antilink: {
                enabled: false,
                punishment: "warn",
                allowedDomains: []   // lowercase domains that are exempt (e.g. "github.com")
            },
            antibadword: {
                enabled: false,
                words: [],           // lowercase words/phrases to block
                punishment: "warn"
            }
            // future guards (antispam, antiforward, ...) go here,
            // each with its own { enabled, punishment, ...settings }
        },
        filters: {
            enabled: true,
            items: {} // { [triggerName]: replyText }
        },
        warnings: {} // { [bareUserId]: count }
    };
}

/** Reads a group's config from disk, creating a default one if missing. */
function getGroupConfig(groupId) {
    const file = filePathFor(groupId);
    if (!fs.existsSync(file)) {
        const fresh = defaultConfig();
        fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
        return fresh;
    }
    try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = JSON.parse(raw);
        const defaults = defaultConfig();

        // Deep-merge each guard's own fields too, so older config files
        // safely gain new fields added to a guard later (e.g. antibadword.words).
        const mergedGuards = {};
        for (const key of Object.keys(defaults.guards)) {
            mergedGuards[key] = { ...defaults.guards[key], ...(parsed.guards?.[key] || {}) };
        }
        // preserve any guard keys that exist in the saved file but not in
        // current defaults (shouldn't normally happen, but avoids data loss)
        for (const key of Object.keys(parsed.guards || {})) {
            if (!mergedGuards[key]) mergedGuards[key] = parsed.guards[key];
        }

        const mergedFilters = { ...defaults.filters, ...(parsed.filters || {}) };

        return { ...defaults, ...parsed, guards: mergedGuards, filters: mergedFilters };
    } catch (err) {
        console.error(`⚠️ Failed to read config for ${groupId}, using defaults:`, err.message);
        return defaultConfig();
    }
}

/** Writes a group's full config to disk. */
function saveGroupConfig(groupId, config) {
    const file = filePathFor(groupId);
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

/**
 * Reads, applies a patch function to, and saves a group's config.
 * `patchFn(config) => config` mutates or returns the updated config.
 */
function updateGroupConfig(groupId, patchFn) {
    const config = getGroupConfig(groupId);
    const updated = patchFn(config) || config;
    saveGroupConfig(groupId, updated);
    return updated;
}

// ---------------------------------------------------------------------
// Groupsets — named collections of group JIDs (e.g. "hco" -> [g1, g2, g3])
// so admins can sync a config change across several groups at once with
// a trailing "sync" keyword on supported commands, instead of repeating
// the same command in every group individually.
// ---------------------------------------------------------------------

/** Reads all groupsets: { [name]: [groupId, groupId, ...] } */
function getGroupsets() {
    if (!fs.existsSync(GROUPSETS_FILE)) {
        fs.writeFileSync(GROUPSETS_FILE, JSON.stringify({}, null, 2));
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(GROUPSETS_FILE, "utf8"));
    } catch (err) {
        console.error("⚠️ Failed to read groupsets, treating as empty:", err.message);
        return {};
    }
}

function saveGroupsets(sets) {
    fs.writeFileSync(GROUPSETS_FILE, JSON.stringify(sets, null, 2));
}

/** Creates or overwrites a groupset with the given list of group JIDs. */
function createGroupset(name, groupIds) {
    const sets = getGroupsets();
    sets[name] = [...new Set(groupIds)];
    saveGroupsets(sets);
    return sets[name];
}

/** Deletes a groupset. */
function deleteGroupset(name) {
    const sets = getGroupsets();
    delete sets[name];
    saveGroupsets(sets);
}

/** Adds a single group JID to an existing (or new) groupset. */
function addToGroupset(name, groupId) {
    const sets = getGroupsets();
    const current = new Set(sets[name] || []);
    current.add(groupId);
    sets[name] = [...current];
    saveGroupsets(sets);
    return sets[name];
}

/** Removes a single group JID from a groupset. */
function removeFromGroupset(name, groupId) {
    const sets = getGroupsets();
    if (!sets[name]) return [];
    sets[name] = sets[name].filter((id) => id !== groupId);
    saveGroupsets(sets);
    return sets[name];
}

/** Finds every groupset name that a given group JID belongs to. */
function findGroupsetsContaining(groupId) {
    const sets = getGroupsets();
    return Object.keys(sets).filter((name) => sets[name].includes(groupId));
}

/**
 * Applies `patchFn` to the given group's config AND, if that group
 * belongs to any groupset(s), to every other group in those sets too.
 * Returns { updatedGroupIds, config } where config is the result for
 * the original groupId.
 */
function applyToLinkedGroups(groupId, patchFn) {
    const config = updateGroupConfig(groupId, patchFn);

    const setNames = findGroupsetsContaining(groupId);
    const linkedGroupIds = new Set();
    for (const name of setNames) {
        for (const id of getGroupsets()[name]) {
            if (id !== groupId) linkedGroupIds.add(id);
        }
    }

    for (const otherGroupId of linkedGroupIds) {
        updateGroupConfig(otherGroupId, patchFn);
    }

    return { updatedGroupIds: [groupId, ...linkedGroupIds], config };
}

module.exports = {
    getGroupConfig,
    saveGroupConfig,
    updateGroupConfig,
    getAllowlist,
    addToAllowlist,
    removeFromAllowlist,
    isAllowed,
    getAdmins,
    addAdmin,
    removeAdmin,
    getGlobalMode,
    getGlobalModeState,
    setGlobalMode,
    forceGlobalMode,
    clearLockdown,
    setGroupMode,
    clearGroupMode,
    resolveMode,
    getGroupsets,
    createGroupset,
    deleteGroupset,
    addToGroupset,
    removeFromGroupset,
    findGroupsetsContaining,
    applyToLinkedGroups
};

// ---------------------------------------------------------------------
// Mode system — "owner" | "private" | "public". A group's own mode
// (config.mode) takes priority; if unset (null), the global default
// applies. The global default is set by messaging the bot's own
// "Message Yourself" chat with .mode <x>.
// ---------------------------------------------------------------------

const VALID_MODES = ["owner", "private", "public"];

/** Reads the current global default mode. Defaults to "public" if unset. */
function getGlobalMode() {
    if (!fs.existsSync(GLOBAL_MODE_FILE)) {
        fs.writeFileSync(GLOBAL_MODE_FILE, JSON.stringify({ mode: "public", forced: false }, null, 2));
        return "public";
    }
    try {
        const data = JSON.parse(fs.readFileSync(GLOBAL_MODE_FILE, "utf8"));
        return VALID_MODES.includes(data.mode) ? data.mode : "public";
    } catch (err) {
        console.error("⚠️ Failed to read global mode, defaulting to public:", err.message);
        return "public";
    }
}

/** Reads the full global mode state, including the "forced" (lockdown) flag. */
function getGlobalModeState() {
    if (!fs.existsSync(GLOBAL_MODE_FILE)) {
        const fresh = { mode: "public", forced: false };
        fs.writeFileSync(GLOBAL_MODE_FILE, JSON.stringify(fresh, null, 2));
        return fresh;
    }
    try {
        const data = JSON.parse(fs.readFileSync(GLOBAL_MODE_FILE, "utf8"));
        return {
            mode: VALID_MODES.includes(data.mode) ? data.mode : "public",
            forced: !!data.forced,
            preLockdownMode: VALID_MODES.includes(data.preLockdownMode) ? data.preLockdownMode : undefined
        };
    } catch (err) {
        console.error("⚠️ Failed to read global mode state, defaulting:", err.message);
        return { mode: "public", forced: false };
    }
}

/** Sets the global default mode. Does not change the "forced" lockdown flag. */
function setGlobalMode(mode) {
    if (!VALID_MODES.includes(mode)) throw new Error(`Invalid mode: ${mode}`);
    const state = getGlobalModeState();
    fs.writeFileSync(GLOBAL_MODE_FILE, JSON.stringify({ mode, forced: state.forced }, null, 2));
    return mode;
}

/**
 * Sets the global mode AND engages lockdown: while forced=true, this mode
 * applies to EVERY chat, ignoring any per-group override. Used for
 * "shut everything down right now" situations (e.g. spam raid).
 * The pre-lockdown global mode is preserved separately so releasing the
 * lockdown restores it correctly instead of getting stuck on the lockdown mode.
 */
function forceGlobalMode(mode) {
    if (!VALID_MODES.includes(mode)) throw new Error(`Invalid mode: ${mode}`);
    const state = getGlobalModeState();
    const preLockdownMode = state.forced ? (state.preLockdownMode || state.mode) : state.mode;
    fs.writeFileSync(GLOBAL_MODE_FILE, JSON.stringify({ mode, forced: true, preLockdownMode }, null, 2));
    return mode;
}

/** Disengages lockdown — restores the global mode that was active before lockdown. */
function clearLockdown() {
    const state = getGlobalModeState();
    const restoredMode = state.preLockdownMode || state.mode;
    fs.writeFileSync(GLOBAL_MODE_FILE, JSON.stringify({ mode: restoredMode, forced: false }, null, 2));
}

/** Sets a specific group's mode override. */
function setGroupMode(groupId, mode) {
    if (!VALID_MODES.includes(mode)) throw new Error(`Invalid mode: ${mode}`);
    return updateGroupConfig(groupId, (cfg) => { cfg.mode = mode; return cfg; });
}

/** Clears a group's mode override, falling back to the global default. */
function clearGroupMode(groupId) {
    return updateGroupConfig(groupId, (cfg) => { cfg.mode = null; return cfg; });
}

/**
 * Resolves the effective mode for a given chat: if a global lockdown is
 * engaged, that mode applies everywhere, no exceptions. Otherwise, the
 * group's own override wins if set, else the global default applies.
 */
function resolveMode(groupId) {
    const globalState = getGlobalModeState();
    if (globalState.forced) return globalState.mode; // lockdown — ignore all group overrides

    if (groupId) {
        const config = getGroupConfig(groupId);
        if (config.mode && VALID_MODES.includes(config.mode)) return config.mode;
    }
    return globalState.mode;
}

// ---------------------------------------------------------------------
// Dynamic admin (private-tier) list — separate from the hardcoded
// OWNER_IDS. Owners manage this list at runtime via .setadmin/.removeadmin.
// ---------------------------------------------------------------------

/** Reads the admin list array (bare IDs, no @suffix). */
function getAdmins() {
    if (!fs.existsSync(ADMINS_FILE)) {
        fs.writeFileSync(ADMINS_FILE, JSON.stringify([], null, 2));
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
    } catch (err) {
        console.error("⚠️ Failed to read admins list, treating as empty:", err.message);
        return [];
    }
}

function saveAdmins(list) {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(list, null, 2));
}

/** Adds a bare user ID to the admin list. Returns the updated list. */
function addAdmin(userId) {
    const list = getAdmins();
    if (!list.includes(userId)) {
        list.push(userId);
        saveAdmins(list);
    }
    return list;
}

/** Removes a bare user ID from the admin list. Returns the updated list. */
function removeAdmin(userId) {
    const list = getAdmins().filter((id) => id !== userId);
    saveAdmins(list);
    return list;
}

// ---------------------------------------------------------------------
// Global allowlist — controls which chats (groups or DMs) the bot will
// respond in at all. Empty list = bot responds everywhere (default,
// unrestricted). Once at least one entry is added, ONLY listed chats work.
// ---------------------------------------------------------------------

/** Reads the allowlist array (of bare chat IDs, no @g.us/@s.whatsapp.net/@lid suffix). */
function getAllowlist() {
    if (!fs.existsSync(ALLOWLIST_FILE)) {
        fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify([], null, 2));
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
    } catch (err) {
        console.error("⚠️ Failed to read allowlist, treating as empty:", err.message);
        return [];
    }
}

function saveAllowlist(list) {
    fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify(list, null, 2));
}

/** Adds a bare chat ID to the allowlist. Returns the updated list. */
function addToAllowlist(chatId) {
    const list = getAllowlist();
    if (!list.includes(chatId)) {
        list.push(chatId);
        saveAllowlist(list);
    }
    return list;
}

/** Removes a bare chat ID from the allowlist. Returns the updated list. */
function removeFromAllowlist(chatId) {
    const list = getAllowlist().filter((id) => id !== chatId);
    saveAllowlist(list);
    return list;
}

/**
 * True if the bot should respond in this chat.
 * If the allowlist is empty, the bot responds everywhere (unrestricted).
 * Once non-empty, only listed chat IDs are allowed.
 */
function isAllowed(chatId) {
    const list = getAllowlist();
    if (list.length === 0) return true;
    return list.includes(chatId);
}

