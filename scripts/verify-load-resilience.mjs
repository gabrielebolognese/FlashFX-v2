// Acceptance harness for load-path resilience: the persistence deserializers must sanitize
// malformed/partial data to safe defaults (never throw on valid-JSON-but-garbage-structure),
// and only throw on genuinely invalid JSON (which loadProjectScene catches at the boundary).
// This pins the defensive behaviour of validateComposition so a future change can't silently
// make corrupt projects crash the app. No test runner in this repo (see CLAUDE.md); bundles the
// real TS with esbuild + node:assert. Run: node scripts/verify-load-resilience.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'loadres-verify-'));
const outfile = join(tmp, 'serialization.mjs');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

try {
  await build({
    entryPoints: ['src/project-system/services/serialization.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const { serializeComposition, deserializeComposition, serializeDocument, deserializeDocument } =
    await import(pathToFileURL(outfile).href);

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const validComp = (c) => {
    assert.ok(typeof c.id === 'string' && c.id.length > 0, 'id is a non-empty string');
    assert.ok(typeof c.name === 'string', 'name is a string');
    assert.ok(c.settings && isNum(c.settings.width) && isNum(c.settings.height), 'settings has numeric w/h');
    assert.ok(isNum(c.settings.frameRate) && isNum(c.settings.durationFrames), 'settings has numeric fps/duration');
    assert.ok(Array.isArray(c.layers), 'layers is an array');
    assert.ok(Array.isArray(c.tracks), 'tracks is an array');
  };

  // --- Sanitize valid-JSON-but-garbage structure (never throw) ---
  check('empty object {} -> valid Composition with defaults', () => {
    validComp(deserializeComposition('{}'));
  });
  check('non-object JSON (null / number / string) -> valid default Composition, no throw', () => {
    validComp(deserializeComposition('null'));
    validComp(deserializeComposition('42'));
    validComp(deserializeComposition('"hello"'));
  });
  check('wrong-typed fields (layers/settings/id) are coerced to safe defaults', () => {
    const c = deserializeComposition(JSON.stringify({ id: 42, name: 7, layers: 'nope', settings: 5, tracks: {} }));
    validComp(c);
    assert.strictEqual(c.layers.length, 0);
    assert.strictEqual(c.tracks.length, 0);
  });
  check('non-object layer entries are dropped, not fatal', () => {
    const c = deserializeComposition(JSON.stringify({ layers: [null, 42, 'x', true] }));
    assert.strictEqual(c.layers.length, 0);
  });

  // --- Only genuinely invalid JSON throws (the loadProjectScene boundary catches it) ---
  check('invalid JSON throws from deserializeComposition', () => {
    assert.throws(() => deserializeComposition('{ not valid json'));
  });
  check('invalid JSON throws from deserializeDocument', () => {
    assert.throws(() => deserializeDocument('}{'));
  });

  // --- Document level: a garbage composition is sanitized, not fatal ---
  check('document with a garbage composition -> sanitized, still present, no throw', () => {
    const doc = deserializeDocument(
      JSON.stringify({ version: 2, rootCompositionId: 'a', scenes: ['a'], compositions: { a: { layers: 'bad', settings: null } } }),
    );
    assert.ok(doc.compositions && doc.compositions.a, 'the composition survives');
    validComp(doc.compositions.a);
    assert.strictEqual(doc.rootCompositionId, 'a');
  });
  check('empty document object -> migrates to a valid one-composition document', () => {
    const doc = deserializeDocument('{}');
    assert.ok(typeof doc.rootCompositionId === 'string' && doc.rootCompositionId.length > 0);
    assert.ok(doc.compositions && doc.compositions[doc.rootCompositionId], 'root composition exists');
    validComp(doc.compositions[doc.rootCompositionId]);
  });

  // --- Round-trip fidelity: deserialize is idempotent on its own output ---
  check('composition round-trips (id + settings preserved through serialize/deserialize)', () => {
    const c1 = deserializeComposition('{}');
    const c2 = deserializeComposition(serializeComposition(c1));
    validComp(c2);
    assert.strictEqual(c2.id, c1.id);
    assert.strictEqual(c2.settings.width, c1.settings.width);
    assert.strictEqual(c2.settings.height, c1.settings.height);
  });
  check('document round-trips (root id preserved)', () => {
    const d1 = deserializeDocument('{}');
    const d2 = deserializeDocument(serializeDocument(d1));
    assert.strictEqual(d2.rootCompositionId, d1.rootCompositionId);
    validComp(d2.compositions[d2.rootCompositionId]);
  });

  console.log(`\nload-resilience: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
