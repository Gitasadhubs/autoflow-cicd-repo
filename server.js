import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import libsodium from 'libsodium-wrappers';
import { spawn } from 'child_process';

// Load environment variables from .env file
dotenv.config();

// Basic setup for Express server
const app = express();
const PORT = process.env.PORT || 3001;

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON bodies

const generateWorkflowLogic = async ({
    techStack,
    deploymentTarget,
    deploymentEnvironment,
    repoName,
    triggers,
    analysis
}) => {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set on the server.");
        throw new Error("Server configuration error: API_KEY is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // In server.js, enums are just strings like 'Vercel', 'Production'
    const targetSpecificInstructions = {
        'Vercel': `
        INSTRUCTIONS FOR VERCEL DEPLOYMENT:
        - The deployment MUST be done using the official Vercel CLI.
        - The workflow MUST include a step to globally install the Vercel CLI ('npm install -g vercel').
        - Authentication and project linking is handled via secrets.
        - The Vercel CLI requires 'VERCEL_ORG_ID' and 'VERCEL_PROJECT_ID' to be available as environment variables in the deployment step.
        - The 'VERCEL_TOKEN' must be passed directly to the commands using the '--token' flag.
        - The full deployment command sequence is: 'vercel pull ... && vercel build ... && vercel deploy ...'.
        - For a production environment, the deploy command MUST include the '--prod' flag.
        - REQUIRED SECRETS: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID.
        `,
        'Firebase Hosting': `
        INSTRUCTIONS FOR FIREBASE HOSTING DEPLOYMENT:
        - The deployment MUST be done using the 'firebase-tools' CLI.
        - The workflow must include a step to install 'firebase-tools' (e.g., 'npm install -g firebase-tools').
        - Authentication with Firebase requires a 'FIREBASE_TOKEN', which MUST be defined as a sensitive secret.
        - The deployment command is 'firebase deploy --only hosting --token "\${{ secrets.FIREBASE_TOKEN }}"'.
        - The workflow might need a 'FIREBASE_PROJECT_ID' variable. If the '.firebaserc' file is not committed to the repository, this variable is required. Assume it is required.
        - REQUIRED SECRETS: FIREBASE_TOKEN.
        - REQUIRED VARIABLES: FIREBASE_PROJECT_ID.
        `,
        'GitHub Pages': `
        INSTRUCTIONS FOR GITHUB PAGES DEPLOYMENT:
        - The deployment MUST use the official 'actions/deploy-pages@v4' and 'actions/upload-pages-artifact@v3' actions.
        - This is a two-job process: one 'build' job to create the artifact, and one 'deploy' job that depends on the 'build' job.
        - The 'deploy' job requires specific repository permissions ('pages: write', 'id-token: write'). These permissions MUST be included at the top level of the workflow YAML.
        - This deployment method typically do NOT require any secrets, as it uses the automatically provided GITHUB_TOKEN. Explicitly state that no secrets are required unless the build process itself needs them for other reasons.
        - Ensure the 'build' job correctly identifies the build output path (e.g., 'dist', 'build') and uploads it as an artifact named 'github-pages'.
        `,
        'Railway': `
        INSTRUCTIONS FOR RAILWAY DEPLOYMENT:
        - The deployment MUST be done using the official Railway CLI.
        - The workflow must include a step to install the Railway CLI (e.g., 'npm install -g @railway/cli').
        - The primary deployment command is 'railway up'.
        - Authentication with Railway requires a 'RAILWAY_TOKEN', which MUST be defined as a sensitive secret.
        - The workflow may benefit from optional variables like 'RAILWAY_PROJECT_ID' or 'RAILWAY_SERVICE_ID' for more complex setups. Define 'RAILWAY_PROJECT_ID' as a required variable.
        - REQUIRED SECRETS: RAILWAY_TOKEN.
        - REQUIRED VARIABLES: RAILWAY_PROJECT_ID.
        `,
        'Heroku': `
        INSTRUCTIONS FOR HEROKU DEPLOYMENT:
        - The deployment MUST be done using the 'akhileshns/heroku-deploy@v3.12.12' action. This is the preferred method.
        - The action requires a 'HEROKU_API_KEY' which MUST be a sensitive secret.
        - The action requires a 'HEROKU_APP_NAME' which MUST be a variable. This is the name of the app in the Heroku dashboard.
        - The action also requires 'HEROKU_EMAIL', the email address associated with the Heroku account, which MUST be a variable.
        - REQUIRED SECRETS: HEROKU_API_KEY.
        - REQUIRED VARIABLES: HEROKU_APP_NAME, HEROKU_EMAIL.
        `,
        'AWS Elastic Beanstalk': `
        INSTRUCTIONS FOR AWS ELASTIC BEANSTALK DEPLOYMENT:
        - The deployment MUST be done using the 'einaregilsson/beanstalk-deploy@v21' action.
        - Authentication requires 'AWS_ACCESS_KEY_ID' and 'AWS_SECRET_ACCESS_KEY', which MUST be sensitive secrets.
        - The action requires an 'aws_region' variable (e.g., 'us-east-1'). Define this as a variable named 'AWS_REGION'.
        - The action requires an 'application_name' variable. Define this as a variable named 'EB_APPLICATION_NAME'.
        - The action requires an 'environment_name' variable. Define this as a variable named 'EB_ENVIRONMENT_NAME'.
        - The workflow MUST have a build step that creates a zip file of the application source code. The name of this zip file (e.g., 'deploy.zip') must be passed to the 'zip_file' input of the deployment action.
        - REQUIRED SECRETS: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
        - REQUIRED VARIABLES: AWS_REGION, EB_APPLICATION_NAME, EB_ENVIRONMENT_NAME.
        `,
    };

    const techStackInstruction = `
    GENERIC TECH STACK-SPECIFIC INSTRUCTIONS (USE REPO ANALYSIS TO OVERRIDE):
    - For Node.js-based projects ("React (Vite)", "Vue.js", "Node.js (Express)"): Assume the project uses 'npm'. The workflow MUST run 'npm ci' to install dependencies.
    - For frontend frameworks like "React (Vite)" or "Vue.js": These are typically built using 'npm run build' and produce static assets in a 'dist' or 'build' folder. This output folder is what gets deployed.
    - For backend frameworks like "Node.js (Express)": This is a server application. The entire project (excluding node_modules) is what gets deployed, not just a build artifact.
    - For "Python (Flask/Django)" projects: Assume dependencies are managed with a 'requirements.txt' file and should be installed using 'pip'.
    - For "Static HTML/JS" projects: These typically do not have a build step, and the entire repository content is deployed.
    `;
    
    const analysisInstruction = `
    REPOSITORY ANALYSIS:
    Based on an analysis of the repo, here are some key details. This information is the SOURCE OF TRUTH and MUST OVERRIDE any generic instructions.
    - Detected Package Manager: "${analysis.packageManager}" (Use command: "${analysis.installCommand}")
    - Detected Node.js Version: ${analysis.nodeVersion ? `"${analysis.nodeVersion}" (Use this exact version in setup-node)` : 'Not specified, use latest LTS'}
    - Detected Build Command: ${analysis.buildCommand ? `"${analysis.buildCommand}"` : 'Not specified'}
    - Detected Test Command: ${analysis.testCommand ? `"${analysis.testCommand}"` : 'Not specified'}
    - Detected Framework: ${analysis.framework || 'Not specified'}
    - The repository contains the following key files: ${analysis.keyFiles.map(f => f.path).join(', ')}.
    ${analysis.keyFiles.map(f => `
    CONTENT of "${f.path}":
    \`\`\`
    ${f.content}
    \`\`\`
    `).join('')}
    `;

    const detailedInstruction = targetSpecificInstructions[deploymentTarget] || '';

    const branch = deploymentEnvironment === 'Production' ? 'main' : 'staging';
    const triggerInstructions = [`- A 'workflow_dispatch' event to allow manual triggering.`];

    if (triggers.push.enabled) {
        const parts = [];
        const yamlParts = ['push:'];
        if (triggers.push.branches.length > 0) {
            parts.push(`on branches: ${triggers.push.branches.join(', ')}`);
            yamlParts.push(`  branches: [ ${triggers.push.branches.join(', ')} ]`);
        } else {
            parts.push(`on the \`${branch}\` branch`);
            yamlParts.push(`  branches: [ ${branch} ]`);
        }
        if (triggers.push.branchesIgnore.length > 0) {
            parts.push(`ignoring branches: ${triggers.push.branchesIgnore.join(', ')}`);
            yamlParts.push(`  branches-ignore: [ ${triggers.push.branchesIgnore.map(b => `'${b}'`).join(', ')} ]`);
        }
        const desc = parts.join(', ');
        const yamlExample = yamlParts.join('\\n');
        triggerInstructions.push(`- A 'push' event ${desc}. Example: \`${yamlExample}\``);
    }

    if (triggers.pullRequest.enabled) {
        const parts = [];
        const yamlParts = ['pull_request:'];
        if (triggers.pullRequest.branches.length > 0) {
            parts.push(`for pull requests targeting branches: ${triggers.pullRequest.branches.join(', ')}`);
            yamlParts.push(`  branches: [ ${triggers.pullRequest.branches.join(', ')} ]`);
        } else {
            parts.push(`for pull requests targeting the \`${branch}\` branch`);
            yamlParts.push(`  branches: [ ${branch} ]`);
        }
        if (triggers.pullRequest.branchesIgnore.length > 0) {
            parts.push(`ignoring pull requests for branches: ${triggers.pullRequest.branchesIgnore.join(', ')}`);
            yamlParts.push(`  branches-ignore: [ ${triggers.pullRequest.branchesIgnore.map(b => `'${b}'`).join(', ')} ]`);
        }
        const desc = parts.join(', ');
        const yamlExample = yamlParts.join('\\n');
        triggerInstructions.push(`- A 'pull_request' event ${desc}. Example: \`${yamlExample}\``);
    }

    if (triggers.schedule.enabled && triggers.schedule.crons.length > 0) {
        const cronStrings = triggers.schedule.crons.map(c => `'${c}'`).join(', ');
        const scheduleYaml = `schedule:\\n${triggers.schedule.crons.map(c => `    - cron: '${c}'`).join('\\n')}`;
        triggerInstructions.push(`- A 'schedule' event with cron triggers: ${cronStrings}. Example: \`${scheduleYaml}\``);
    }
    
    if (triggerInstructions.length <= 1) {
        triggerInstructions.push(`- A 'push' event on the \`${branch}\` branch. Example: \`push: branches: [ ${branch} ]\``);
    }
    const triggerBlockInstruction = triggerInstructions.join('\n    ');


    const prompt = `
    Generate a complete, 100% accurate, and production-ready GitHub Actions workflow YAML file to build and deploy a "${techStack}" application to "${deploymentTarget}".
    This workflow is for the "${deploymentEnvironment}" environment in the repository "${repoName}".

    ${analysisInstruction}

    ${techStackInstruction}

    ${detailedInstruction}

    CRITICAL REQUIREMENTS FOR THE YAML:
    1. It MUST include a descriptive 'name' for the workflow, like "Deploy ${techStack} to ${deploymentTarget} (${deploymentEnvironment})".
    2. The workflow MUST be triggered by the following events under a single \`on:\` key:
    ${triggerBlockInstruction}
    3. The jobs MUST run on 'ubuntu-latest'.
    4. YAML indentation MUST be correct (using 2 spaces). This is a critical point of failure.
    5. You MUST use the latest stable versions of official GitHub Actions (e.g., actions/checkout@v4, actions/setup-node@v4, actions/setup-python@v5).
    6. For projects with dependencies (like Node.js, React, Python), include a step to cache dependencies to speed up subsequent builds. Use a reliable caching key (e.g., based on the lock file).
    7. It MUST include a "Test" step that runs the project's test suite (e.g., using 'npm test' or 'pytest'). This step MUST occur AFTER installing dependencies and building (if applicable), but BEFORE the "Deploy" step. If the test step fails, the workflow MUST fail and not proceed to deployment.
    8. Ensure all necessary environment variables are set for each step, especially for deployment steps that require tokens or IDs.
    9. If the workflow has build and deploy steps, ensure the deploy step correctly uses the artifacts from the build step.

    Also, identify ALL configuration values that this workflow requires to function. Separate them into two lists:
    1. Non-sensitive values that can be exposed as GitHub Actions Variables. For example: Node.js version, build directory, package manager.
    2. Sensitive values that MUST be stored as encrypted GitHub Actions Secrets. For example: API tokens (like VERCEL_TOKEN, FIREBASE_TOKEN), private keys, or passwords.

    Return a single, valid JSON object with three keys:
    1. "workflow": A string containing the complete YAML code.
    2. "requiredVariables": The array of non-sensitive variable objects. If none, return an empty array.
    3. "requiredSecrets": The array of sensitive secret objects. If none, return an empty array.
  `;

    const systemInstruction = `You are an expert DevOps engineer specializing in GitHub Actions. Your sole purpose is to generate clean, correct, and complete YAML configuration files and associated non-sensitive variables and sensitive secrets. You ONLY respond with a single, raw JSON object. Do not include any introductory text, explanations, or markdown formatting like \`\`\`json. Your entire response must be parsable as JSON.`;

    const generationPromise = ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
            {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            },
        ],
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                workflow: { type: Type.STRING },
                requiredVariables: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            defaultValue: { type: Type.STRING }
                        },
                        required: ["name", "description"]
                    }
                },
                requiredSecrets: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ["name", "description"]
                    }
                }
            },
            required: ["workflow", "requiredVariables", "requiredSecrets"]
        }
      },
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI workflow generation timed out after 30 seconds.')), 30000)
    );

    const geminiResponse = await Promise.race([generationPromise, timeoutPromise]);
    
    // Explicitly check for a valid response and reason before proceeding.
    const finishReason = geminiResponse.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
         let userMessage = `The AI model stopped generating for an unexpected reason: ${finishReason}.`;
        if (finishReason === 'SAFETY') {
            userMessage = "The request was blocked by the AI's safety filters. This can happen if the generated code or prompt contains sensitive keywords. Please try adjusting your configuration.";
        }
        console.error("Gemini generation finished with reason:", finishReason);
        console.error("Full Gemini Response:", JSON.stringify(geminiResponse, null, 2));
        throw new Error(userMessage);
    }

    let parsed;
    try {
        let responseText = geminiResponse.text;
        
        if (typeof responseText !== 'string' || !responseText.trim()) {
            console.warn("Gemini API returned an empty or non-string response. This might be due to content filtering.");
            console.error("Full Gemini Response:", JSON.stringify(geminiResponse, null, 2));
            throw new Error("The AI model returned an empty or invalid response. This can happen if the prompt is flagged by safety filters.");
        }
        
        // Robustly extract JSON from a string that might be wrapped in markdown or other text.
        if (responseText.includes('{') && responseText.includes('}')) {
             responseText = responseText.substring(responseText.indexOf('{'), responseText.lastIndexOf('}') + 1);
        }

        parsed = JSON.parse(responseText);

    } catch (e) {
        // This catch block handles errors from accessing .text (e.g., due to safety blocks) and from JSON.parse.
        console.error("Failed to process or parse Gemini response:", e);
        // Safely log the raw response text that caused the error for debugging.
        console.error("Raw Gemini Response text that failed parsing:", geminiResponse.text);
        console.error("Raw Gemini Response object:", JSON.stringify(geminiResponse, null, 2));

        // Propagate a user-friendly error.
        throw new Error("The AI model's response could not be processed. It might have been malformed or blocked.");
    }


    // Validate that the parsed object has the properties we expect.
    if (!parsed.workflow || !('requiredVariables' in parsed) || !('requiredSecrets' in parsed)) {
        console.error("Parsed JSON from Gemini is missing required properties.");
        console.error("Parsed Object:", parsed);
        throw new Error("The AI model's response was incomplete or malformed.");
    }

    // Clean up potential markdown code fences from the AI's response.
    let cleanedYaml = parsed.workflow.trim();
    if (cleanedYaml.startsWith('```')) {
        const lines = cleanedYaml.split('\n');
        // Remove the first line (e.g., ```yaml or ```)
        lines.shift();
        // Remove the last line if it's the closing fence
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
            lines.pop();
        }
        cleanedYaml = lines.join('\n');
    }

    return {
        yaml: cleanedYaml.trim(),
        variables: parsed.requiredVariables || [],
        secrets: parsed.requiredSecrets || []
    };
};

