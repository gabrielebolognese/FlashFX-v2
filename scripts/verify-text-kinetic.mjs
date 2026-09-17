// Acceptance harness for Text Decode / scramble (B9). Bundles the pure core/textDecode.ts and asserts
// with node:assert. Rendering is unchanged — expandTextGlyphs already stamps one glyph per character;
// decode only chooses each stamp's character. Glyph PLACEMENT stays browser-verified as before.
//   node scripts/verify-text-kinetic.mjs   (or: npm run verify:text-kinetic)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'textkinetic-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

try {
  const D = await bundle('src/core/textDecode.ts', 'textDecode.mjs');
  const { decodeContent, decodeCharAt, isGlyphRevealed, scrambleCharAt, DEFAULT_DECODE_CHARSET } = D;
  const CS = DEFAULT_DECODE_CHARSET;
  const TEXT = 'HELLO WORLD';

  check('progress ≥ 1 → the content is fully revealed (unchanged)', () => {
    assert.equal(decodeContent(TEXT, 1, 0, 7, CS, 2), TEXT);
    assert.equal(decodeContent(TEXT, 1.5, 40, 7, CS, 2), TEXT);
  });

  check('progress 0 → every non-space glyph is scrambled to a charset char; spaces preserved', () => {
    const out = decodeContent(TEXT, 0, 0, 7, CS, 2);
    assert.equal(out.length, TEXT.length);
    for (let i = 0; i < TEXT.length; i++) {
      if (TEXT[i] === ' ') assert.equal(out[i], ' ', 'space preserved');
      else assert.ok(CS.includes(out[i]), `scramble char ${out[i]} must be in the charset`);
    }
    assert.notEqual(out, TEXT); // something changed
  });

  check('reveal sweeps left→right: a prefix is locked at partial progress', () => {
    const out = decodeContent(TEXT, 0.5, 0, 7, CS, 2);
    // ~first half locked to the real letters
    assert.equal(out.slice(0, 5), TEXT.slice(0, 5), `expected "HELLO" locked, got "${out.slice(0, 5)}"`);
  });

  check('isGlyphRevealed: monotonic in progress; none at 0, all at 1', () => {
    const n = 10;
    assert.ok(!isGlyphRevealed(0, n, 0), 'nothing revealed at progress 0');
    assert.ok(isGlyphRevealed(n - 1, n, 1), 'last revealed at progress 1');
    // monotonic: once revealed at p it stays revealed at p' > p
    for (let i = 0; i < n; i++) {
      let sawRevealed = false;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const r = isGlyphRevealed(i, n, p);
        if (sawRevealed) assert.ok(r, 'reveal must not toggle back off');
        if (r) sawRevealed = true;
      }
    }
  });

  check('deterministic: same (seed, frame, progress) → identical output', () => {
    assert.equal(decodeContent(TEXT, 0.3, 12, 99, CS, 2), decodeContent(TEXT, 0.3, 12, 99, CS, 2));
  });

  check('scramble flickers across time buckets but holds within one', () => {
    // scrambleHold = 3 → frames 0,1,2 share a bucket; frame 3 is the next.
    const a0 = decodeContent(TEXT, 0, 0, 7, CS, 3);
    const a2 = decodeContent(TEXT, 0, 2, 7, CS, 3);
    const a3 = decodeContent(TEXT, 0, 3, 7, CS, 3);
    assert.equal(a0, a2, 'same bucket → identical scramble');
    assert.notEqual(a0, a3, 'next bucket → the scramble should change');
  });

  check('different seeds give different scrambles', () => {
    assert.notEqual(decodeContent(TEXT, 0, 0, 1, CS, 2), decodeContent(TEXT, 0, 0, 2, CS, 2));
  });

  check('scrambleCharAt is stable and always in the charset', () => {
    for (let i = 0; i < 50; i++) {
      const c = scrambleCharAt(7, i, 3, CS);
      assert.ok(CS.includes(c));
    }
    assert.equal(scrambleCharAt(7, 5, 3, CS), scrambleCharAt(7, 5, 3, CS));
  });

  check('empty charset degrades to a space (no crash)', () => {
    assert.equal(decodeCharAt('A', 0, 5, 0, 0, 7, '', 2), ' ');
  });

  // ── Text on a path (B9b) ──
  const P = await bundle('src/core/textPath.ts', 'textPath.mjs');
  const { totalPathLength, pointAndAngleAt, glyphPathFraction } = P;
  const node = (x, y) => ({ position: [x, y], handleIn: [0, 0], handleOut: [0, 0] });
  const hLine = [node(0, 0), node(100, 0)];   // straight, horizontal
  const vLine = [node(0, 0), node(0, 100)];   // straight, vertical

  check('totalPathLength: straight segment length', () => {
    assert.ok(Math.abs(totalPathLength(hLine, false) - 100) < 1e-6);
    assert.equal(totalPathLength([node(5, 5)], false), 0); // <2 nodes
  });
  check('pointAndAngleAt: horizontal path → walks x, angle ~0', () => {
    const mid = pointAndAngleAt(hLine, false, 0.5);
    assert.ok(Math.abs(mid.position[0] - 50) < 1e-6 && Math.abs(mid.position[1]) < 1e-6);
    assert.ok(Math.abs(mid.angle) < 1e-6);
    assert.ok(Math.abs(pointAndAngleAt(hLine, false, 0).position[0]) < 1e-6);
    assert.ok(Math.abs(pointAndAngleAt(hLine, false, 1).position[0] - 100) < 1e-6);
  });
  check('pointAndAngleAt: vertical path → angle ~90°, clamps fraction', () => {
    const mid = pointAndAngleAt(vLine, false, 0.5);
    assert.ok(Math.abs(mid.position[1] - 50) < 1e-6);
    assert.ok(Math.abs(mid.angle - 90) < 1e-6);
    // out-of-range fractions clamp
    assert.ok(Math.abs(pointAndAngleAt(vLine, false, 5).position[1] - 100) < 1e-6);
  });
  check('glyphPathFraction: (centerDist + margin) / pathLength, clamped', () => {
    assert.ok(Math.abs(glyphPathFraction(50, 100, 0) - 0.5) < 1e-9);
    assert.ok(Math.abs(glyphPathFraction(50, 100, 25) - 0.75) < 1e-9);
    assert.equal(glyphPathFraction(200, 100, 0), 1); // clamps
    assert.equal(glyphPathFraction(10, 0, 0), 0);    // zero-length guard
  });
  check('glyph placement composes: a glyph at centerDist maps onto the path point', () => {
    // glyph centered 30px along a 100px horizontal path → (30, 0)
    const f = glyphPathFraction(30, totalPathLength(hLine, false), 0);
    const p = pointAndAngleAt(hLine, false, f);
    assert.ok(Math.abs(p.position[0] - 30) < 1e-4 && Math.abs(p.position[1]) < 1e-4);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ text-kinetic harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
