// FlashFX Link, page side (docs/MCP-PRODUCT-ARCHITECTURE.md, option B / v1). Lets the user's own Claude
// (Claude Desktop / Claude Code, on the user's own subscription: FlashFX never holds an Anthropic key)
// build in THIS editor tab through a local MCP shim (mcp/lib/tab-session.mjs) on 127.0.0.1.
//
// Feature-flagged: loaded from src/main.tsx only when `import.meta.env.DEV` or `VITE_FFX_LINK=1` at build
// time, so production is unchanged until the release turns it on.
//
// Security model (R6): the page only reads a token from the URL FRAGMENT (never sent to our servers) and
// strips it at once; it dials only the literal ws://127.0.0.1:<port>; it connects only after the user
// clicks Connect; the shim checks Origin + Host + the 128-bit one-time token; every call is relayed to the
// existing whitelisted `window.__ffxAgent` (no eval). Pause refuses calls, Disconnect drops the pairing.

import { create } from 'zustand';
import { AGENT_ACTIONS, AGENT_MANIFEST_SCHEMA_VERSION } from './featureManifest';
import {
  LINK_BRIDGE_VERSION,
  LINK_SESSION_STORAGE_KEY,
  linkSocketUrl,
  parseLinkFragment,
  parseShimMessage,
  parseStoredSession,
  stripLinkFragment,
  type LinkMethod,
  type LinkMode,
  type LinkTarget,
  type PageToShim,
} from './linkProtocol';

export type LinkStatus = 'idle' | 'pending' | 'connecting' | 'connected' | 'paused' | 'error';

interface LinkState {
  status: LinkStatus;
  /** A pairing request read from the URL, waiting for the user's Connect click. */
  target: LinkTarget | null;
  error: string | null;
  mode: LinkMode | null;
  client: string | null;
  calls: number;
  lastAction: string | null;
}

export const useLinkStore = create<LinkState>(() => ({
  status: 'idle',
  target: null,
  error: null,
  mode: null,
  client: null,
  calls: 0,
  lastAction: null,
}));

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let userClosed = false;

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

