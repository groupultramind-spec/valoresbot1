const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\NG\\.gemini\\antigravity\\brain\\66bca0cb-0b11-46bd-807e-a9111139645b\\.system_generated\\steps\\488\\content.md', 'utf-8');
const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

const banks = {};
for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i+1];
    
    // Check if nextLine is a 3-digit code
    if (/^\d{3}$/.test(nextLine)) {
        const name = line.replace(/^\d+:\s*/, '').replace(/\[(.*?)\]\(.*?\)/, '$1');
        banks[nextLine] = name;
        i++; // skip nextLine
    }
}

fs.writeFileSync('bancos.json', JSON.stringify(banks, null, 2));
console.log(`Extracted ${Object.keys(banks).length} banks.`);
