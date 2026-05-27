#!/bin/bash
echo "🧹 Removendo cache corrompido..."
rm -rf .cache/puppeteer
rm -f chrome-path.json

echo "📦 Instalando dependências..."
npm install --omit=dev

echo "🌐 Baixando Chrome 146.0.7680.31 manualmente via wget..."
mkdir -p .cache/puppeteer/chrome/linux-146.0.7680.31
cd .cache/puppeteer/chrome/linux-146.0.7680.31
if command -v curl >/dev/null 2>&1; then
    curl -# -O https://storage.googleapis.com/chrome-for-testing-public/146.0.7680.31/linux64/chrome-linux64.zip
else
    wget -q --show-progress https://storage.googleapis.com/chrome-for-testing-public/146.0.7680.31/linux64/chrome-linux64.zip
fi

echo "📦 Extraindo Chrome..."
unzip -q chrome-linux64.zip
rm chrome-linux64.zip
cd ../../../../

echo "✅ Chrome baixado e extraído com sucesso!"
echo "🚀 Iniciando aplicação..."
npx tsx server.ts
