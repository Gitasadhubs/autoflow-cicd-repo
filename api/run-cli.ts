// FIX: Add a triple-slash directive to include Node.js type definitions.
// This resolves TypeScript errors for the 'process' global object and its 
// properties like 'cwd', which are available in the Vercel serverless 
// (Node.js) environment.
/// <reference types="node" />

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { spawn } from 'child_process';
import path from 'path';

// Define the allowlist of commands. We check the start of the command against this.
const COMMAND_ALLOWLIST = {
    vercel: [
        ['projects', 'list'],
        ['domains', 'ls'],
        ['logs'],
        ['deployments', 'ls'],
    ],
    railway: [
        ['projects'],
        ['services'],
        ['logs'],
        ['status'],
    ],
};

// Function to find the executable path in node_modules
const getExecutablePath = (cli: 'vercel' | 'railway'): string => {
    // In Vercel environment, process.cwd() is the root of the deployment
    return path.resolve(process.cwd(), 'node_modules', '.bin', cli);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { command, token } = req.body;
    if (typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ error: 'Command must be a non-empty string.' });
    }
     if (typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ error: 'A valid token must be provided.' });
    }
    
    const parts = command.trim().split(/\s+/);
    const cli = parts[0] as 'vercel' | 'railway';
    const args = parts.slice(1);

    if (cli !== 'vercel' && cli !== 'railway') {
        return res.status(400).json({ error: `Invalid CLI tool specified. Must be 'vercel' or 'railway'.` });
    }

    // Security Check: Validate against the allowlist
    const isAllowed = COMMAND_ALLOWLIST[cli].some(allowedCmdParts => 
        allowedCmdParts.every((part, index) => args[index] === part)
    );

    if (!isAllowed) {
        return res.status(403).json({ error: `Command not allowed: '${command}'. Only specific read-only commands are permitted.` });
    }
    
    const env = { ...process.env };
    
    if (cli === 'vercel') {
        env.VERCEL_TOKEN = token;
    } else if (cli === 'railway') {
        env.RAILWAY_TOKEN = token;
    }

    try {
        const executablePath = getExecutablePath(cli);
        const child = spawn(executablePath, args, { env });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const exitCode = await new Promise<number>((resolve) => {
            child.on('close', resolve);
        });

        if (exitCode !== 0) {
            // Return 200 OK but with an error flag so the frontend can display it as command output
            return res.status(200).json({ output: stderr || `Command exited with code ${exitCode}`, error: true });
        }
        
        return res.status(200).json({ output: stdout, error: false });

    } catch (error) {
        console.error(`Error executing command: ${command}`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        // This is a server error, so return 500
        return res.status(500).json({ error: `Server error executing command: ${message}` });
    }
}
