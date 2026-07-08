import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['lucide-react', '@dimforge/rapier2d-compat'],
    include: ['@splinetool/runtime', '@splinetool/react-spline'],
  },
  worker: {
    format: 'es',
  },
});
