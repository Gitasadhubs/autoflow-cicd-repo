import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'react-simple-code-editor',
        'prismjs',
        /^prismjs\/.*/, // To handle imports like 'prismjs/components/prism-yaml.js'
      ],
    },
  },
  server: {
    // This proxy is for local development to forward API requests
    // to the Express server running on port 3001.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
