import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateWorkflowLogic } from './api/_lib/workflow-generator.ts';

// Basic setup for Express server
const app = express();
const PORT = process.env.PORT || 3001;

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To parse JSON bodies

// --- API Endpoint ---
// This now uses the shared logic from the new module.
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


// --- Static File Serving ---
// Serve the built Vite app from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// For any other request, serve the index.html file so client-side routing works.
// This must be after the API route.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});