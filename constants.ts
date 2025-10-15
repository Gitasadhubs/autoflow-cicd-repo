// constants.ts

// Determines the base URL for API calls by checking the hostname.
// This is a robust way to distinguish between local development and the deployed production environment.
// In production (Vercel), it points to the live Railway backend.
// In development, it uses a relative path, relying on the dev server's proxy.
const isProduction = !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE_URL = isProduction
  ? 'https://autoflow-cicd-backend-production.up.railway.app'
  : '';

export const API_ENDPOINT_GENERATE_WORKFLOW = `${API_BASE_URL}/api/generate-workflow`;
export const API_ENDPOINT_BUDDY_BOT_CHAT = `${API_BASE_URL}/api/chat-with-docs`;