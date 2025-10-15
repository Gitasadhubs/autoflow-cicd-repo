import { GoogleGenAI } from '@google/genai';
import { getSystemInstruction } from './_lib/docs-chat-config';

// Configure the Vercel function to run on the Edge for streaming capabilities
export const config = {
  runtime: 'edge',
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

    const { messages } = await req.json();
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
        config: { systemInstruction: getSystemInstruction() },
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
