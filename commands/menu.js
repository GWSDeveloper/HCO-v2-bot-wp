const { getText, getGroupId, isAuthorized, getSenderJid, toBareId } = require("../lib/helpers");

const BOT_NAME = "HCO Bot";
const BOT_VERSION = "1.0.0";
const BOT_OWNER = "Azhar";

function header() {
    return `
╔═══════════════════╗
   *🤖 ${BOT_NAME}*
   Version: *${BOT_VERSION}*
   by ${BOT_OWNER}
╚═══════════════════╝
`.trim();
}

const ADMIN_MENU = `
${header()}

*Available Commands:*

╔═══════════════════╗
🌐 *General*
╠═══════════════════
║ ➤ .menu
║ ➤ .ping
║ ➤ .jid
║ ➤ .ai
║ ➤ .txt
╚═══════════════════╝

╔═══════════════════╗
👑 *Owner*
╠═══════════════════
║ ➤ .setadmin
║ ➤ .removeadmin
║ ➤ .admins
║ ➤ .lockdown
╚═══════════════════╝

╔═══════════════════╗
🔑 *Access Control*
╠═══════════════════
║ ➤ .allowhere
║ ➤ .allow
║ ➤ .disallow
║ ➤ .allowlist
║ ➤ .mode
╚═══════════════════╝

╔═══════════════════╗
⚙️ *Group Management*
╠═══════════════════
║ ➤ .kick
║ ➤ .delete
║ ➤ .add
║ ➤ .mute
║ ➤ .unmute
║ ➤ .tagall
║ ➤ .promote
║ ➤ .demote
╚═══════════════════╝

╔═══════════════════╗
⚠️ *Warnings*
╠═══════════════════
║ ➤ .warn
║ ➤ .unwarn
║ ➤ .warnings
║ ➤ .resetwarnings
╚═══════════════════╝

╔═══════════════════╗
🛡️ *Guards*
╠═══════════════════
║ ➤ .media
║ ➤ .antilink
║ ➤ .antibadword
╚═══════════════════╝

╔═══════════════════╗
🌹 *Filters*
╠═══════════════════
║ ➤ .filter
╚═══════════════════╝

╔═══════════════════╗
🔗 *Groupsets*
╠═══════════════════
║ ➤ .groupset
╚═══════════════════╝

_Type a command name with "help" (e.g. .media help) for detailed usage._
`.trim();

const PUBLIC_MENU = `
${header()}

*Available Commands:*

╔═══════════════════╗
🌐 *General*
╠═══════════════════
║ ➤ .menu
║ ➤ .ping
║ ➤ .ai
╚═══════════════════╝
`.trim();

/**
 * Handles .menu — shows the admin menu to owner/admins, and a shorter
 * public menu to everyone else. Returns true if it handled the message.
 */
async function handleMenu(sock, msg) {
    if (!msg.message) return false;

    const text = getText(msg.message).trim().toLowerCase();
    if (text !== ".menu") return false;

    const groupId = getGroupId(msg);
    const target = groupId || msg.key.remoteJid;

    const sender = getSenderJid(msg);
    const senderId = toBareId(sender);
    const menuText = isAuthorized(senderId) ? ADMIN_MENU : PUBLIC_MENU;

    await sock.sendMessage(target, { text: menuText }, { quoted: msg });
    return true;
}

module.exports = { handleMenu };

