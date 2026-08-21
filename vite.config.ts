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
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Split the biggest, rarely-changing vendor libs out of the main app chunk so they
        // download in parallel and stay cached across app deploys. The heavy feature deps
        // (@imgly, @huggingface, rapier, mp4-muxer) are already dynamically imported / in
        // workers, so they're their own chunks; this only touches the always-loaded vendors.
        manualChunks(id) {
          const n = id.replace(/\\/g, '/');
          if (!n.includes('/node_modules/')) return undefined;
          if (n.includes('/react-dom/') || n.includes('/react/') || n.includes('/scheduler/')) return 'vendor-react';
          if (n.includes('/@supabase/')) return 'vendor-supabase';
          if (n.includes('/opentype')) return 'vendor-opentype';
          if (n.includes('/lucide-react/')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
});
