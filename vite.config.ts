import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to the Express server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    }
  },
  build: {
    rollupOptions: {
      // Externalize modules that are loaded via import map to prevent build errors
      external: ['react-simple-code-editor', 'prismjs', /^prismjs\/.*/]
    }
  }
})