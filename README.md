# 🤖 WhatsApp Admin Access Bot

A modular WhatsApp group-management bot built on Baileys. One entry point,
one connection, commands split into focused modules.

---

## 📁 Project Structure

```text
whatsapp-admin-access-bot/
├── index.js                # Entry point — starts the connection, wires up all commands
├── package.json
├── .env.example
├── .gitignore
├── lib/
│   ├── connection.js        # Shared Baileys socket: pairing-code login, reconnect, creds
│   └── helpers.js           # Shared utils: text extraction, JID parsing, media download
└── commands/
    ├── admin.js              # .ping, .kick, .delete + auto link-deletion
    ├── mediaGuard.js         # Video / GIF / voice-note restriction + auto-delete
    ├── ai.js                 # .ai, .jid, .txt (OCR via OCR.space + Klyphic API)
    └── autoReply.js          # Keyword auto-replies: greetings, help, rules, thank-you, media warnings
```

Run **one process** (`node index.js`) — it loads every command module against
a single WhatsApp connection, instead of spinning up four separate bots.

---

## ✨ Features

### Admin (`commands/admin.js`)
| Command | Description |
|---|---|
| `.ping` | Check bot status |
| `.kick @user` | Remove a user from the group |
| `.delete` | Reply to a message and delete it |

- Auto-deletes http/https/www links from unauthorized users, with a warning.
- Bot can't kick itself or another authorized admin.

### Media Guard (`commands/mediaGuard.js`)
Detects and removes Video, GIF, and Voice Note messages, with a warning to the sender.

### AI (`commands/ai.js`)
| Command | Description |
|---|---|
| `.ping` | Check system status |
| `.jid` | Get the current chat JID |
| `.txt` | OCR a replied-to image |
| `.ai [question]` | Ask the AI a question (optionally with image context) |

### Auto-Reply (`commands/autoReply.js`)
Keyword-based replies for greetings, help/menu, group rules, and thank-you messages.

> Note: the original `menu.js` also contained ~30 patterns giving instructions
> for account/website hacking, OTP bypass, phishing, and bombing tools. Those
> were intentionally **not** ported — they're out of scope for a group-management
> bot and enable harm to real accounts/systems.

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "@hapi/boom": "^10.0.1",
    "@whiskeysockets/baileys": "^7.0.0-rc13",
    "axios": "^1.18.1",
    "dotenv": "^16.4.5",
    "form-data": "^4.0.6",
    "pino": "^10.3.1"
  }
}
```

---

## 📥 Installation

```bash
git clone https://github.com/GWSDeveloper/HCO-v2-bot-wp.git
cd HCO-v2-bot-wp
npm install
cp .env.example .env
# edit .env and fill in your real keys
```

### Configure API keys

Edit `.env`:

```bash
nano .env
```

```env
OCR_API_KEY=your_ocr_space_api_key_here
KLYPHIC_TOKEN=your_klyphic_token_here
```

> ⚠️ Never commit `.env` or hardcode keys in source files. `.env` is already
> in `.gitignore`.

### Configure authorized admins

Open `commands/admin.js` and edit:

```javascript
const AUTHORIZED_USERS = [
    "41189189394538",
    // add more bare user IDs here
];
```

Get a user's ID via the `.jid` command.

### Run

```bash
npm start
# or
node index.js
```

### Login

1. Start the bot.
2. Enter your WhatsApp number with country code when prompted.
3. Open WhatsApp → Linked Devices → Link with phone number.
4. Enter the pairing code shown in the terminal.

Session is stored in `auth_info/`. If it expires, delete that folder and
pair again:

```bash
rm -rf auth_info
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---|---|
| `Cannot find module` | Run `npm install` |
| Session expired | Delete `auth_info` and pair again |
| Command not authorized | Check `AUTHORIZED_USERS` in `commands/admin.js` |
| Bot can't delete/kick | Make sure the bot account is a group admin |
| `.ai` / `.txt` errors | Check `.env` has valid `OCR_API_KEY` / `KLYPHIC_TOKEN` |

---

## 🎓 Running with PM2

```bash
npm install -g pm2
pm2 start index.js --name "admin-bot"
pm2 logs admin-bot
pm2 save
```

---

## 🔒 Security Notes

- API keys live only in `.env`, never in source.
- `auth_info/` (your login session) must stay private — never commit it.
- Restrict admin commands to trusted user IDs.
- Rotate any key that was ever committed to a public repo.

---

## ⚖️ Disclaimer

Intended for legitimate group administration and automation. Use responsibly
and in compliance with WhatsApp's terms of service.
