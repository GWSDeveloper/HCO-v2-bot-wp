const { getText, getGroupId } = require("../lib/helpers");
const { getGroupConfig } = require("../lib/store");

/** Word-boundary check: does `text` contain `word` as a standalone token? */
function containsWord(text, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|[!?.,])`, 'i');
    return regex.test(text);
}

/**
 * Checks the message text against all saved filters for this group and
 * sends the matching one, if any. Returns true if it handled the message.
 */
async function handleFilterRunner(sock, msg) {
    if (!msg.message) return false;

    const groupId = getGroupId(msg);
    if (!groupId) return false; // filters are group-only

    const config = getGroupConfig(groupId);
    if (!config.filters.enabled) return false;

    const names = Object.keys(config.filters.items);
    if (names.length === 0) return false;

    const text = getText(msg.message).toLowerCase();
    if (!text) return false;

    for (const name of names) {
        if (containsWord(text, name)) {
            const response = config.filters.items[name];
            await sock.sendMessage(groupId, { text: response }, { quoted: msg });
            return true;
        }
    }

    return false;
}

module.exports = { handleFilterRunner, containsWord };