// Inlined from _lib/docs-chat-config.ts to maintain consistency with the Vercel Edge Function.
const getSystemInstruction = (repoContext) => {
  const contextInstruction = repoContext
    ? `The user is currently viewing the '${repoContext.full_name}' repository. It is a ${repoContext.language || 'not specified language'} project. It ${repoContext.has_workflows ? 'HAS' : 'DOES NOT HAVE'} an AutoFlow pipeline configured. Tailor your answers to this context.`
    : '';

  return `You are "Buddy Bot", a friendly and helpful AI assistant for AutoFlow. Your knowledge is strictly limited to the AutoFlow application and its features. Do not answer questions about any other topic.
${contextInstruction}

AutoFlow is a web platform that helps developers automate their code deployment using GitHub Actions. It simplifies creating CI/CD pipelines.

Here's what you need to know about AutoFlow:

1.  **Authentication:**
    *   Users log in with a GitHub Personal Access Token (PAT).
    *   The PAT requires two scopes: 'repo' (for full control of repositories to create workflow files) and 'read:user' (to display user name/avatar).

2.  **Core Functionality (How to Configure a Pipeline):**
    *   The user selects a repository from their list.
    *   They click "Configure Pipeline".
    *   In a modal, they choose:
        *   Tech Stack (e.g., React, Next.js, Node.js)
        *   Deployment Target (e.g., Vercel, GitHub Pages, Railway)
        *   Environment (e.g., Staging, Production)
    *   They click "Generate Workflow File". This uses an AI to create a custom GitHub Actions YAML file.
    *   The app then prompts for necessary "Variables" (non-sensitive, e.g., NODE_VERSION) and "Secrets" (sensitive, e.g., VERCEL_TOKEN).
    *   After the user fills these in, they click "Confirm Setup".
    *   AutoFlow then automatically commits the '.yml' file to the '.github/workflows/' directory in their repo and sets the variables and secrets in the repository settings.

3.  **Troubleshooting:**
    *   **Repositories not showing:** This is likely due to the PAT missing the 'repo' scope or the user not having admin/push permissions for the repo.
    *   **Pipeline failed:** The dashboard shows a high-level status. To debug, the user must click the status badge (e.g., "Failed"). This links directly to the detailed logs for that specific workflow run on GitHub.

4.  **Common Deployment Examples:**
    *   **React to Vercel:** Requires secrets like \`VERCEL_TOKEN\`, \`VERCEL_PROJECT_ID\`, and \`VERCEL_ORG_ID\`.
    *   **Static HTML to GitHub Pages:** Usually requires no secrets, as it uses the built-in \`GITHUB_TOKEN\`.
    *   **Node.js to Railway:** Requires a \`RAILWAY_TOKEN\` secret. The workflow installs the Railway CLI and runs \`railway up\`.

Your tone should be encouraging and clear. Keep your answers concise and focused on helping the user with AutoFlow. If asked about something outside your knowledge base, politely state that you can only assist with AutoFlow. When you mention a UI element like a button, wrap it in backticks, for example: \`Configure Pipeline\`.`;
};


