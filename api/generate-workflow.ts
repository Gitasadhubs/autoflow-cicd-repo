// FIX: Using Vercel's specific request and response types for serverless functions
// avoids conflicts with global types and ensures compatibility with the Vercel environment.
// The properties `.method`, `.body`, and methods like `.status()` are available and
// correctly typed on `VercelRequest` and `VercelResponse`.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from '@google/genai';

// Copied from types.ts to make the Vercel function self-contained and avoid bundling issues.
export enum TechStack {
  React = 'React (Vite)',
  NextJS = 'Next.js',
  NodeJS = 'Node.js (Express)',
  Vue = 'Vue.js',
  Static = 'Static HTML/JS'
}

export enum DeploymentTarget {
  Vercel = 'Vercel',
  Firebase = 'Firebase Hosting',
  GitHubPages = 'GitHub Pages',
  Railway = 'Railway',
}

export enum DeploymentEnvironment {
    Staging = 'Staging',
    Production = 'Production',
}


interface GenerationParams {
    techStack: TechStack;
    deploymentTarget: DeploymentTarget;
    deploymentEnvironment: DeploymentEnvironment;
    repoName: string;
}

const generateWorkflowLogic = async ({
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

    const targetSpecificInstructions = {
        [DeploymentTarget.Vercel]: `
        INSTRUCTIONS FOR VERCEL DEPLOYMENT:
        - The deployment MUST be done using the official Vercel CLI.
        - Authentication requires a 'VERCEL_TOKEN', which MUST be a sensitive secret.
        - The deployment also requires 'VERCEL_PROJECT_ID' and 'VERCEL_ORG_ID', which are best handled as secrets because they are sensitive identifiers.
        - The workflow MUST specify the correct production command for Vercel. The full command should be \`vercel pull --yes --environment=${deploymentEnvironment.toLowerCase()} --token=\${{ secrets.VERCEL_TOKEN }} && vercel build --token=\${{ secrets.VERCEL_TOKEN }} && vercel deploy --prebuilt --token=\${{ secrets.VERCEL_TOKEN }}${deploymentEnvironment === DeploymentEnvironment.Production ? ' --prod' : ''}\`
        - REQUIRED SECRETS: VERCEL_TOKEN, Vercel_PROJECT_ID, VERCEL_ORG_ID.
        `,
        [DeploymentTarget.Firebase]: `
        INSTRUCTIONS FOR FIREBASE HOSTING DEPLOYMENT:
        - The deployment MUST be done using the 'firebase-tools' CLI.
        - The workflow must include a step to install 'firebase-tools' (e.g., 'npm install -g firebase-tools').
        - Authentication with Firebase requires a 'FIREBASE_TOKEN', which MUST be defined as a sensitive secret.
        - The deployment command is 'firebase deploy --only hosting --token "\${{ secrets.FIREBASE_TOKEN }}"'.
        - The workflow might need a 'FIREBASE_PROJECT_ID' variable. If the '.firebaserc' file is not committed to the repository, this variable is required. Assume it is required.
        - REQUIRED SECRETS: FIREBASE_TOKEN.
        - REQUIRED VARIABLES: FIREBASE_PROJECT_ID.
        `,
        [DeploymentTarget.GitHubPages]: `
        INSTRUCTIONS FOR GITHUB PAGES DEPLOYMENT:
        - The deployment MUST use the official 'actions/deploy-pages@v4' and 'actions/upload-pages-artifact@v3' actions.
        - This is a two-job process: one 'build' job to create the artifact, and one 'deploy' job that depends on the 'build' job.
        - The 'deploy' job requires specific repository permissions ('pages: write', 'id-token: write'). These permissions MUST be included at the top level of the workflow YAML.
        - This deployment method typically does NOT require any secrets, as it uses the automatically provided GITHUB_TOKEN. Explicitly state that no secrets are required unless the build process itself needs them for other reasons.
        - Ensure the 'build' job correctly identifies the build output path (e.g., 'dist', 'build') and uploads it as an artifact named 'github-pages'.
        `,
        [DeploymentTarget.Railway]: `
        INSTRUCTIONS FOR RAILWAY DEPLOYMENT:
        - The deployment MUST be done using the official Railway CLI.
        - The workflow must include a step to install the Railway CLI (e.g., 'npm install -g @railway/cli').
        - The primary deployment command is 'railway up'.
        - Authentication with Railway requires a 'RAILWAY_TOKEN', which MUST be defined as a sensitive secret.
        - The workflow may benefit from optional variables like 'RAILWAY_PROJECT_ID' or 'RAILWAY_SERVICE_ID' for more complex setups. Define 'RAILWAY_PROJECT_ID' as a required variable.
        - REQUIRED SECRETS: RAILWAY_TOKEN.
        - REQUIRED VARIABLES: RAILWAY_PROJECT_ID.
        `,
    };

    const detailedInstruction = targetSpecificInstructions[deploymentTarget as keyof typeof targetSpecificInstructions] || '';

    // Dynamically create the trigger instruction based on the environment
    const triggerInstruction = deploymentEnvironment === DeploymentEnvironment.Production
        ? "The workflow MUST trigger on a push to the `main` branch. Example: `on: push: branches: [ main ]`"
        : "The workflow MUST trigger on a push to a `staging` branch. Example: `on: push: branches: [ staging ]`";

    const prompt = `
    Generate a complete, 100% accurate, and production-ready GitHub Actions workflow YAML file to build and deploy a "${techStack}" application to "${deploymentTarget}".
    This workflow is for the "${deploymentEnvironment}" environment in the repository "${repoName}".

    ${detailedInstruction}

    CRITICAL REQUIREMENTS FOR THE YAML:
    1. It MUST include a descriptive 'name' for the workflow, like "Deploy ${techStack} to ${deploymentTarget} (${deploymentEnvironment})".
    2. ${triggerInstruction}
    3. The jobs MUST run on 'ubuntu-latest'.
    4. YAML indentation MUST be correct (using 2 spaces). This is a critical point of failure.
    5. You MUST use the latest stable versions of official GitHub Actions (e.g., actions/checkout@v4, actions/setup-node@v4).
    6. For projects with dependencies (like Node.js, React), include a step to cache dependencies to speed up subsequent builds. Use a reliable caching key (e.g., based on the lock file).
    7. Ensure all necessary environment variables are set for each step, especially for deployment steps that require tokens or IDs.
    8. If the workflow has build and deploy steps, ensure the deploy step correctly uses the artifacts from the build step.

    Also, identify ALL configuration values that this workflow requires to function. Separate them into two lists:
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

    const timeoutPromise = new Promise<GenerateContentResponse>((_, reject) =>
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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