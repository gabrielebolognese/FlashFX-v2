import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'node:child_process';

// Build stamp for the in-app export diagnostics block (so a bug report says exactly which build ran).
// Netlify exposes the commit as COMMIT_REF; fall back to a local git read, then to 'dev'. Guarded so a
// missing .git / git binary never fails the build.
function resolveAppVersion(): string {
  const ref = process.env.COMMIT_REF;
  if (ref && ref.length >= 7) return ref.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(resolveAppVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
