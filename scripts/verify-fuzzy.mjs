// Acceptance harness for the command-palette fuzzy matcher (ui/commands/fuzzy.ts).
// Run: node scripts/verify-fuzzy.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fuzzy-verify-'));
const outfile = join(tmp, 'fuzzy.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({ entryPoints: ['src/ui/commands/fuzzy.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const { fuzzyScore, rankItems } = await import(pathToFileURL(outfile).href);

  check('subsequence matches, non-subsequence → null', () => {
    assert.ok(fuzzyScore('un', 'Union') !== null);
    assert.ok(fuzzyScore('algn', 'Align Left') !== null);
    assert.equal(fuzzyScore('xyz', 'Union'), null);
    assert.equal(fuzzyScore('zzz', 'Align Left'), null);
  });
  check('empty query scores 0 (matches everything)', () => {
    assert.equal(fuzzyScore('', 'anything'), 0);
  });
  check('case-insensitive', () => {
    assert.ok(fuzzyScore('UNION', 'union') !== null);
    assert.ok(fuzzyScore('union', 'UNION') !== null);
  });
  check('prefix/consecutive beats scattered', () => {
    // "align" as a prefix of "Align Left" should outscore the scattered match in
    // "A Big Legendary Ninja" (a,l,i,g,n scattered).
    const a = fuzzyScore('align', 'Align Left');
    const b = fuzzyScore('align', 'A Big Legendary Ninja');
    assert.ok(a !== null);
    if (b !== null) assert.ok(a > b, `prefix ${a} should beat scattered ${b}`);
  });
  check('word-boundary boost: "al" ranks "Align Left" above "Duplicate"', () => {
    const ranked = rankItems('al', [
      { label: 'Duplicate' },
      { label: 'Align Left' },
    ]);
    assert.equal(ranked[0].label, 'Align Left');
  });
  check('CamelCase boundary matches (e.g. "sl" → "selectAllLayers")', () => {
    assert.ok(fuzzyScore('sal', 'selectAllLayers') !== null);
  });
  check('rankItems: empty query returns all in original order', () => {
    const items = [{ label: 'B' }, { label: 'A' }, { label: 'C' }];
    assert.deepEqual(rankItems('', items).map((x) => x.label), ['B', 'A', 'C']);
  });
  check('rankItems filters out non-matches', () => {
    const ranked = rankItems('union', [{ label: 'Union' }, { label: 'Delete' }, { label: 'Group' }]);
    assert.deepEqual(ranked.map((x) => x.label), ['Union']);
  });
  check('keywords match when the label does not', () => {
    const ranked = rankItems('xor', [{ label: 'Exclude', keywords: 'xor difference' }, { label: 'Union' }]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].label, 'Exclude');
  });
  check('a label match outranks a keyword-only match', () => {
    const ranked = rankItems('cut', [
      { label: 'Delete', keywords: 'cut remove' }, // keyword match
      { label: 'Cut', keywords: '' },              // label match
    ]);
    assert.equal(ranked[0].label, 'Cut');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
