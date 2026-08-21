import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createAnthropicClient, type DirectorClient } from '../ai/director/client';

// BYOK (bring-your-own-key) settings for the AI panel. The Anthropic key is the USER's own and is
// stored ONLY in their browser (localStorage) — never in the app bundle, never sent anywhere but
// Anthropic (or a proxy the user explicitly points at). The app ships with no key; AI stays inert
// until one is provided, so the editor still runs with zero keys.
//
// `proxyUrl` is the proxy-ready seam: set it and requests go to your own endpoint (which injects the
// real key server-side) instead of api.anthropic.com — a config swap, not a code change. That is the
// path to switch to once auth + billing exist and a public key-holding endpoint is safe to expose.

interface AiSettingsState {
  apiKey: string;
  proxyUrl: string;
  setApiKey: (k: string) => void;
  setProxyUrl: (u: string) => void;
  clear: () => void;
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      proxyUrl: '',
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setProxyUrl: (proxyUrl) => set({ proxyUrl: proxyUrl.trim() }),
      clear: () => set({ apiKey: '', proxyUrl: '' }),
    }),
    { name: 'flashfx-ai-settings', storage: createJSONStorage(() => localStorage) },
  ),
);

type AiSettings = Pick<AiSettingsState, 'apiKey' | 'proxyUrl'>;

/** True when a transport is configured: a pasted BYOK key, or a proxy URL that holds the key. */
export function isAiConfigured(s: AiSettings): boolean {
  return !!s.apiKey || !!s.proxyUrl;
}

/** Build the wire client from current settings, or null if unconfigured. A proxy wins when set (it
 *  injects the real key server-side, so the browser sends nothing sensitive and needs no direct-
 *  access header); otherwise BYOK calls Anthropic directly with the user's key. */
export function makeAiClient(s: AiSettings): DirectorClient | null {
  if (s.proxyUrl) return createAnthropicClient({ apiKey: s.apiKey || 'proxy', baseUrl: s.proxyUrl });
  if (s.apiKey) return createAnthropicClient({ apiKey: s.apiKey, dangerousDirectBrowserAccess: true });
  return null;
}
