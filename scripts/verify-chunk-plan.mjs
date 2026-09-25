// Acceptance harness for the video chunk-range planner (src/engine/video/videoChunkPlan.ts) - PB7's pure
// primitive for lazily reading only the IndexedDB chunk records that overlap a requested byte range,
// instead of readChunked's eager `new Blob(parts)` join of every chunk. Pins the arithmetic so a planned
// read maps back onto exactly the stored bytes (it must mirror saveChunked's slice loop). No test runner
// in this repo (see CLAUDE.md); bundles the real TS with esbuild + node:assert.
// Run: node scripts/verify-chunk-plan.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'chunkplan-verify-'));
const outfile = join(tmp, 'chunkplan.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// Reference: concatenating the planned slices must reproduce fileBytes[start:end]. We model the file as a
// byte array [0,1,2,...] and reassemble from chunkIndex*chunkSize + offset to prove the mapping.
function reassemble(parts, chunkSize) {
  const bytes = [];
  for (const p of parts) {
    for (let b = p.startInChunk; b < p.endInChunk; b++) bytes.push(p.chunkIndex * chunkSize + b);
  }
  return bytes;
}

try {
  await build({
    entryPoints: ['src/engine/video/videoChunkPlan.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { chunkCount, planChunkRange } = await import(pathToFileURL(outfile).href);

  const CH = 256; // pretend chunk size (bytes) for readable assertions

  check('chunkCount matches ceil(size/chunk); degenerate input -> 0', () => {
    assert.equal(chunkCount(1000, CH), 4);   // 256*3=768 < 1000 <= 1024
    assert.equal(chunkCount(512, CH), 2);    // exact multiple
    assert.equal(chunkCount(1, CH), 1);
    assert.equal(chunkCount(0, CH), 0);
    assert.equal(chunkCount(1000, 0), 0);
    assert.equal(chunkCount(-5, CH), 0);
  });

  check('a range inside a single chunk yields one part', () => {
    const p = planChunkRange(1000, CH, 10, 100);
    assert.deepEqual(p, [{ chunkIndex: 0, startInChunk: 10, endInChunk: 100 }]);
  });

  check('a range spanning two chunks splits at the boundary', () => {
    const p = planChunkRange(1000, CH, 200, 300); // chunk0 [200,256), chunk1 [0,44)
    assert.deepEqual(p, [
      { chunkIndex: 0, startInChunk: 200, endInChunk: 256 },
      { chunkIndex: 1, startInChunk: 0, endInChunk: 44 },
    ]);
  });

  check('an exact-boundary range does not include an empty trailing chunk', () => {
    const p = planChunkRange(1000, CH, 0, 256); // exactly chunk 0
    assert.deepEqual(p, [{ chunkIndex: 0, startInChunk: 0, endInChunk: 256 }]);
  });

  check('the full file plans every chunk with the last one short', () => {
    const p = planChunkRange(1000, CH, 0, 1000); // 4 chunks; last is 1000-768=232 bytes
    assert.equal(p.length, 4);
    assert.deepEqual(p[3], { chunkIndex: 3, startInChunk: 0, endInChunk: 232 });
    // reassembling the whole plan reproduces bytes 0..999 in order
    assert.deepEqual(reassemble(p, CH), Array.from({ length: 1000 }, (_, i) => i));
  });

  check('range is clamped to [0, fileSize)', () => {
    assert.deepEqual(planChunkRange(1000, CH, -50, 60), [{ chunkIndex: 0, startInChunk: 0, endInChunk: 60 }]);
    const tail = planChunkRange(1000, CH, 900, 5000); // clamps end to 1000
    assert.deepEqual(tail, [{ chunkIndex: 3, startInChunk: 900 - 768, endInChunk: 1000 - 768 }]);
  });

  check('empty / degenerate ranges yield no parts', () => {
    assert.deepEqual(planChunkRange(1000, CH, 500, 500), []); // empty
    assert.deepEqual(planChunkRange(1000, CH, 600, 400), []); // inverted
    assert.deepEqual(planChunkRange(0, CH, 0, 100), []);      // no file
    assert.deepEqual(planChunkRange(1000, 0, 0, 100), []);    // no chunk size
  });

  check('an arbitrary mid-file range reassembles to exactly those bytes', () => {
    const p = planChunkRange(1000, CH, 300, 800);
    assert.deepEqual(reassemble(p, CH), Array.from({ length: 500 }, (_, i) => 300 + i));
  });

  console.log(`\nchunk-plan: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
