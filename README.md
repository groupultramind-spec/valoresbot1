# 🤖 SVR Bot - Automação WhatsApp & Telegram Dashboard

Bem-vindo ao repositório do **SVR Bot**. Este sistema é uma solução completa de atendimento via WhatsApp integrada com um painel de controle interativo via Telegram, focado na gestão de leads, agendamentos e emissão de protocolos PIX via Gateway.

## ✨ Funcionalidades Principais

*   **📱 Multi-Sessões WhatsApp:** Suporte a múltiplos perfis (slots) rodando simultaneamente.
*   **📡 Painel de Controle no Telegram:** Gerencie seus leads, visualize filas e gere códigos PIX com um clique diretamente pelo Telegram.
*   **🤖 Automação Inteligente:** Respostas automáticas usando IA e fluxos definidos para captura de nome, CPF/CNPJ e data de nascimento.
*   **💵 Integração PIX:** Geração nativa de cobranças/protocolos via Gateway, com cálculo de taxas fixas e variáveis e gestão de saldo (saques) pelo Telegram.
*   **🛡️ Resiliência (Watchdog):** Sistema de auto-recuperação que baixa automaticamente o Google Chrome/Chromium e reinicia processos em caso de falha.
*   **📧 Disparo de E-mails:** Envio de comprovantes SMTP automatizados.

## 🚀 Como instalar e rodar localmente

### 1. Pré-requisitos
Certifique-se de ter instalado em sua máquina:
*   [Node.js](https://nodejs.org/en/) (Versão 20.x ou superior recomendada)
*   Git

### 2. Instalação
Clone o repositório e instale as dependências:
```bash
git clone https://github.com/seu-usuario/valoresbot1.git
cd valoresbot1
npm install
```

### 3. Configuração do Ambiente (.env)
Crie um arquivo `.env` na raiz do projeto (ou edite o existente) e configure as variáveis principais necessárias para o Telegram e Banco de Dados:
```env
TELEGRAM_BOT_TOKEN="SEU_TOKEN_DO_TELEGRAM_AQUI"
TELEGRAM_CHAT_ID="ID_DO_SEU_GRUPO_OU_CHAT_TELEGRAM"
SVR_SYS_CORE_URL="https://seu-dominio.com.br"
SVR_AI_RUNTIME_TOKEN="SUA_CHAVE_GEMINI_AQUI"
```

### 4. Iniciando o Sistema
Para iniciar o servidor Telegram e o Bot principal do WhatsApp, execute:
```bash
# Faz o download do Chrome (necessário na 1ª vez) e inicia o servidor
node download-chrome.cjs
npx tsx server.ts
```

Assim que o sistema iniciar, verifique o seu Telegram. O bot enviará uma mensagem informando que está online e gerará o **QR Code** para você escanear e vincular o WhatsApp.

## ☁️ Deploy (ShardCloud / VPS)

O sistema está configurado para ser hospedado facilmente na **ShardCloud** ou em qualquer VPS Linux.
1. O arquivo `download-chrome.cjs` garante que o Puppeteer encontrará os binários do Chrome no ambiente Linux.
2. Certifique-se de configurar a porta `80` ou `8080` dependendo das regras do seu provedor.
3. Não se esqueça de preencher todas as variáveis de ambiente (ENVs) no painel da hospedagem.

## ⚠️ Aviso Legal
*Este software é fornecido no estado em que se encontra ("as is"). A responsabilidade sobre o conteúdo das mensagens, integração com gateways de pagamento e o respeito às políticas do WhatsApp (prevenção a banimentos) são exclusivamente do usuário operador da ferramenta.*
