// Acceptance for AI-generation metadata persistence (M3): a SceneDocument's `aiMeta` (the
// regeneration inputs) must survive the serialize → deserialize round-trip so the edit path can
// regenerate from a reopened project. Proves the file layer here; the editor-store wiring
// (getDocument/loadDocument/commitAiComposition include it) is tsc-checked + browser-gated.
// Run: node scripts/verify-aimeta.mjs   (or: npm run verify:aimeta)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'aimeta-verify-'));
const outfile = join(tmp, 'serialization.mjs');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const comp = () => ({
  id: 'c1', name: 'Scene',
  settings: { width: 1920, height: 1080, frameRate: 30, durationFrames: 90, backgroundColor: [0, 0, 0, 1] },
  layers: [], tracks: [], background: { layers: [] }, motionPaths: [],
});
const AIMETA = {
  brief: { durationMs: 3000, format: 'landscape', tone: 'elegant', subjects: [{ id: 's-a', name: 'mark' }] },
  styleContract: { palette: [{ role: 'primary', color: '#c98a45' }], easings: ['easeOut'], beatMs: 375, shapeLanguage: 'geometric', staggerDoctrine: { mode: 'none', gapMs: 0 } },
  panelPlan: [{ id: 'panel-0', order: 0, startMs: 0, endMs: 3000, focalPoint: [960, 540], elements: [], inboundPresent: [], outboundPresent: [] }],
  seed: 7, digest: 'deadbeef', tier: 'pro',
};

try {
  await build({ entryPoints: ['src/project-system/services/serialization.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { serializeDocument, deserializeDocument } = await import(pathToFileURL(outfile).href);

  console.log('aiMeta persistence — acceptance\n');

  check('aiMeta survives the serialize → deserialize round-trip, unchanged', () => {
    const doc = { version: 2, rootCompositionId: 'c1', scenes: ['c1'], compositions: { c1: comp() }, styles: {}, aiMeta: AIMETA };
    const round = deserializeDocument(serializeDocument(doc));
    assert.deepEqual(round.aiMeta, AIMETA);
  });

  check('a document without aiMeta round-trips with aiMeta undefined (no crash)', () => {
    const doc = { version: 2, rootCompositionId: 'c1', scenes: ['c1'], compositions: { c1: comp() }, styles: {} };
    const round = deserializeDocument(serializeDocument(doc));
    assert.equal(round.aiMeta, undefined);
  });

  check('a non-object aiMeta is dropped (never a malformed blob on load)', () => {
    const raw = JSON.stringify({ version: 2, rootCompositionId: 'c1', scenes: ['c1'], compositions: { c1: comp() }, styles: {}, aiMeta: 'oops' });
    assert.equal(deserializeDocument(raw).aiMeta, undefined);
  });

  console.log(`\n✅ ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
