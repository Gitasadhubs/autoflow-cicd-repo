import { GoogleGenAI } from '@google/genai';

// Configure the Vercel function to run on the Edge for streaming capabilities
export const config = {
  runtime: 'edge',
};

const systemInstruction = `You are an expert DevOps and code debugging assistant. Your task is to analyze failed GitHub Actions logs.
- Identify the root cause of the failure.
- Provide a clear, concise explanation of what went wrong.
- Offer a specific, actionable solution (e.g., code change, configuration update, command to run).
- Format your entire response in Markdown. Use headings, code blocks for commands or code snippets, and lists for clarity.
- If the logs are empty or don't contain a clear error, state that and suggest general debugging steps.
- Be helpful and encouraging.`;

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

    const { logs, repoName } = await req.json();
    if (!logs || !repoName) {
      return new Response(JSON.stringify({ error: 'Request body must contain "logs" and "repoName".' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `Analyze the following GitHub Actions logs for a failed deployment in the "${repoName}" repository and suggest a fix.\n\nLOGS:\n\`\`\`\n${logs}\n\`\`\``;

    const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: { systemInstruction },
    });
    
    // Create a ReadableStream to pipe the Gemini response to the client
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) {
             controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
    });

  } catch (error) {
    console.error("Error in AI debug handler:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}