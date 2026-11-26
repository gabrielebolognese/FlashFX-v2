// FlashFX Link early-access gate: the entitlement STUB of docs/MCP-PRODUCT-ARCHITECTURE.md ("Early-access
// gate"). No billing, no payment provider, no accounts. Two sources, in this order:
//
//   1. FLASHFX_ENTITLEMENT_URL set: POST { code, client: 'link', version } to that endpoint (the
//      `mcp-entitlement` edge function in supabase/functions, NOT deployed yet) and cache the answer for
//      7 days (offline grace: a paying user is never locked out by a network blip).
//   2. Otherwise the local allowlist (mcp/access/allowlist.json, shipped inside the package): SHA-256
//      hashes of hand-issued access codes. Only hashes are stored; codes are 128-bit random
//      (scripts/mcp-access-code.mjs), so a public hash list does not leak them.
//
// No code / an unknown code = "personal mode" (the free surface): core tools + 3 starter recipes.
// The gate applies to the packaged FlashFX Link (tab / auto mode) only; the repo's headless mode from source
// is governed by the license (LICENSING.md), not by this stub.
//
// FlashFX never holds or calls an Anthropic key here or anywhere on this path.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ALLOWLIST = resolve(HERE, '../access/allowlist.json');
export const GRACE_MS = 7 * 24 * 3600 * 1000;

/** Free surface (personal mode). */
export const STARTER_RECIPES = new Set(['background', 'kinetic-title', 'pop-in']);
/** Tools only an entitled (early access / founding) user gets in the packaged Link. */
export const PAID_TOOLS = new Set(['render_frame', 'render_strip']);
export const FULL_FEATURES = ['core', 'recipes', 'commercial'];
export const PERSONAL_FEATURES = ['core', 'starter-recipes'];

const KINDS = new Set(['founding', 'early', 'team']);

/** Codes are typed by humans: ignore case, spaces and dashes. */
export function normalizeCode(code) {
  return String(code ?? '').toUpperCase().replace(/[\s-]/g, '');
}

export function hashCode(code) {
  return createHash('sha256').update(`flashfx-link:v1:${normalizeCode(code)}`).digest('hex');
}

export function readAllowlist(path = DEFAULT_ALLOWLIST) {
  if (!existsSync(path)) return { version: 1, codes: [] };
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return { version: j.version ?? 1, codes: Array.isArray(j.codes) ? j.codes : [] };
}

function personal(reason, source) {
  return { entitled: false, mode: 'personal', kind: null, features: PERSONAL_FEATURES, source, reason, checkedAt: null };
}

function full(kind, source, checkedAt, extra = {}) {
  return { entitled: true, mode: 'full', kind, features: FULL_FEATURES, source, reason: null, checkedAt, ...extra };
}

function semverLess(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0); }
  return false;
}

/**
 * Decide the mode for this process. Never throws: any failure degrades to personal mode with a reason
 * Claude can relay to the user.
 */
export async function checkEntitlement({
  code,
  version,
  allowlistPath = DEFAULT_ALLOWLIST,
  endpoint,
  cachePath,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!normalizeCode(code)) return personal('no access code set (personal mode)', 'none');
  const codeHash = hashCode(code);

  if (endpoint) {
    try {
      const r = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: normalizeCode(code), client: 'link', version }),
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json();
      if (!j || j.ok !== true) {
        // A definite "no" from the server also clears any cached "yes" (revoked codes stop working).
        if (cachePath) writeCache(cachePath, null);
        return personal(j?.reason ?? 'access code not recognised (personal mode)', 'remote');
      }
      const kind = KINDS.has(j.kind) ? j.kind : 'early';
      const res = full(kind, 'remote', now, { minVersion: j.minVersion ?? null });
      if (j.minVersion && version && semverLess(version, j.minVersion)) {
        res.updateRequired = `FlashFX Link ${version} is older than the minimum ${j.minVersion}: update it.`;
      }
      if (cachePath) writeCache(cachePath, { codeHash, kind, checkedAt: now, minVersion: j.minVersion ?? null });
      return res;
    } catch (e) {
      const cached = cachePath ? readCache(cachePath) : null;
      if (cached && cached.codeHash === codeHash && now - cached.checkedAt < GRACE_MS) {
        return full(cached.kind, 'cache', cached.checkedAt, { offline: true });
      }
      return personal(`could not reach the FlashFX access server (${e.message}); personal mode until it is reachable`, 'remote');
    }
  }

  let list;
  try { list = readAllowlist(allowlistPath); } catch (e) { return personal(`allowlist unreadable: ${e.message}`, 'allowlist'); }
  const hit = list.codes.find((c) => c && c.hash === codeHash);
  if (!hit) return personal('access code not recognised (personal mode)', 'allowlist');
  if (hit.revoked) return personal('this access code was revoked (personal mode)', 'allowlist');
  return full(KINDS.has(hit.kind) ? hit.kind : 'early', 'allowlist', now);
}

function readCache(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function writeCache(path, value) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  } catch { /* cache is best effort */ }
}

/** null when the tool / recipe is allowed in this mode, else the message for Claude. */
export function gateMessage(ent, toolName, args = {}) {
  if (!ent || ent.entitled) return null;
  const how = 'FlashFX Link is in personal mode. Early-access users get every tool and recipe: the access code goes in the FlashFX Link settings (Claude Desktop > Settings > Extensions > FlashFX Link) or in FLASHFX_ACCESS_CODE. Codes come from FlashFX (flashfx.app).';
  if (PAID_TOOLS.has(toolName)) return `${toolName} needs an early-access code. Use screenshot for a quick look instead. ${how}`;
  if (toolName === 'apply_recipe' && args.id && !STARTER_RECIPES.has(args.id)) {
    return `recipe "${args.id}" needs an early-access code; personal mode includes ${[...STARTER_RECIPES].join(', ')}. ${how}`;
  }
  return null;
}
