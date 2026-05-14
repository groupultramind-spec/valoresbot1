const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cacheDir = path.join(process.cwd(), '.cache', 'puppeteer');

console.log('🚀 [SISTEMA] Iniciando download manual do Chrome...');

try {
    if (fs.existsSync(cacheDir)) {
        console.log('🧹 [SISTEMA] Limpando cache antigo...');
        fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    
    // Usamos o utilitário @puppeteer/browsers via npx, mas forçamos um ambiente limpo
    // Tentamos instalar uma versão específica que sabemos ser compatível
    const command = `npx @puppeteer/browsers install chrome@latest --path "${cacheDir}"`;
    
    console.log(`📡 [SISTEMA] Executando: ${command}`);
    
    // Executamos e mostramos a saída em tempo real
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ [SISTEMA] Chrome instalado com sucesso!');
} catch (error) {
    console.error('❌ [SISTEMA] Erro ao instalar Chrome:', error.message);
    // Não encerramos com erro para não travar o deploy do site principal
    process.exit(0); 
}
