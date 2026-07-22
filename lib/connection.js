const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const readline = require("readline");

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => {
        rl.close();
        resolve(answer);
    }));
};

/**
 * Starts a single Baileys socket connection with pairing-code login,
 * auto-reconnect, and creds persistence.
 *
 * @param {object} options
 * @param {string} options.browserName - Label shown in WhatsApp Linked Devices.
 * @param {(sock: import('@whiskeysockets/baileys').WASocket) => void} options.onReady
 *        Called once with the socket after it's created, so the caller can
 *        attach message handlers before the connection opens.
 * @returns {Promise<import('@whiskeysockets/baileys').WASocket>}
 */
async function startConnection({ browserName = "Ubuntu", onReady } = {}) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        generatePairingCode: true
    });

    if (typeof onReady === "function") {
        onReady(sock);
    }

    if (!sock.authState.creds.registered) {
        console.log("📱 Enter your WhatsApp number with country code (no + or spaces):");
        const rawNumber = await question('> ');
        const phoneNumber = rawNumber.replace(/[^0-9]/g, ''); // strip anything but digits

        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n\x1b[1m\x1b[33mPairing Code:\x1b[0m \x1b[1m\x1b[32m${code}\x1b[0m\n`);
                console.log("⏱️  Enter this within ~60 seconds on WhatsApp > Linked Devices > Link with phone number.\n");
            } catch (err) {
                console.error("❌ Pairing Error:", err.message);
            }
        }, 6000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log("♻️  Connection closed, reconnecting...");
                startConnection({ browserName, onReady });
            } else {
                console.log("❌ Session expired. Delete 'auth_info' folder and restart.");
                process.exit();
            }
        } else if (connection === 'open') {
            console.log('\n\x1b[32m[CONNECTED] Bot is online and listening for messages!\x1b[0m');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

module.exports = { startConnection };
