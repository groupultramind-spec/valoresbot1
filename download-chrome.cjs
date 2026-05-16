const { install, Browser, detectBrowserPlatform, resolveBuildId } = require('@puppeteer/browsers');
const path = require('path');
const fs = require('fs');

async function download() {
    const cacheDir = path.join(process.cwd(), 'chrome-data');
    const chromePathFile = path.join(process.cwd(), 'chrome-path.json');

    console.log('🚀 [SISTEMA] Iniciando download do navegador...');
    console.log(`📂 [SISTEMA] Destino: ${cacheDir}`);

    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const platform = detectBrowserPlatform();
    console.log(`💻 [SISTEMA] Plataforma detectada: ${platform}`);

    // ─────────────────────────────────────────────────────
    // ESTRATÉGIA 1: Chromium via @puppeteer/browsers
    // O Chromium SEMPRE inclui o icudtl.dat, ao contrário do
    // Chrome Headless Shell que é uma versão enxuta sem ICU.
    // ─────────────────────────────────────────────────────
    try {
        let buildId;
        try {
            console.log('🔍 [SISTEMA] Resolvendo versão estável do Chromium...');
            buildId = await resolveBuildId(Browser.CHROMIUM, platform, 'latest');
            console.log(`🏷️ [SISTEMA] Versão resolvida: ${buildId}`);
        } catch (e) {
            buildId = '1350573'; // Chromium rev estável conhecido com ICU
            console.log(`⚠️ [SISTEMA] Não foi possível resolver versão, usando rev fixo: ${buildId}`);
        }

        console.log(`📡 [SISTEMA] Baixando Chromium (${buildId})... isso pode levar alguns minutos.`);
        const result = await install({
            browser: Browser.CHROMIUM,
            cacheDir: cacheDir,
            platform: platform,
            buildId: buildId
        });

        console.log('✅ [SISTEMA] Chromium instalado com sucesso!');
        console.log(`📍 [SISTEMA] Executável: ${result.executablePath}`);

        // Verifica e corrige o icudtl.dat dentro do Chromium
        const execDir = path.dirname(result.executablePath);
        const icuFile = path.join(execDir, 'icudtl.dat');
        if (fs.existsSync(icuFile)) {
            console.log('✅ [SISTEMA] icudtl.dat confirmado na instalação do Chromium.');
        } else {
            console.log('⚠️ [SISTEMA] icudtl.dat não encontrado na pasta do Chromium. Buscando em alternativas...');
            // Busca recursiva em todo o cacheDir
            const findICU = (dir, depth = 0) => {
                if (depth > 5) return null;
                try {
                    for (const f of fs.readdirSync(dir)) {
                        const fp = path.join(dir, f);
                        if (f === 'icudtl.dat') return fp;
                        if (fs.statSync(fp).isDirectory()) {
                            const found = findICU(fp, depth + 1);
                            if (found) return found;
                        }
                    }
                } catch (e) {}
                return null;
            };
            const found = findICU(cacheDir) || findICU('/usr/lib') || findICU('/usr/share') || findICU('/usr/local');
            if (found) {
                console.log(`✨ [SISTEMA] icudtl.dat encontrado em: ${found}. Copiando...`);
                fs.copyFileSync(found, icuFile);
                console.log('✅ [SISTEMA] icudtl.dat copiado com sucesso.');
            } else {
                console.log('⚠️ [SISTEMA] icudtl.dat não encontrado. O whatsapp-bot.cjs usará --icu-data-file como fallback.');
            }
        }

        fs.writeFileSync(chromePathFile, JSON.stringify({ path: result.executablePath }));
        return;

    } catch (error) {
        console.error('❌ [SISTEMA] Falha ao instalar Chromium via @puppeteer/browsers:', error.message);
    }

    // ─────────────────────────────────────────────────────
    // ESTRATÉGIA 2: npx como último recurso
    // ─────────────────────────────────────────────────────
    try {
        console.log('🔄 [SISTEMA] Tentando instalar via npx @puppeteer/browsers...');
        const { execSync } = require('child_process');
        execSync(`npx @puppeteer/browsers install chromium@latest --path ${cacheDir}`, { stdio: 'inherit' });
        console.log('✅ [SISTEMA] Chromium instalado via npx.');
    } catch (e) {
        console.error('💀 [SISTEMA] Erro crítico: Não foi possível instalar nenhum navegador.');
        console.error('Detalhe:', e.message);
        process.exit(1);
    }
}

download().then(() => {
    console.log('🏁 [SISTEMA] Script de download finalizado.');
}).catch((err) => {
    console.error('💀 [SISTEMA] Erro fatal no script de download:', err.message);
    process.exit(1);
});
