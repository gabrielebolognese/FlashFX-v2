// Session modes of the FlashFX MCP server (docs/MCP-PRODUCT-ARCHITECTURE.md):
//   headless (default from source): launches its own Chrome over CDP (session.mjs). Automation, CI, gpu:*.
//   tab: FlashFX Link, pairs with the user's own editor tab over a loopback WebSocket (tab-session.mjs).
//   auto: tab, falling back to headless (a headed Chrome window on a persistent profile) when no tab
//         pairs within FLASHFX_LINK_AUTO_WAIT_MS.
// The packaged server (packages/flashfx-mcp, marked by server/packaged.json) defaults to auto against
// https://editor.flashfx.app; running mcp/ from the repo keeps the old headless default, so the
// feature flag is off unless asked for (--mode tab|auto or FLASHFX_MODE).

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FlashFxSession } from './session.mjs';
import { DEFAULT_EDITOR_URL, DEFAULT_LINK_PORT, TabSession } from './tab-session.mjs';

const log = (...a) => process.stderr.write(`[flashfx-mcp] ${a.join(' ')}\n`);

/** server/packaged.json next to the bundled server, or null when running from the repo. */
export function readPackaged(serverDir) {
  const p = join(serverDir, 'packaged.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** Link options from argv / env, on top of session.mjs readConfig(). */
export function readLinkConfig(base, { argv = process.argv.slice(2), env = process.env, packaged = null } = {}) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
  };
  const str = (name, envName) => { const a = arg(name); return typeof a === 'string' ? a : (env[envName] || undefined); };
  const mode = String(str('mode', 'FLASHFX_MODE') ?? (packaged ? 'auto' : 'headless'));
  if (!['headless', 'tab', 'auto'].includes(mode)) throw new Error(`--mode must be headless, tab or auto (got "${mode}")`);
  const openArg = arg('no-open') === true ? false : undefined;
  const openEnv = env.FLASHFX_LINK_OPEN;
  const home = homedir();
  const cfg = {
    ...base,
    mode,
    packaged: !!packaged,
    linkPort: parseInt(str('link-port', 'FLASHFX_LINK_PORT') ?? String(DEFAULT_LINK_PORT), 10),
    linkOpen: openArg ?? !(openEnv === '0' || openEnv === 'false'),
    linkWaitMs: parseInt(env.FLASHFX_LINK_WAIT_MS ?? '180000', 10),
    autoWaitMs: parseInt(env.FLASHFX_LINK_AUTO_WAIT_MS ?? '120000', 10),
    extraOrigins: (str('link-origin', 'FLASHFX_LINK_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    outputDir: str('output-dir', 'FLASHFX_OUTPUT_DIR') || join(home, 'FlashFX', 'exports'),
    accessCode: str('access-code', 'FLASHFX_ACCESS_CODE'),
    allowlistPath: str('allowlist', 'FLASHFX_ALLOWLIST'),
    entitlementUrl: env.FLASHFX_ENTITLEMENT_URL || undefined,
    entitlementCache: join(home, 'FlashFX', 'link-entitlement.json'),
  };
  if (packaged) {
    // The product defaults: the live editor, a visible window and a profile that survives restarts.
    if (!cfg.url) { cfg.url = DEFAULT_EDITOR_URL; cfg.server = 'none'; }
    if (!argv.includes('--headed') && env.FLASHFX_HEADED === undefined) cfg.headed = true;
    if (!cfg.profile) cfg.profile = join(home, 'FlashFX', 'link-profile');
  }
  // Unexpanded `${user_config.x}` (an optional .mcpb field left empty) means "not set".
  for (const k of ['accessCode', 'outputDir', 'allowlistPath']) {
    if (typeof cfg[k] === 'string' && /^\$\{.*\}$/.test(cfg[k])) cfg[k] = k === 'outputDir' ? join(home, 'FlashFX', 'exports') : undefined;
  }
  return cfg;
}

/**
 * auto mode: tab first, headless after autoWaitMs without a pairing. Delegates the session surface to
 * whichever won; status() says which.
 */
export class AutoSession {
  constructor(config) {
    this.config = config;
    this.kind = 'auto';
    this.tab = new TabSession(config);
    this.headless = null;
    this.active = null;
    this.choosing = null;
  }

  async pick() {
    if (this.active) return this.active;
    if (!this.choosing) {
      this.choosing = (async () => {
        try {
          await this.tab.ensure(this.config.autoWaitMs);
          this.active = this.tab;
        } catch (e) {
          if (this.tab.link.paired) { this.active = this.tab; throw e; } // paired but incompatible: say so
          log(`no FlashFX tab connected within ${Math.round(this.config.autoWaitMs / 1000)} s: falling back to a FlashFX window FlashFX Link opens itself (headless mode)`);
          this.headless = new FlashFxSession({ ...this.config, url: this.config.url ?? DEFAULT_EDITOR_URL, server: 'none' });
          this.active = this.headless;
        }
        return this.active;
      })().finally(() => { this.choosing = null; });
    }
    return this.choosing;
  }

  status() {
    return { transport: this.active === this.headless && this.headless ? 'headless (auto fallback)' : 'tab', ...(this.active === this.headless && this.headless ? {} : this.tab.status()) };
  }

  async prepare() { return this.tab.prepare(); }
  async baseUrl() { return (await this.pick()).baseUrl(); }
  async manifest() { return this.active ? this.active.manifest() : this.tab.manifest(); }
  async ensure() { return (await this.pick()).ensure(); }
  async run(...a) { return (await this.pick()).run(...a); }
  async state() { return (await this.pick()).state(); }
  async screenshot(...a) { return (await this.pick()).screenshot(...a); }
  async exportMp4(...a) { return (await this.pick()).exportMp4(...a); }
  async renderFrame(...a) { return (await this.pick()).renderFrame(...a); }
  async renderStrip(...a) { return (await this.pick()).renderStrip(...a); }
  async exportProject(...a) { return (await this.pick()).exportProject(...a); }
  async importFile(...a) { return (await this.pick()).importFile(...a); }
  async importFileChunked(...a) { return (await this.pick()).importFileChunked(...a); }
  recentLogs(n) { return this.active ? this.active.recentLogs(n) : []; }
  async closeBrowser() { if (this.active) await this.active.closeBrowser(); }
  async shutdown() { await this.tab.shutdown(); if (this.headless) await this.headless.shutdown(); }
}

export function createSession(config) {
  if (config.mode === 'tab') return new TabSession(config);
  if (config.mode === 'auto') return new AutoSession(config);
  const s = new FlashFxSession(config);
  s.kind = 'headless';
  return s;
}