function send(msg: PageToShim): void {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

async function dispatch(method: LinkMethod, args: unknown[]): Promise<unknown> {
  const agent = window.__ffxAgent;
  if (!agent) throw new Error('the FlashFX agent runtime is not installed in this tab');
  switch (method) {
    case 'ping': return { pong: true, visible: document.visibilityState === 'visible' };
    case 'run': return agent.run(String(args[0]), args[1]);
    case 'getState': return agent.getState();
    case 'listFeatures': return agent.listFeatures();
    case 'readExport': return agent.readExport(String(args[0]), Number(args[1]), Number(args[2]));
    case 'releaseExport': return agent.releaseExport(String(args[0]));
    case 'writeUpload': return agent.writeUpload(String(args[0]), Number(args[1]), String(args[2]));
    case 'discardUpload': return agent.discardUpload(String(args[0]));
  }
}

function onMessage(ev: MessageEvent): void {
  const msg = parseShimMessage(ev.data);
  if (!msg) return;
  if (msg.type === 'welcome') {
    reconnectAttempts = 0;
    const port = useLinkStore.getState().target?.port ?? parseStoredSession(storage()?.getItem(LINK_SESSION_STORAGE_KEY) ?? null)?.port;
    if (port) storage()?.setItem(LINK_SESSION_STORAGE_KEY, JSON.stringify({ port, sessionKey: msg.sessionKey }));
    useLinkStore.setState({ status: 'connected', target: null, error: null, mode: msg.mode, client: msg.client ?? null });
    return;
  }
  if (msg.type === 'bye') {
    // The shim refused or ended the pairing (restarted, another tab connected, user disconnected there).
    storage()?.removeItem(LINK_SESSION_STORAGE_KEY);
    userClosed = true;
    socket?.close();
    useLinkStore.setState({ status: 'error', error: byeMessage(msg.reason), mode: null });
    return;
  }
  const { id, method, args } = msg;
  if (useLinkStore.getState().status === 'paused') {
    send({ type: 'result', id, ok: false, error: 'paused by the user in the FlashFX tab (ask them to click Resume)' });
    return;
  }
  if (method === 'run') useLinkStore.setState((s) => ({ calls: s.calls + 1, lastAction: String(args[0]) }));
  dispatch(method, args).then(
    (value) => send({ type: 'result', id, ok: true, value: value === undefined ? null : value }),
    (err: unknown) => send({ type: 'result', id, ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
}

function byeMessage(reason: string): string {
  if (reason === 'already-connected') return 'Claude is already connected to another FlashFX tab. Use that tab, or disconnect it first.';
  if (reason === 'bad-token' || reason === 'unknown-session') return 'This connection link has expired. Ask Claude to connect again: it will open a fresh link.';
  if (reason === 'incompatible') return 'This editor and your FlashFX Link are different versions. Update FlashFX Link, then reload this page.';
  if (reason === 'disconnected') return 'Claude disconnected.';
  return `Connection closed (${reason}).`;
}

function open(port: number, hello: { token?: string; sessionKey?: string }): void {
  if (socket) { userClosed = true; socket.close(); }
  userClosed = false;
  useLinkStore.setState({ status: 'connecting', error: null });
  let ws: WebSocket;
  try {
    ws = new WebSocket(linkSocketUrl(port));
  } catch (e) {
    useLinkStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    return;
  }
  socket = ws;
  let opened = false;
  ws.onopen = () => {
    opened = true;
    send({
      type: 'hello',
      bridgeVersion: LINK_BRIDGE_VERSION,
      ...hello,
      agentVersion: window.__ffxAgent?.version ?? 'none',
      manifestVersion: AGENT_MANIFEST_SCHEMA_VERSION,
      appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
      actions: AGENT_ACTIONS.map((a) => a.id),
    });
  };
  ws.onmessage = onMessage;
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (userClosed) return;
    const stored = parseStoredSession(storage()?.getItem(LINK_SESSION_STORAGE_KEY) ?? null);
    const st = useLinkStore.getState();
    // A paired tab whose socket dropped (the shim restarted or the laptop slept): retry quietly a few times.
    if (stored && (st.status === 'connected' || st.status === 'paused' || st.status === 'connecting') && reconnectAttempts < 5) {
      reconnectAttempts += 1;
      useLinkStore.setState({ status: 'connecting' });
      reconnectTimer = setTimeout(() => open(stored.port, { sessionKey: stored.sessionKey }), 1000 * reconnectAttempts);
      return;
    }
    useLinkStore.setState({
      status: 'error',
      mode: null,
      error: opened
        ? 'Claude disconnected. Ask Claude to connect again.'
        : 'Could not reach FlashFX Link on this computer. If your browser asked about apps on this device, click Allow. Otherwise check that Claude is running with FlashFX Link.',
    });
  };
}

/** The user's Connect click (a user gesture: Chrome's Local Network Access prompt needs one). */
export function connectFlashLink(): void {
  const t = useLinkStore.getState().target;
  if (t) open(t.port, { token: t.token });
}

/** Refuse Claude's calls without dropping the pairing. */
export function pauseFlashLink(): void {
  if (useLinkStore.getState().status !== 'connected') return;
  useLinkStore.setState({ status: 'paused' });
  send({ type: 'event', event: 'paused' });
}

export function resumeFlashLink(): void {
  if (useLinkStore.getState().status !== 'paused') return;
  useLinkStore.setState({ status: 'connected' });
  send({ type: 'event', event: 'resumed' });
}

/** Drop the pairing (Claude needs a fresh link to come back). Also dismisses a pending request. */
export function disconnectFlashLink(): void {
  userClosed = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  storage()?.removeItem(LINK_SESSION_STORAGE_KEY);
  socket?.close();
  socket = null;
  useLinkStore.setState({ status: 'idle', target: null, error: null, mode: null, client: null });
}

function readFragment(): void {
  const target = parseLinkFragment(window.location.hash);
  if (!window.location.hash.includes('ffx-link=')) return;
  // Strip the token from the address bar and history straight away, valid or not.
  const clean = window.location.pathname + window.location.search + stripLinkFragment(window.location.hash);
  window.history.replaceState(window.history.state, '', clean);
  if (target) useLinkStore.setState({ status: 'pending', target, error: null });
}

let installed = false;

/** Install once from src/main.tsx (behind the feature flag). */
export function installFlashLink(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  readFragment();
  window.addEventListener('hashchange', readFragment);
  // Forward page errors to the shim so Claude can see why a call failed.
  const forward = (line: string) => { if (useLinkStore.getState().status === 'connected') send({ type: 'event', event: 'log', line: line.slice(0, 500) }); };
  window.addEventListener('error', (e) => forward(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => forward(`unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));
  // A tab that was paired before a reload reconnects with its session key (no new prompt, no new click).
  if (useLinkStore.getState().status !== 'pending') {
    const stored = parseStoredSession(storage()?.getItem(LINK_SESSION_STORAGE_KEY) ?? null);
    if (stored) open(stored.port, { sessionKey: stored.sessionKey });
  }
}
