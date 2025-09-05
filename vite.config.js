import { defineConfig } from 'vite';

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
    open: true
  }
});
