const crypto = require('crypto');
const axios = require('axios');
const https = require('https');

/**
 * SECURITY UTILITIES - BACKEND (CommonJS)
 */

const MASTER_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';

function hashUrl(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

function encryptData(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData) {
    const [ivHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted data format");
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MASTER_KEY), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function queryDnsDoH(domain, type = 'A') {
    try {
        const response = await axios.get(`https://cloudflare-dns.com/dns-query`, {
            params: { name: domain, type: type },
            headers: { 'accept': 'application/dns-json' }
        });
        if (response.data && response.data.Answer) {
            return response.data.Answer.map((ans) => ans.data);
        }
        return [];
    } catch (error) {
        console.error(`[DNS-DoH] Error querying ${domain}:`, error);
        return [];
    }
}

function getSecureHttpsAgent() {
    return new https.Agent({
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256'
    });
}

module.exports = {
    hashUrl,
    encryptData,
    decryptData,
    queryDnsDoH,
    getSecureHttpsAgent
};
