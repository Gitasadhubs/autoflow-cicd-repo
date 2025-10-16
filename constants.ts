// constants.ts

// Determines the base URL for API calls.
// By using a relative path (''), API requests are sent to the same origin
// as the frontend. This works for both:
// 1. Local development: Vite's proxy redirects '/api' requests to the local Express server.
// 2. Vercel deployment: The frontend and the serverless functions in the '/api'
//    directory are hosted on the same domain, so requests work seamlessly.
const API_BASE_URL = '';

export const API_ENDPOINT_GENERATE_WORKFLOW = `${API_BASE_URL}/api/generate-workflow`;
export const API_ENDPOINT_BUDDY_BOT_CHAT = `${API_BASE_URL}/api/chat-with-docs`;