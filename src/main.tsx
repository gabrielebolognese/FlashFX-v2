import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadBundledFonts } from './engine/fonts';
import { hydrateCustomFonts } from './engine/customFonts';
import { installGlobalErrorHandlers, trackEvent } from './lib/telemetry';
import { RootErrorBoundary } from './ui/RootErrorBoundary';
import { UnsupportedBrowser } from './ui/UnsupportedBrowser';
import { useAuthStore } from './auth/store';

// Route uncaught errors + unhandled promise rejections into telemetry before anything else runs.
installGlobalErrorHandlers();

const root = createRoot(document.getElementById('root')!);

// Pre-flight: a browser with no WebGPU at all (Safari, Firefox w/o flag, old browsers) can never
// run the renderer/export. Show a clean "unsupported" screen instead of booting into the confusing
// infinite-reset recovery overlay. (A GPU-present-but-no-adapter failure stays with the in-app
// recovery flow — that's a driver/hardware issue, not a browser-choice one.)
if (!('gpu' in navigator)) {
  root.render(
    <StrictMode>
      <UnsupportedBrowser />
    </StrictMode>
  );
} else {
  // Register the bundled OFL faces + any user-imported fonts with the browser as early as possible
  // so the text rasterizer stops falling back to sans-serif. Custom fonts live in their own IndexedDB
  // (shared across all projects) and are registered here at boot.
  loadBundledFonts();
  hydrateCustomFonts();

  // Dev-only: exposes window.__aiCompile('showreel') to compile+commit an AI fixture onto the canvas.
  if (import.meta.env.DEV) {
    import('./ai/devHook').then((m) => m.installAiDevHook()).catch(() => {});
  }

  // Hydrate any existing auth session + subscribe to changes (null-guarded: a no-op
  // until Supabase is configured, so the local-first app is unaffected).
  useAuthStore.getState().init();

  trackEvent('app_boot');

  root.render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>
  );
}
