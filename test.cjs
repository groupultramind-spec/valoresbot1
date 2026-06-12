const fs = require('fs');
const axios = require('axios');

const txt = fs.readFileSync('d:\\SVR\\server.ts', 'utf8');
const m = txt.match(/const TG_TOKEN\s*=\s*['"]([^'"]+)['"]/);

if (m) {
  const token = m[1];
  
  axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    .then(r => console.log('Webhook:', r.data))
    .catch(e => console.log('Webhook ERR:', e.message));

  axios.get(`https://api.telegram.org/bot${token}/getUpdates`)
    .then(r => console.log('Updates:', r.data))
    .catch(e => console.log('Updates ERR:', e.response?.data || e.message));
} else {
  console.log('Token not found');
}