// API route to generate workflow
app.post('/api/generate-workflow', async (req, res) => {
  const { techStack, deploymentTarget, deploymentEnvironment, repoName, triggers, analysis } = req.body;
  if (!techStack || !deploymentTarget || !deploymentEnvironment || !repoName || !triggers || !analysis) {
    return res.status(400).json({ error: "Missing required parameters in the request body." });
  }

  try {
    const result = await generateWorkflowLogic({
        techStack,
        deploymentTarget,
        deploymentEnvironment,
        repoName,
        triggers,
        analysis
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error generating workflow:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server.";
    return res.status(500).json({ error: errorMessage });
  }
});

// API route for documentation chat
app.post('/api/chat-with-docs', async (req, res) => {
    try {
        if (!process.env.API_KEY) {
            return res.status(500).json({ error: "Server configuration error: API_KEY is missing." });
        }
        
        const { messages, repoContext } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid "messages" property in request body.' });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const history = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));
        
        const lastMessage = messages[messages.length - 1];
        
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction: getSystemInstruction(repoContext) },
            history: history,
        });

        const stream = await chat.sendMessageStream({ message: lastMessage.content });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                res.write(text);
            }
        }
        res.end();

    } catch (error) {
        console.error("Error in docs chat handler:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        res.status(500).json({ error: errorMessage });
    }
});


