import { supabase } from '../lib/supabase';
import { createAnthropicClient, type DirectorClient } from './director/client';

// The MANAGED AI path: a wire client that routes through the FlashFX ai-proxy edge function instead of
// calling Anthropic directly. The key lives server-side, so Pro users generate with NO key of their own;
// the proxy meters their token usage. This is the default for signed-in Pro users - BYOK
// (store/aiSettings) stays as a power-user fallback. Kept OUT of director/client.ts so that module (and
// its node harness) never imports supabase.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The ai-proxy endpoint, or null when Supabase isn't configured. The wire client appends
 *  `/v1/messages`, matching the path the function serves. */
export function managedProxyUrl(): string | null {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ai-proxy`;
}

/** True when the managed path is even possible here (Supabase configured). Signed-in state is checked
 *  separately at call time. */
export function managedAiPossible(): boolean {
  return !!supabase && !!managedProxyUrl();
}

/** Build a client that routes through the managed proxy, or null if it can't (no Supabase, no proxy, or
 *  no active session). The session token is fetched once here and reused for every call in this
 *  generation (Director + each Coder) - a Supabase access token outlives a single generation. */
export async function makeManagedAiClient(): Promise<DirectorClient | null> {
  const proxy = managedProxyUrl();
  if (!supabase || !proxy) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return createAnthropicClient({
    apiKey: 'managed', // ignored by the proxy; the real key lives server-side
    baseUrl: proxy,
    extraHeaders: {
      Authorization: `Bearer ${token}`,
      ...(ANON_KEY ? { apikey: ANON_KEY } : {}),
    },
  });
}
