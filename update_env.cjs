const fs = require('fs');
let env = fs.readFileSync('d:\\SVR\\.env', 'utf8');
env = env.replace(/TELEGRAM_BOT_TOKEN=.*/, 'TELEGRAM_BOT_TOKEN="8781158932:AAE3HiyoQWxiXAmD7Db-mVHtjo1Ggr1WFjQ"');
fs.writeFileSync('d:\\SVR\\.env', env);
console.log('Updated .env');
