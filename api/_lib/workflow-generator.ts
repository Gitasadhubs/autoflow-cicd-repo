import { GoogleGenAI, Type } from '@google/genai';
import { TechStack, DeploymentTarget, DeploymentEnvironment } from '../../types';

interface GenerationParams {
    techStack: TechStack;
    deploymentTarget: DeploymentTarget;
    deploymentEnvironment: DeploymentEnvironment;
    repoName: string;
}

export const generateWorkflowLogic = async ({
    techStack,
    deploymentTarget,
    deploymentEnvironment,
    repoName,
}: GenerationParams) => {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set on the server.");
        throw new Error("Server configuration error: API_KEY is missing.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Dynamically create the trigger instruction based on the environment
    const triggerInstruction = deploymentEnvironment === DeploymentEnvironment.Production
        ? "The workflow MUST trigger on a push to the `main` branch. Example: `on: push: branches: [ main ]`"
        : "The workflow MUST trigger on a push to a `staging` branch. Example: `on: push: branches: [ staging ]`";

    const prompt = `
    Generate a complete and functional GitHub Actions workflow YAML file to build and deploy a "${techStack}" application to "${deploymentTarget}".
    This workflow is for the "${deploymentEnvironment}" environment in the repository "${repoName}".

    CRITICAL REQUIREMENTS FOR THE YAML:
    1. It MUST include a descriptive 'name' for the workflow, like "Deploy ${techStack} to ${deploymentTarget} (${deploymentEnvironment})".
    2. ${triggerInstruction}
    3. The jobs should run on 'ubuntu-latest'.
    4. Use the latest stable versions of official GitHub Actions (e.g., actions/checkout@v4).
    5. For projects with dependencies (like Node.js, React), include a step to cache dependencies to speed up subsequent builds.

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

    let parsed;
    try {
        const jsonString = geminiResponse.text.trim();
        if (!jsonString) {
            throw new Error("Gemini API returned an empty response.");
        }
        parsed = JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse Gemini response as JSON.");
        console.error("Raw Gemini Response Text:", geminiResponse.text);
        throw new Error("The AI model returned a response that was not valid JSON. Please try again.");
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