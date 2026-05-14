import crypto from 'crypto';
import axios from 'axios';

/**
 * SECURITY UTILITIES - BACKEND
 * Implementation based on user requirements for URL hashing, AES encryption, DoH and TLS.
 */

// Key should ideally be from process.env.ENCRYPTION_KEY
const MASTER_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'; // 32 bytes for aes-256

/**
 * 1. URL Hashing (SHA-256)
 * One-way hash for URL identification or integrity checks.
 */
export function hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

/**
 * 2. Sensitive Data Encryption (AES-256-CBC)
 * Reversible encryption for passwords, tokens, etc.
 */
export function encryptData(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(MASTER_KEY), iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Prepend IV for decryption
    return iv.toString('hex') + ':' + encrypted;
}

export function decryptData(encryptedData: string): string {
    const [ivHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted data format");
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(MASTER_KEY), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * 3. DNS Camouflage (DNS over HTTPS - DoH)
 * Queries DNS records using HTTPS to bypass local DNS filters/logging.
 */
export async function queryDnsDoH(domain: string, type: string = 'A'): Promise<string[]> {
    try {
        // Using Cloudflare DoH API
        const response = await axios.get(`https://cloudflare-dns.com/dns-query`, {
            params: {
                name: domain,
                type: type
            },
            headers: {
                'accept': 'application/dns-json'
            }
        });
        
        if (response.data && response.data.Answer) {
            return response.data.Answer.map((ans: any) => ans.data);
        }
        return [];
    } catch (error) {
        console.error(`[DNS-DoH] Error querying ${domain}:`, error);
        return [];
    }
}

/**
 * 4. Communication Security (TLS/SSL Configuration)
 * In Node.js, this is typically handled by the https agent or global settings.
 * This helper returns an HTTPS Agent with hardened settings.
 */
import https from 'https';
export function getSecureHttpsAgent() {
    return new https.Agent({
        rejectUnauthorized: true, // Always verify certificates
        minVersion: 'TLSv1.2',    // Minimum TLS version
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256' // Preferred ciphers
    });
}
