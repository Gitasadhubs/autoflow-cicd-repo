import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { generateWorkflowLogic } from './api/_lib/workflow-generator.ts';
import { getSystemInstruction } from './api/_lib/docs-chat-config.ts';

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