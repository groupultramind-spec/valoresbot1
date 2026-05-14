const { install, Browser, detectBrowserPlatform } = require('@puppeteer/browsers');
const path = require('path');
const fs = require('fs');

async function download() {
    const cacheDir = path.join('/tmp', 'chrome-data');
    const version = '146.0.7680.31'; // A versão que o Puppeteer 22 pede
    
    console.log('🚀 [SISTEMA] Iniciando download nativo do Chrome...');
    console.log(`📂 [SISTEMA] Destino: ${cacheDir}`);
    console.log(`🏷️ [SISTEMA] Versão: ${version}`);

    try {
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const platform = detectBrowserPlatform();
        console.log(`💻 [SISTEMA] Plataforma detectada: ${platform}`);

        console.log('📡 [SISTEMA] Baixando... isso pode levar alguns minutos.');
        
        const result = await install({
            browser: Browser.CHROME,
            cacheDir: cacheDir,
            platform: platform,
            buildId: version
        });

        console.log('✅ [SISTEMA] Chrome instalado com sucesso!');
        console.log(`📍 [SISTEMA] Executável: ${result.executablePath}`);
        
        // Salva o caminho para o robô ler depois
        fs.writeFileSync(path.join(process.cwd(), 'chrome-path.json'), JSON.stringify({ path: result.executablePath }));

    } catch (error) {
        console.error('❌ [SISTEMA] Falha no download nativo:', error.message);
        
        // Tenta baixar a versão estável se a específica falhar
        try {
            console.log('🔄 [SISTEMA] Tentando baixar versão estável como fallback...');
            const fallback = await install({
                browser: Browser.CHROME,
                cacheDir: cacheDir,
                platform: detectBrowserPlatform(),
                buildId: 'latest'
            });
            console.log('✅ [SISTEMA] Chrome estável instalado!');
            fs.writeFileSync(path.join(process.cwd(), 'chrome-path.json'), JSON.stringify({ path: fallback.executablePath }));
        } catch (e) {
            console.error('💀 [SISTEMA] Erro crítico: Não foi possível instalar o Chrome.');
        }
    }
}

download();
