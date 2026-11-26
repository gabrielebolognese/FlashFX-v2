// FlashFX Link wire protocol (page side). Pure: no React, no DOM, no stores, so it is unit-testable and
// shared by the bridge (src/agent/bridge.ts) and any future relay (docs/MCP-PRODUCT-ARCHITECTURE.md,
// phase 3 reuses it). The shim side is mcp/lib/tab-session.mjs; keep the two in step (LINK_BRIDGE_VERSION).
//
// Flow: the local MCP shim opens `https://editor.flashfx.app/#ffx-link=<port>.<token>`. The page reads and
// strips that fragment (it never reaches the server: fragments are not sent over HTTP), the user clicks
// Connect (a user gesture, required for Chrome's Local Network Access prompt), the page dials
// `ws://127.0.0.1:<port>/link` and sends `hello` with the one-time token. The shim answers `welcome` with a
// per-tab session key (for an automatic reconnect after a reload) and then sends `call`s that the page
// relays to the whitelisted `window.__ffxAgent` runtime. No eval anywhere: `method` is one of LINK_METHODS.

export const LINK_BRIDGE_VERSION = 1;
export const LINK_FRAGMENT_KEY = 'ffx-link';
export const LINK_WS_PATH = '/link';
/** sessionStorage key for the reconnect session (per tab, gone when the tab closes). */
export const LINK_SESSION_STORAGE_KEY = 'ffx-link-session';

/** The only page methods a shim may call (all map 1:1 onto window.__ffxAgent). */
export const LINK_METHODS = ['run', 'getState', 'listFeatures', 'readExport', 'releaseExport', 'writeUpload', 'discardUpload', 'ping'] as const;
export type LinkMethod = (typeof LINK_METHODS)[number];

export interface LinkTarget {
  port: number;
  token: string;
}

export interface LinkSession {
  port: number;
  sessionKey: string;
}

export type LinkMode = 'full' | 'personal';

export type ShimToPage =
  | { type: 'welcome'; sessionKey: string; shimVersion: string; mode: LinkMode; client?: string }
  | { type: 'call'; id: number; method: LinkMethod; args: unknown[] }
  | { type: 'bye'; reason: string };

export type PageToShim =
  | {
    type: 'hello';
    bridgeVersion: number;
    token?: string;
    sessionKey?: string;
    agentVersion: string;
    manifestVersion: number;
    appVersion: string;
    actions: string[];
  }
  | { type: 'result'; id: number; ok: true; value: unknown }
  | { type: 'result'; id: number; ok: false; error: string }
  | { type: 'event'; event: 'log'; line: string }
  | { type: 'event'; event: 'paused' | 'resumed' };

// 128-bit+ secrets, hex or base64url. Anything else is not a token we issued.
const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;

function validPort(n: number): boolean {
  return Number.isInteger(n) && n >= 1024 && n <= 65535;
}

/** Read `ffx-link=<port>.<token>` from a location hash (`#ffx-link=...` or `#a=b&ffx-link=...`). */
export function parseLinkFragment(hash: string): LinkTarget | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq) !== LINK_FRAGMENT_KEY) continue;
    const value = part.slice(eq + 1);
    const dot = value.indexOf('.');
    if (dot === -1) return null;
    const port = Number(value.slice(0, dot));
    const token = value.slice(dot + 1);
    if (!validPort(port) || !SECRET_RE.test(token)) return null;
    return { port, token };
  }
  return null;
}

/** The hash with the `ffx-link` parameter removed ('' when nothing else is left). */
export function stripLinkFragment(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const rest = raw.split('&').filter((p) => p && !p.startsWith(`${LINK_FRAGMENT_KEY}=`));
  return rest.length ? `#${rest.join('&')}` : '';
}

/** The loopback WebSocket URL for a port. The page only ever dials the literal 127.0.0.1. */
export function linkSocketUrl(port: number): string {
  if (!validPort(port)) throw new Error(`invalid FlashFX Link port ${port}`);
  return `ws://127.0.0.1:${port}${LINK_WS_PATH}`;
}

export function parseStoredSession(raw: string | null): LinkSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LinkSession>;
    if (typeof v.port === 'number' && validPort(v.port) && typeof v.sessionKey === 'string' && SECRET_RE.test(v.sessionKey)) {
      return { port: v.port, sessionKey: v.sessionKey };
    }
  } catch { /* corrupt entry */ }
  return null;
}

/** Validate one message from the shim. Anything malformed is dropped (null), never executed. */
export function parseShimMessage(raw: unknown): ShimToPage | null {
  if (typeof raw !== 'string' || raw.length > 256 * 1024 * 1024) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.type) {
    case 'welcome':
      if (typeof o.sessionKey !== 'string' || !SECRET_RE.test(o.sessionKey) || typeof o.shimVersion !== 'string') return null;
      return {
        type: 'welcome',
        sessionKey: o.sessionKey,
        shimVersion: o.shimVersion,
        mode: o.mode === 'full' ? 'full' : 'personal',
        ...(typeof o.client === 'string' ? { client: o.client.slice(0, 80) } : {}),
      };
    case 'call':
      if (typeof o.id !== 'number' || !Number.isInteger(o.id)) return null;
      if (typeof o.method !== 'string' || !(LINK_METHODS as readonly string[]).includes(o.method)) return null;
      if (o.args !== undefined && !Array.isArray(o.args)) return null;
      return { type: 'call', id: o.id, method: o.method as LinkMethod, args: (o.args as unknown[] | undefined) ?? [] };
    case 'bye':
      return { type: 'bye', reason: typeof o.reason === 'string' ? o.reason.slice(0, 200) : 'closed' };
    default:
      return null;
  }
}
