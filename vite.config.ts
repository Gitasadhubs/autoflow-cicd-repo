import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        'react-simple-code-editor',
        'prismjs',
        'prismjs/components/prism-yaml.js',
      ]
    }
  },
  server: {
    proxy: {
      // Proxy API requests to the Express server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    }
  }
})