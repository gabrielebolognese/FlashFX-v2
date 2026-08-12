import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadBundledFonts } from './engine/fonts';
import { hydrateCustomFonts } from './engine/customFonts';

// Register the bundled OFL faces + any user-imported fonts with the browser as early as possible
// so the text rasterizer stops falling back to sans-serif. Custom fonts live in their own IndexedDB
// (shared across all projects) and are registered here at boot.
loadBundledFonts();
hydrateCustomFonts();

// Dev-only: exposes window.__aiCompile('showreel') to compile+commit an AI fixture onto the canvas.
if (import.meta.env.DEV) {
  import('./ai/devHook').then((m) => m.installAiDevHook()).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
