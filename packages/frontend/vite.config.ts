import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill for Solana libraries
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['ganymede'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  resolve: {
    dedupe: ['@solana/web3.js'],
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
