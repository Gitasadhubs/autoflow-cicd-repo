import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { generateWorkflowLogic } from './api/_lib/workflow-generator.ts';

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