const { install, Browser, detectBrowserPlatform, resolveBuildId } = require('@puppeteer/browsers');
const path = require('path');
const fs = require('fs');

async function download() {
    // No ShardCloud, a pasta /app/chrome-data é persistente e segura
    const cacheDir = path.join(process.cwd(), 'chrome-data');
    
    console.log('🚀 [SISTEMA] Iniciando download inteligente do navegador...');
    console.log(`📂 [SISTEMA] Destino: ${cacheDir}`);

    try {
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const platform = detectBrowserPlatform();
        console.log(`💻 [SISTEMA] Plataforma detectada: ${platform}`);

        let buildId = 'latest';
        try {
            console.log('🔍 [SISTEMA] Resolvendo versão estável mais recente...');
            buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
            console.log(`🏷️ [SISTEMA] Versão estável encontrada: ${buildId}`);
        } catch (e) {
            console.log('⚠️ [SISTEMA] Não foi possível resolver a versão estável, tentando "latest"...');
        }

        console.log(`📡 [SISTEMA] Baixando Chrome (${buildId})... isso pode levar alguns minutos.`);
        
        const result = await install({
            browser: Browser.CHROME,
            cacheDir: cacheDir,
            platform: platform,
            buildId: buildId
        });

        console.log('✅ [SISTEMA] Chrome instalado com sucesso!');
        console.log(`📍 [SISTEMA] Executável: ${result.executablePath}`);
        
        // Salva o caminho para o robô ler depois
        fs.writeFileSync(path.join(process.cwd(), 'chrome-path.json'), JSON.stringify({ path: result.executablePath }));

    } catch (error) {
        console.error('❌ [SISTEMA] Falha no download do Chrome:', error.message);
        
        // Tenta baixar o Chromium se o Chrome falhar
        try {
            console.log('🔄 [SISTEMA] Tentando baixar Chromium como fallback...');
            const platform = detectBrowserPlatform();
            let chromiumBuildId = 'latest';
            try {
                chromiumBuildId = await resolveBuildId(Browser.CHROMIUM, platform, 'latest');
            } catch (e) {}

            const fallback = await install({
                browser: Browser.CHROMIUM,
                cacheDir: cacheDir,
                platform: platform,
                buildId: chromiumBuildId
            });
            console.log('✅ [SISTEMA] Chromium instalado!');
            console.log(`📍 [SISTEMA] Executável: ${fallback.executablePath}`);
            fs.writeFileSync(path.join(process.cwd(), 'chrome-path.json'), JSON.stringify({ path: fallback.executablePath }));
        } catch (e) {
            console.error('💀 [SISTEMA] Erro crítico: Não foi possível instalar nenhum navegador.');
            console.error('Detalhe do erro final:', e.message);
        }
    }
}

download();

