import fs from 'fs';

const bancos = JSON.parse(fs.readFileSync('bancos.json', 'utf8'));
const b64 = Buffer.from(JSON.stringify(bancos)).toString('base64');
fs.writeFileSync('scratch/b64_output.txt', b64, 'utf8');
console.log('Done');
