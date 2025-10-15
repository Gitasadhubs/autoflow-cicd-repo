

// Use specific type imports for express to avoid type conflicts with global Request/Response objects.
// FIX: Alias Request and Response to avoid conflicts with global types. This ensures the correct express types are used for the handler.
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { generateWorkflowLogic } from './_lib/workflow-generator';

export default async function handler(req: ExpressRequest, res: ExpressResponse) {
  // Ensure the request method is POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
    console.error("Error generating workflow:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server.";
    return res.status(500).json({ error: errorMessage });
  }
}
