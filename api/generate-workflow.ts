// This is a server-side file and will be deployed as a serverless function.
// It is designed to work with platforms like Vercel out-of-the-box.
import { GoogleGenAI, Type } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This function is the handler for the serverless endpoint.
export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set on the server.");
    return response.status(500).json({ error: "Server configuration error: API_KEY is missing." });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const { techStack, deploymentTarget, deploymentEnvironment, repoName } = request.body;

  if (!techStack || !deploymentTarget || !deploymentEnvironment || !repoName) {
    return response.status(400).json({ error: "Missing required parameters in the request body." });
  }
  
  const prompt = `
    Generate a complete and functional GitHub Actions workflow YAML file to build and deploy a "${techStack}" application to "${deploymentTarget}".
    This workflow is for the "${deploymentEnvironment}" environment in the repository "${repoName}".

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

  try {
    const geminiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
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

    const jsonString = geminiResponse.text.trim();
    const parsed = JSON.parse(jsonString);
    
    const result = {
        yaml: parsed.workflow,
        variables: parsed.requiredVariables || [],
        secrets: parsed.requiredSecrets || []
    };
    
    return response.status(200).json(result);

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred on the server.";
    return response.status(500).json({ error: errorMessage });
  }
}
