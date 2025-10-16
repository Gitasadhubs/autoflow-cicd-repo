import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';

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
}) => {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set on the server.");
        throw new Error("Server configuration error: API_KEY is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Dynamically create the trigger instruction based on the environment
    const triggerInstruction = deploymentEnvironment === 'Production'
        ? "The workflow MUST trigger on a push to the `main` branch. Example: `on: push: branches: [ main ]`"
        : "The workflow MUST trigger on a push to a `staging` branch. Example: `on: push: branches: [ staging ]`";

    const railwayInstruction = deploymentTarget === 'Railway'
    ? `
    INSTRUCTIONS FOR RAILWAY DEPLOYMENT:
    - The deployment MUST be done using the official Railway CLI.
    - The workflow must include a step to install the Railway CLI (e.g., 'npm install -g @railway/cli').
    - The primary deployment command is 'railway up'.
    - Authentication with Railway requires a 'RAILWAY_TOKEN', which MUST be defined as a sensitive secret.
    - The workflow may also benefit from optional variables like 'RAILWAY_PROJECT_ID' or 'RAILWAY_SERVICE_ID' for more complex setups, but these are not always required.
    `
    : '';

    const prompt = `
    Generate a complete and functional GitHub Actions workflow YAML file to build and deploy a "${techStack}" application to "${deploymentTarget}".
    This workflow is for the "${deploymentEnvironment}" environment in the repository "${repoName}".
    ${railwayInstruction}

    CRITICAL REQUIREMENTS FOR THE YAML:
    1. It MUST include a descriptive 'name' for the workflow, like "Deploy ${techStack} to ${deploymentTarget} (${deploymentEnvironment})".
    2. ${triggerInstruction}
    3. The jobs should run on 'ubuntu-latest'.
    4. YAML indentation MUST be correct (using 2 spaces). Incorrect indentation is a common error and will break the workflow.
    5. Use the latest stable versions of official GitHub Actions (e.g., actions/checkout@v4).
    6. For projects with dependencies (like Node.js, React), include a step to cache dependencies to speed up subsequent builds.

    Also, identify any configuration values that this workflow might need. Separate them into two lists:
    1. Non-sensitive values that can be exposed as GitHub Actions Variables. For example: Node.js version, build directory, package manager.
    2. Sensitive values that MUST be stored as encrypted GitHub Actions Secrets. For example: API tokens (like VERCEL_TOKEN, FIREBASE_TOKEN), private keys, or passwords.

    List the non-sensitive variables as an array of objects, where each object has a 'name', a 'description', and an optional 'defaultValue'.
    List the sensitive secrets as an array of objects, where each object has a 'name' and a 'description'. Do NOT ask for the secret's value.

    Return a single, valid JSON object with three keys:
    1. "workflow": A string containing the complete YAML code.
    2. "requiredVariables": The array of non-sensitive variable objects. If none, return an empty array.
    3. "requiredSecrets": The array of sensitive secret objects. If none, return an empty array.
  `;

    const systemInstruction = `You are an expert DevOps engineer specializing in GitHub Actions. Your sole purpose is to generate clean, correct, and complete YAML configuration files and associated non-sensitive variables and sensitive secrets. You ONLY respond with a single JSON object.`;

    const generationPromise = ai.models.generateContent({
      model: "gemini-2.5-flash",
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
        const responseText = geminiResponse.text;
        
        if (typeof responseText !== 'string' || !responseText.trim()) {
            console.warn("Gemini API returned an empty or non-string response. This might be due to content filtering.");
            console.error("Full Gemini Response:", JSON.stringify(geminiResponse, null, 2));
            throw new Error("The AI model returned an empty or invalid response. This can happen if the prompt is flagged by safety filters.");
        }

        parsed = JSON.parse(responseText);

    } catch (e) {
        // This catch block handles errors from accessing .text (e.g., due to safety blocks) and from JSON.parse.
        console.error("Failed to process or parse Gemini response:", e);
        // Safely log the raw response object that caused the error for debugging.
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


    return {
        yaml: parsed.workflow,
        variables: parsed.requiredVariables || [],
        secrets: parsed.requiredSecrets || []
    };
};

// Inlined from _lib/docs-chat-config.ts to maintain consistency with the Vercel Edge Function.
const getSystemInstruction = () => {
  return `You are "Buddy Bot", a friendly and helpful AI assistant for AutoFlow. Your knowledge is strictly limited to the AutoFlow application and its features. Do not answer questions about any other topic.

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

// --- API Endpoints ---

// Endpoint for workflow generation
app.post('/api/generate-workflow', async (req, res) => {
  const { techStack, deploymentTarget, deploymentEnvironment, repoName } = req.body;

  if (!techStack || !deploymentTarget || !deploymentEnvironment || !repoName) {
    return res.status(400).json({ error: "Missing required parameters in the request body." });
  }

  try {
    const result = await generateWorkflowLogic({
      techStack,
      deploymentTarget,
      deploymentEnvironment,
      repoName,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server.";
    return res.status(500).json({ error: errorMessage });
  }
});

// Endpoint for the documentation chat
app.post('/api/chat-with-docs', async (req, res) => {
  if (!process.env.API_KEY) {
      return res.status(500).json({ error: "Server configuration error: API_KEY is missing." });
  }
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
  }

  try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const history = messages.slice(0, -1).map((msg) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
      }));
      
      const lastMessage = messages[messages.length - 1];
      
      const chat = ai.chats.create({
          model: 'gemini-2.5-flash',
          config: { systemInstruction: getSystemInstruction() },
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
      console.error("Error in local chat handler:", error);
      res.status(500).json({ error: "Error communicating with the AI model." });
  }
});


// --- Static File Serving ---
// Serve the built Vite app from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// For any other request, serve the index.html file so client-side routing works.
// This must be after all API routes.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});