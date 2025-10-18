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

        // FIX: The libsodium-wrappers types can be inconsistent with the runtime object.
        // The 'utils' namespace, which contains the necessary encoding/decoding functions,
        // is not always correctly typed. We cast to 'any' to bypass potential type
        // errors and use the correct runtime functions, aligning this with the local dev server.
        const utils = (libsodium as any).utils;

        const secretBytes = utils.decodeUTF8(valueToEncrypt);
        const publicKeyBytes = utils.decodeBase64(publicKey);

        // Encrypt the secret using libsodium
        const encryptedBytes = libsodium.crypto_box_seal(secretBytes, publicKeyBytes);

        // Convert the encrypted Uint8Array to a base64 string
        const encryptedValue = utils.encodeBase64(encryptedBytes);

        return res.status(200).json({ encryptedValue });
    } catch (error) {
        console.error("Encryption failed:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown encryption error occurred.";
        return res.status(500).json({ error: `Server-side encryption failed: ${errorMessage}` });
    }
}