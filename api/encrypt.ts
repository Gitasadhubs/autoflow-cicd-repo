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

        // Use function names that are present in the type definitions to avoid build errors.
        // from_string is an alias for decode_utf8, and from_base64/to_base64 are the correct names.
        // FIX: The libsodium-wrappers functions are available at the top level, not under a 'utils' namespace, to align with the type definitions.
        const secretBytes = libsodium.from_string(valueToEncrypt);
        const publicKeyBytes = libsodium.from_base64(publicKey);

        // Encrypt the secret using libsodium
        const encryptedBytes = libsodium.crypto_box_seal(secretBytes, publicKeyBytes);

        // Convert the encrypted Uint8Array to a base64 string
        const encryptedValue = libsodium.to_base64(encryptedBytes);

        return res.status(200).json({ encryptedValue });
    } catch (error) {
        console.error("Encryption failed:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown encryption error occurred.";
        return res.status(500).json({ error: `Server-side encryption failed: ${errorMessage}` });
    }
}
