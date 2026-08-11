import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadBundledFonts } from './engine/fonts';

// Register the bundled OFL faces with the browser as early as possible so the text rasterizer
// stops falling back to sans-serif for everything but the UI default.
loadBundledFonts();

// Dev-only: exposes window.__aiCompile('showreel') to compile+commit an AI fixture onto the canvas.
if (import.meta.env.DEV) {
  import('./ai/devHook').then((m) => m.installAiDevHook()).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
