import { GoogleGenAI } from '@google/genai';

// Configure the Vercel function to run on the Edge for streaming capabilities
export const config = {
  runtime: 'edge',
};

// Minimal type definition to avoid bundling issues with the edge runtime.
interface RepoContext {
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    has_workflows: boolean;
}

// Inlined from _lib/docs-chat-config.ts to resolve Vercel Edge Function build error
// regarding module resolution in the edge runtime.
const getSystemInstruction = (repoContext: RepoContext | null) => {
  const contextInstruction = repoContext
    ? `The user is currently viewing the '${repoContext.full_name}' repository. It is a ${repoContext.language || 'not specified language'} project. It ${repoContext.has_workflows ? 'HAS' : 'DOES NOT HAVE'} an AutoFlow pipeline configured. Tailor your answers to this context.`
    : '';
  
  return `You are "Buddy Bot", a friendly and helpful AI assistant for AutoFlow. Your knowledge is strictly limited to the AutoFlow application and its features. Do not answer questions about any other topic.
${contextInstruction}

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

// The main handler for the chat endpoint, using the native Request and Response APIs
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!process.env.API_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration error: API_KEY is missing." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { messages, repoContext } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid "messages" property in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Convert the message history from the client format to the Gemini API format
    const history = messages.slice(0, -1).map((msg: { role: string; content: string }) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));
    
    const lastMessage = messages[messages.length - 1];
    
    // Create a new chat session with the system instruction and history
    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: getSystemInstruction(repoContext) },
        history: history,
    });
    
    // Get a streaming response from the Gemini API
    const stream = await chat.sendMessageStream({ message: lastMessage.content });
    
    // Create a ReadableStream to pipe the Gemini response to the client
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
             // Encode the text chunk and enqueue it to the stream
             controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      },
    });

    // Return the stream as the response
    return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
    });

  } catch (error) {
    console.error("Error in docs chat handler:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}