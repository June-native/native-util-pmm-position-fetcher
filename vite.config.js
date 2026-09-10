import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          ethers: ['ethers']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [resolve(__dirname)]
    }
  }
});
