import type { VercelRequest, VercelResponse } from '@vercel/node';
import libsodium from 'libsodium-wrappers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { publicKey, valueToEncrypt } = req.body;

    if (!publicKey || !valueToEncrypt) {
        return res.status(400).json({ error: 'Missing publicKey or valueToEncrypt in the request body.' });
    }

    try {
        await libsodium.ready;

        // Use Node.js's native Buffer for robust encoding, avoiding inconsistencies
        // with the libsodium.utils helper module in different environments.
        const secretBytes = Buffer.from(valueToEncrypt, 'utf8');
        const publicKeyBytes = Buffer.from(publicKey, 'base64');

        // Encrypt the secret using libsodium. It expects Uint8Array, and Buffer is a subclass.
        const encryptedBytes = libsodium.crypto_box_seal(secretBytes, publicKeyBytes);

        // Convert the encrypted Uint8Array back to a base64 string for the GitHub API.
        const encryptedValue = Buffer.from(encryptedBytes).toString('base64');

        return res.status(200).json({ encryptedValue });
    } catch (error) {
        console.error("Encryption failed:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown encryption error occurred.";
        return res.status(500).json({ error: `Server-side encryption failed: ${errorMessage}` });
    }
}