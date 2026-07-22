require("dotenv").config();

const { startConnection } = require("./lib/connection");
const { handleAdmin } = require("./commands/admin");
const { handleAI } = require("./commands/ai");
const { handleMediaConfig } = require("./commands/mediaConfig");
const { handleMediaGuard } = require("./commands/mediaGuard");
const { handleAutoReply } = require("./commands/autoReply");
const { handleAllowlist } = require("./commands/allowlist");
const { handleOwner } = require("./commands/owner");
const { handleMode } = require("./commands/mode");
const { handleLockdown } = require("./commands/lockdown");
const { handleAddMember } = require("./commands/addMember");
const { handleWarn } = require("./commands/warn");
const { handleMute } = require("./commands/mute");
const { handleTagAll } = require("./commands/tagAll");
const { handlePromote } = require("./commands/promote");
const { handleAntilinkConfig } = require("./commands/antilinkConfig");
const { handleAntilinkGuard } = require("./commands/antilinkGuard");
const { handleAntibadwordConfig } = require("./commands/antibadwordConfig");
const { handleAntibadwordGuard } = require("./commands/antibadwordGuard");
const { handleFilterConfig } = require("./commands/filterConfig");
const { handleFilterRunner } = require("./commands/filterRunner");
const { handleGroupset } = require("./commands/groupset");
const { handleMenu } = require("./commands/menu");
const { getGroupId, getSenderJid, toBareId, isOwner, isAuthorized } = require("./lib/helpers");
const { isAllowed, resolveMode } = require("./lib/store");

// Order matters: first handler to return true "wins" the message.
// Config commands (.media, .antilink, .antibadword, .filter ...) run
// before their respective guards/runners so admins can always configure
// them even while active.
const handlers = [
    handleAdmin, handleAddMember, handleWarn, handleMute, handleTagAll, handlePromote,
    handleMediaConfig, handleMediaGuard,
    handleAntilinkConfig, handleAntilinkGuard,
    handleAntibadwordConfig, handleAntibadwordGuard,
    handleFilterConfig, handleFilterRunner,
    handleAI, handleAutoReply
];

/**
 * True if the sender is allowed to trigger anything at all, given the
 * chat's effective mode. Admin/owner-tier command modules (handleAdmin,
 * handleMediaConfig) already do their own isAuthorized() checks, so this
 * gate mainly controls whether PUBLIC-tier stuff (auto-reply, future
 * public commands) is reachable for ordinary members.
 */
function passesMode(mode, senderId) {
    if (mode === "owner") return isOwner(senderId);
    if (mode === "private") return isAuthorized(senderId); // owner or admin
    return true; // "public" — everyone passes; individual commands still gate themselves
}

async function main() {
    await startConnection({
        browserName: "Admin Bot",
        onReady(sock) {
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;

                const msg = messages[0];
                if (!msg?.message) return;

                // Owner commands (.setadmin, .removeadmin, .admins), access
                // commands (.allowhere, .allow, ...), and .mode itself always
                // run first, regardless of allowlist/mode gates — otherwise
                // the owner/admin could lock themselves out.
                try {
                    const handledOwnerCmd = await handleOwner(sock, msg);
                    if (handledOwnerCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleOwner):', error.message);
                }

                try {
                    const handledLockdownCmd = await handleLockdown(sock, msg);
                    if (handledLockdownCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleLockdown):', error.message);
                }

                try {
                    const handledAccessCmd = await handleAllowlist(sock, msg);
                    if (handledAccessCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleAllowlist):', error.message);
                }

                try {
                    const handledModeCmd = await handleMode(sock, msg);
                    if (handledModeCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleMode):', error.message);
                }

                try {
                    const handledGroupsetCmd = await handleGroupset(sock, msg);
                    if (handledGroupsetCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleGroupset):', error.message);
                }

                try {
                    const handledMenuCmd = await handleMenu(sock, msg);
                    if (handledMenuCmd) return;
                } catch (error) {
                    console.error('❌ Handler error (handleMenu):', error.message);
                }

                // Gate 1: allowlist — if non-empty, only respond in listed chats.
                const groupId = getGroupId(msg);
                const chatId = toBareId(groupId || msg.key.remoteJid);
                if (!isAllowed(chatId)) return;

                // Gate 2: mode — owner/private modes block everyone except the
                // relevant tier from reaching ANY handler below (including
                // auto-reply). Public mode lets everyone through; admin-only
                // commands (.kick, .media, etc) still self-gate via isAuthorized().
                const sender = getSenderJid(msg);
                const senderId = toBareId(sender);
                const mode = resolveMode(groupId);
                if (!passesMode(mode, senderId)) return;

                for (const handle of handlers) {
                    try {
                        const handled = await handle(sock, msg);
                        if (handled) break;
                    } catch (error) {
                        console.error(`❌ Handler error (${handle.name}):`, error.message);
                    }
                }
            });
        }
    });
}

main().catch((err) => console.error("Fatal error:", err));

