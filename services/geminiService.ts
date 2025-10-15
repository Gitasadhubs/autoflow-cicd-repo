
import { GoogleGenAI, Type } from "@google/genai";
import { TechStack, DeploymentTarget, DeploymentEnvironment, RequiredVariable, RequiredSecret } from '../types';

if (!process.env.API_KEY) {
  // In a real app, you would want to handle this more gracefully.
  // For this project, we assume the API_KEY is set in the environment.
  console.warn("API_KEY environment variable not set. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

interface WorkflowGenerationResponse {
  yaml: string;
  variables: RequiredVariable[];
  secrets: RequiredSecret[];
}

export const generateWorkflow = async (
  techStack: TechStack,
  deploymentTarget: DeploymentTarget,
  deploymentEnvironment: DeploymentEnvironment,
  repoName: string
): Promise<WorkflowGenerationResponse> => {
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
    const response = await ai.models.generateContent({
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

    const jsonString = response.text.trim();
    const parsed = JSON.parse(jsonString);
    
    return {
        yaml: parsed.workflow,
        variables: parsed.requiredVariables || [],
        secrets: parsed.requiredSecrets || []
    };

  } catch (error) {
    console.error("Error generating workflow:", error);
    // Fix: The caught error is of type 'unknown'. Cast to 'Error' to access the 'message' property.
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      yaml: `# An error occurred while generating the workflow.\n# Please check your API key and network connection.\n# Error: ${errorMessage}`,
      variables: [],
      secrets: []
    };
  }
};