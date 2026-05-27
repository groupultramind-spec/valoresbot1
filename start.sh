#!/bin/bash
echo "🧹 Removendo cache corrompido..."
rm -rf .cache/puppeteer
rm -f chrome-path.json

echo "📦 Instalando dependências..."
npm install --omit=dev

echo "🌐 Instalando Chrome nativo via Puppeteer CLI..."
npx puppeteer browsers install chrome@146.0.7680.31

echo "🚀 Iniciando aplicação..."
npx tsx server.ts
