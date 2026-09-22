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

  check('catalog: google/azure/apple with labels + env keys; Microsoft maps to azure', () => {
    assert.deepEqual(ids(OAUTH_PROVIDERS), ['google', 'azure', 'apple']);
    const azure = OAUTH_PROVIDERS.find((p) => p.id === 'azure');
    assert.equal(azure.label, 'Microsoft', 'azure is labelled Microsoft');
    for (const p of OAUTH_PROVIDERS) {
      assert.ok(p.label && typeof p.label === 'string', `${p.id} has a label`);
      assert.ok(/^VITE_OAUTH_/.test(p.envKey), `${p.id} has a VITE_OAUTH_* env key`);
    }
  });

  check('resolveEnabledProviders: all shown by default (empty env)', () => {
    assert.deepEqual(ids(resolveEnabledProviders({})), ['google', 'azure', 'apple']);
  });

  check('a provider is hidden ONLY when its flag is exactly "false"', () => {
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_APPLE: 'false' })), ['google', 'azure']);
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: 'false', VITE_OAUTH_MICROSOFT: 'false' })), ['apple']);
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: 'false', VITE_OAUTH_MICROSOFT: 'false', VITE_OAUTH_APPLE: 'false' })), []);
  });

  check('non-"false" values keep a provider visible (true / 1 / undefined)', () => {
    assert.deepEqual(ids(resolveEnabledProviders({ VITE_OAUTH_GOOGLE: 'true', VITE_OAUTH_MICROSOFT: '1', VITE_OAUTH_APPLE: undefined })), ['google', 'azure', 'apple']);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ oauth-providers harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
