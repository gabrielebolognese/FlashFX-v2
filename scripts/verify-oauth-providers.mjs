// Acceptance harness for the social sign-in provider config (pure). Bundles auth/oauthProviders.ts and
// asserts with node:assert: the provider catalog (google/azure/apple + labels) and the env-flag
// resolution (a provider shows unless its flag is exactly "false"). The actual OAuth redirect + the
// Supabase dashboard provider config are browser/infra, not testable here.
//   node scripts/verify-oauth-providers.mjs   (or: npm run verify:oauth-providers)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'oauth-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const ids = (list) => list.map((p) => p.id);

try {
  const outfile = join(tmp, 'oauthProviders.mjs');
  await build({ entryPoints: ['src/auth/oauthProviders.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const M = await import(pathToFileURL(outfile).href);
  const { OAUTH_PROVIDERS, resolveEnabledProviders } = M;

  check('catalog: google only, with label + env key (Microsoft/Apple removed)', () => {
    assert.deepEqual(ids(OAUTH_PROVIDERS), ['google']);
    const google = OAUTH_PROVIDERS[0];
    assert.equal(google.label, 'Google');
    assert.equal(google.envKey, 'VITE_OAUTH_GOOGLE');
  });

  check('resolveEnabledProviders: google shown by default (empty env)', () => {
    assert.deepEqual(ids(resolveEnabledProviders({})), ['google']);
  });

  check('google is hidden ONLY when VITE_OAUTH_GOOGLE is exactly "false"', () => {
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: 'false' })), []);
    // legacy flags for the removed providers have no effect
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_MICROSOFT: 'false', VITE_OAUTH_APPLE: 'false' })), ['google']);
  });

  check('non-"false" values keep google visible (true / 1 / undefined)', () => {
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: 'true' })), ['google']);
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: undefined })), ['google']);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ oauth-providers harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
