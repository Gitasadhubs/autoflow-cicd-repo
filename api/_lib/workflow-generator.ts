import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
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

    const railwayInstruction = deploymentTarget === DeploymentTarget.Railway
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

    const timeoutPromise = new Promise<GenerateContentResponse>((_, reject) =>
        setTimeout(() => reject(new Error('AI workflow generation timed out after 30 seconds.')), 30000)
    );

    const geminiResponse = await Promise.race([generationPromise, timeoutPromise]);
    
    let parsed;
    try {
        // The .text accessor is a convenience method. To be robust, especially against
        // cases like safety blocks, we should check for the response content directly.
        const responseText = geminiResponse.text;
        
        if (typeof responseText !== 'string' || !responseText.trim()) {
            console.warn("Gemini API returned an empty or non-string response. This might be due to content filtering.");
            // Log the full response for debugging purposes.
            console.error("Full Gemini Response:", JSON.stringify(geminiResponse, null, 2));
            throw new Error("The AI model returned an empty or invalid response. This can happen if the prompt is flagged by safety filters.");
        }

        parsed = JSON.parse(responseText);

    } catch (e) {
        // This catch block handles both errors from accessing .text and from JSON.parse.
        console.error("Failed to process or parse Gemini response:", e);
        // Safely log the raw response object that caused the error for debugging.
        console.error("Raw Gemini Response object:", JSON.stringify(geminiResponse, null, 2));

        // Propagate a user-friendly error.
        throw new Error("The AI model's response could not be processed. It might have been malformed or incomplete.");
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