// API route to encrypt secrets
app.post('/api/encrypt', async (req, res) => {
    const { publicKey, valueToEncrypt } = req.body;

    if (!publicKey || !valueToEncrypt) {
        return res.status(400).json({ error: 'Missing publicKey or valueToEncrypt.' });
    }

    try {
        await libsodium.ready;
        
        // FIX: Use Node.js's native Buffer for robust encoding, avoiding inconsistencies
        // with the libsodium.utils helper module in different environments.
        const secretBytes = Buffer.from(valueToEncrypt, 'utf8');
        const publicKeyBytes = Buffer.from(publicKey, 'base64');

        // Encrypt the secret using libsodium. It expects Uint8Array, and Buffer is a subclass.
        const encryptedBytes = libsodium.crypto_box_seal(secretBytes, publicKeyBytes);

        // Convert the encrypted Uint8Array back to a base64 string for the GitHub API.
        const encryptedValue = Buffer.from(encryptedBytes).toString('base64');
        
        res.status(200).json({ encryptedValue });
    } catch (error) {
        console.error('Encryption failed:', error);
        res.status(500).json({ error: 'Failed to encrypt secret on the server.' });
    }
});

// --- CLI COMMAND EXECUTION --- //
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
const getExecutablePath = (cli) => {
    return path.resolve(process.cwd(), 'node_modules', '.bin', cli);
};

app.post('/api/run-cli', async (req, res) => {
    const { command, token } = req.body;
    if (typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ error: 'Command must be a non-empty string.' });
    }
     if (typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ error: 'A valid token must be provided.' });
    }
    
    const parts = command.trim().split(/\s+/);
    const cli = parts[0];
    const args = parts.slice(1);

    if (cli !== 'vercel' && cli !== 'railway') {
        return res.status(400).json({ error: `Invalid CLI tool specified. Must be 'vercel' or 'railway'.` });
    }

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

        const exitCode = await new Promise((resolve) => {
            child.on('close', resolve);
        });

        if (exitCode !== 0) {
            return res.status(200).json({ output: stderr || `Command exited with code ${exitCode}`, error: true });
        }
        
        return res.status(200).json({ output: stdout, error: false });

    } catch (error) {
        console.error(`Error executing command: ${command}`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return res.status(500).json({ error: `Server error executing command: ${message}` });
    }
});


// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'dist')));

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});