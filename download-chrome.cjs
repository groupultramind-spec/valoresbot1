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
    
    // Forçamos a versão exata que o Puppeteer está pedindo no erro
    const version = '146.0.7680.31';
    const command = `npx @puppeteer/browsers install chrome@${version} --path "${cacheDir}"`;
    
    console.log(`📡 [SISTEMA] Executando: ${command}`);
    
    // Executamos e mostramos a saída em tempo real
    execSync(command, { stdio: 'inherit' });
    
    console.log('✅ [SISTEMA] Chrome instalado com sucesso!');
} catch (error) {
    console.error('❌ [SISTEMA] Erro ao instalar Chrome:', error.message);
    // Tenta uma versão genérica se a específica falhar
    try {
        console.log('🔄 [SISTEMA] Tentando instalar versão genérica...');
        execSync(`npx @puppeteer/browsers install chrome --path "${cacheDir}"`, { stdio: 'inherit' });
    } catch (e) {}
    process.exit(0); 
}
