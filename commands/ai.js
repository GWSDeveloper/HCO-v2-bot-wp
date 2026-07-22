const axios = require("axios");
const FormData = require("form-data");
const { getText, downloadImage } = require("../lib/helpers");

const OCR_API_KEY = process.env.OCR_API_KEY;
const KLYPHIC_TOKEN = process.env.KLYPHIC_TOKEN;

const SYSTEM_PROMPT = `
You are HCO AI, a helpful assistant.
Answer clearly, factually, and directly.
When you do not know something, say so honestly instead of fabricating information.
Use emojis to keep responses friendly and positive 😊
End every response with: "🤖 HCO AI"
`.trim();

async function askKlyphic(query) {
    if (!KLYPHIC_TOKEN) {
        throw new Error("KLYPHIC_TOKEN is not set. Add it to your .env file.");
    }
    const url = `https://klyphic.onrender.com/ai?token=${KLYPHIC_TOKEN}&q=${encodeURIComponent(query)}&sys_prompt=${encodeURIComponent(SYSTEM_PROMPT)}`;
    const response = await axios.get(url);
    const data = response.data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object') {
        const keys = ['reply', 'message', 'response', 'text', 'content', 'answer', 'output'];
        for (const key of keys) {
            if (data[key] && typeof data[key] === 'string') return data[key];
        }
        return JSON.stringify(data);
    }
    return String(data);
}

async function performOCR(buffer) {
    if (!OCR_API_KEY) {
        console.error("OCR_API_KEY is not set. Add it to your .env file.");
        return null;
    }
    try {
        const form = new FormData();
        form.append("apikey", OCR_API_KEY);
        form.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });
        form.append("language", "eng");
        form.append("isOverlayRequired", "false");
        form.append("detectOrientation", "true");
        form.append("scale", "true");
        form.append("OCREngine", "2");

        const response = await axios.post("https://api.ocr.space/parse/image", form, {
            headers: { ...form.getHeaders() },
            timeout: 30000
        });

        if (response.data?.OCRExitCode === 1) {
            return response.data.ParsedResults.map(r => r.ParsedText).join("\n").trim() || null;
        }
        console.error("OCR Error:", response.data?.ErrorMessage || "Unknown");
        return null;
    } catch (error) {
        console.error("OCR Exception:", error.message);
        return null;
    }
}

/**
 * Handles .ping, .jid, .txt, and .ai commands.
 * Returns true if it handled the message.
 */
async function handleAI(sock, msg) {
    if (!msg.message) return false;

    const remoteJid = msg.key.remoteJid;
    const body = getText(msg.message);
    const lowerBody = body.toLowerCase();

    if (lowerBody === '.ping') {
        await sock.sendMessage(remoteJid, { text: "🏓 Pong! System is Online." }, { quoted: msg });
        return true;
    }

    if (lowerBody === '.jid') {
        await sock.sendMessage(remoteJid, { text: `🆔 ID: ${remoteJid}` }, { quoted: msg });
        return true;
    }

    if (lowerBody === '.txt') {
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = quotedMsg?.imageMessage || msg.message.imageMessage;
        if (!imageMsg) {
            await sock.sendMessage(remoteJid, { text: "❌ Please reply to an image with .txt" }, { quoted: msg });
            return true;
        }
        await sock.sendMessage(remoteJid, { text: "⏳ Extracting text..." }, { quoted: msg });
        const buffer = await downloadImage(imageMsg);
        const ocrText = await performOCR(buffer);
        await sock.sendMessage(remoteJid, { text: `📝 *OCR RESULT:*\n\n${ocrText || "No text found."}` }, { quoted: msg });
        return true;
    }

    if (lowerBody.includes('.ai')) {
        let query = body.replace(/\.ai/gi, "").trim();

        // Case 1: .ai sent as a reply to an existing image message
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedImage = quotedMsg?.imageMessage;

        // Case 2: an image sent directly, with ".ai <question>" as its caption
        const directImage = msg.message.imageMessage;

        const imageToRead = quotedImage || directImage;

        if (imageToRead) {
            await sock.sendMessage(remoteJid, { text: "⏳ Reading image context..." }, { quoted: msg });
            const buffer = await downloadImage(imageToRead);
            const ocrText = await performOCR(buffer);
            if (ocrText) {
                query = [ocrText, query].filter(Boolean).join(" ").trim();
            } else if (!query) {
                await sock.sendMessage(remoteJid, { text: "⚠️ Could not extract text from image, and no question was given." }, { quoted: msg });
                return true;
            }
        }

        if (!query) {
            await sock.sendMessage(remoteJid, { text: "❓ Please provide a question with .ai" }, { quoted: msg });
            return true;
        }

        try {
            await sock.sendMessage(remoteJid, { text: "💀 *HCO-AI is thinking...*" }, { quoted: msg });
            const aiReply = await askKlyphic(query);
            const finalOutput = `💀 *HCO-AI INTELLIGENCE* 💀\n\n${aiReply}\n\n*— ⚡ Powered by HCO Team ⚡ —*`;
            await sock.sendMessage(remoteJid, { text: finalOutput }, { quoted: msg });
        } catch (error) {
            await sock.sendMessage(remoteJid, { text: `⚠️ AI Error: ${error.message}` }, { quoted: msg });
        }
        return true;
    }

    return false;
}

module.exports = { handleAI };

