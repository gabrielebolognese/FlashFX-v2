/// <reference types="vite/client" />

// Build-time constants injected by vite `define` (see vite.config.ts). Used by the export diagnostics
// block so a bug report carries the exact build hash + build time.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** '1' turns on FlashFX Link (src/agent/bridge.ts) in a production build; dev builds always have it. */
  readonly VITE_FFX_LINK?: string;
}
