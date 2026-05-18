import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../src/frontend',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3456',
    },
  },
});
