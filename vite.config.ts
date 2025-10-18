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
      // Don't bundle CDN-imported libraries
      external: [
        'react-simple-code-editor',
        'prismjs',
        // Match any sub-path of prismjs, e.g., 'prismjs/components/prism-yaml.js'
        /^prismjs\// 
      ]
    }
  }
})