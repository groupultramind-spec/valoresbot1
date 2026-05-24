const { install, Browser, detectBrowserPlatform } = require('@puppeteer/browsers');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── CONFIGURAÇÃO ──────────────────────────────────────────────
// Versão EXATA que o puppeteer instalado quer (do erro: "ver. 146.0.7680.31")
// Se atualizar o puppeteer e mudar a versão, atualize aqui também.
const CHROME_BUILD_ID = '146.0.7680.31';

// Path EXATO onde o puppeteer procura o Chrome (do erro: "cache path is: /app/.cache/puppeteer")
const CACHE_DIR = path.join(process.cwd(), '.cache', 'puppeteer');
// ───────────────────────────────────────────────────────────────

async function download() {
    console.log('🚀 [CHROME] Iniciando instalação do Chrome para Puppeteer...');
    console.log(`📂 [CHROME] Cache: ${CACHE_DIR}`);
    console.log(`🏷️  [CHROME] Versão alvo: ${CHROME_BUILD_ID}`);

    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const platform = detectBrowserPlatform();
    console.log(`💻 [CHROME] Plataforma: ${platform}`);

    // Verifica se já está instalado nesse path
    const expectedPath = path.join(CACHE_DIR, 'chrome', `${platform}-${CHROME_BUILD_ID}`, 'chrome-linux64', 'chrome');
    const expectedPathWin = path.join(CACHE_DIR, 'chrome', `${platform}-${CHROME_BUILD_ID}`, 'chrome-win64', 'chrome.exe');
    const alreadyExists = fs.existsSync(expectedPath) || fs.existsSync(expectedPathWin);

    if (alreadyExists) {
        const p = fs.existsSync(expectedPath) ? expectedPath : expectedPathWin;
        console.log(`✅ [CHROME] Já instalado em: ${p}`);
        return;
    }

    console.log(`📡 [CHROME] Baixando Chrome ${CHROME_BUILD_ID}... (pode demorar alguns minutos)`);

    try {
        const result = await install({
            browser: Browser.CHROME,
            cacheDir: CACHE_DIR,
            platform: platform,
            buildId: CHROME_BUILD_ID,
        });

        console.log(`✅ [CHROME] Instalado com sucesso em: ${result.executablePath}`);

        // Verifica e reporta o status do icudtl.dat
        const icuFile = path.join(path.dirname(result.executablePath), 'icudtl.dat');
        if (fs.existsSync(icuFile)) {
            console.log('✅ [CHROME] icudtl.dat presente — Chrome completo e funcional!');
        } else {
            console.log('ℹ️  [CHROME] icudtl.dat não encontrado (Chrome headless-shell usa ICU embutido — OK).');
        }

    } catch (err) {
        console.error(`❌ [CHROME] Falha no download: ${err.message}`);

        // Fallback: tenta com Chromium que SEMPRE tem icudtl.dat
        console.log('🔄 [CHROME] Tentando fallback com Chromium...');
        try {
            const { resolveBuildId } = require('@puppeteer/browsers');
            let chromiumBuildId;
            try {
                chromiumBuildId = await resolveBuildId(Browser.CHROMIUM, platform, 'latest');
            } catch (e) {
                chromiumBuildId = '1350573';
            }

            const fallback = await install({
                browser: Browser.CHROMIUM,
                cacheDir: CACHE_DIR,
                platform: platform,
                buildId: chromiumBuildId,
            });

            console.log(`✅ [CHROME] Chromium instalado como fallback: ${fallback.executablePath}`);

            // Salva o path do Chromium para o whatsapp-bot.cjs usar
            fs.writeFileSync(
                path.join(process.cwd(), 'chrome-path.json'),
                JSON.stringify({ path: fallback.executablePath })
            );
        } catch (e2) {
            console.error(`💀 [CHROME] Falha total: ${e2.message}`);
            process.exit(1);
        }
    }
}

download()
    .then(() => console.log('🏁 [CHROME] Script finalizado.'))
    .catch(err => { console.error('💀 [CHROME] Erro fatal:', err.message); process.exit(1); });
