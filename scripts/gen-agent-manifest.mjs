// Writes public/agent/features.json - the static agent-mode endpoint (served at
// https://editor.flashfx.app/agent/features.json) - from the typed registry in
// src/agent/featureManifest.ts plus the live preset catalogs in src/agent/catalogs.ts.
//
// Mirrors the scripts/verify-*.mjs convention: bundle the REAL TypeScript with the installed esbuild,
// import it in Node, serialize. Reproducible: `version` / `generatedAt` come from the git HEAD commit
// (hash + commit date), never from Date.now(), so the same commit always yields the same file.
// Runs automatically before `dev` and `build` (predev/prebuild); manual: npm run agent:manifest.

import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function git(cmd, fallback) {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Bundle + import src/agent/{featureManifest,catalogs}.ts. Shared with verify-agent-manifest.mjs. */
export async function loadAgentModules() {
  const tmp = mkdtempSync(join(tmpdir(), 'ffx-agent-manifest-'));
  const entry = join(tmp, 'entry.ts');
  const outfile = join(tmp, 'agent.mjs');
  const root = process.cwd().replace(/\\/g, '/');
  writeFileSync(
    entry,
    `export * from '${root}/src/agent/featureManifest';\nexport { buildAgentCatalogs } from '${root}/src/agent/catalogs';\n`,
  );
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile,
      logLevel: 'silent',
      alias: { '@': `${root}/src` },
    });
    // Some preset modules transitively touch code that spawns a Web Worker at load; Node has none.
    if (typeof globalThis.Worker === 'undefined') {
      globalThis.Worker = class {
        postMessage() {}
        terminate() {}
        addEventListener() {}
        removeEventListener() {}
        set onmessage(_v) {}
        set onerror(_v) {}
      };
    }
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function generateAgentManifest() {
  const m = await loadAgentModules();
  const commit = git('rev-parse --short=12 HEAD', 'unknown');
  const generatedAt = git('log -1 --format=%cI HEAD', 'unknown');
  return {
    ...m.buildAgentManifest(),
    version: `${m.AGENT_MANIFEST_SCHEMA_VERSION}.${commit}`,
    gitCommit: commit,
    generatedAt,
    catalogs: m.buildAgentCatalogs(),
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  const manifest = await generateAgentManifest();
  mkdirSync('public/agent', { recursive: true });
  writeFileSync('public/agent/features.json', `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `agent manifest: ${manifest.features.length} features, ${manifest.actions.length} actions -> public/agent/features.json (${manifest.version})`,
  );
}
