// Acceptance harness for the data-binding core (src/core/dataBinding/dataBinding.ts) - B31-data's pure
// CSV/JSON -> keyframe math. Pins the CSV parser (quoting/escapes/CRLF/ragged), the JSON series extractor,
// the numeric coercion, the normalise->[min,max] mapping, and the keyframe placement across a frame range
// so a data-driven track is deterministic and frame-pure. No test runner in this repo (see CLAUDE.md);
// bundles the real TS with esbuild + node:assert. Run: node scripts/verify-data-binding.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'databind-verify-'));
const outfile = join(tmp, 'databind.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({
    entryPoints: ['src/core/dataBinding/dataBinding.ts'],
    outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent',
  });
  const { parseCSV, columnValues, parseJSONSeries, toNumbers, mapSeries, buildDataTrack } =
    await import(pathToFileURL(outfile).href);

  check('parseCSV: headers + rows, trailing newline dropped', () => {
    const p = parseCSV('a,b,c\n1,2,3\n4,5,6\n');
    assert.deepEqual(p.headers, ['a', 'b', 'c']);
    assert.deepEqual(p.rows, [['1', '2', '3'], ['4', '5', '6']]);
  });

  check('parseCSV: quoted fields (embedded comma + newline), "" escape, CRLF', () => {
    const p = parseCSV('name,note\r\n"Doe, Jane","line1\nline2"\r\n"say ""hi""",x\r\n');
    assert.deepEqual(p.headers, ['name', 'note']);
    assert.deepEqual(p.rows[0], ['Doe, Jane', 'line1\nline2']);
    assert.deepEqual(p.rows[1], ['say "hi"', 'x']);
  });

  check('parseCSV: ragged rows keep their own cell counts; empty text -> empty', () => {
    const p = parseCSV('a,b,c\n1,2\n3,4,5,6');
    assert.deepEqual(p.rows, [['1', '2'], ['3', '4', '5', '6']]);
    const e = parseCSV('');
    assert.deepEqual(e, { headers: [], rows: [] });
  });

  check('columnValues: by header (case-insensitive), by index, missing -> []', () => {
    const p = parseCSV('X,Val\n1,10\n2,20');
    assert.deepEqual(columnValues(p, 'val'), ['10', '20']); // case-insensitive header
    assert.deepEqual(columnValues(p, 0), ['1', '2']);       // by index
    assert.deepEqual(columnValues(p, 'nope'), []);          // missing header
  });

  check('parseJSONSeries: array of numbers; array of objects via fieldPath; nested path', () => {
    assert.deepEqual(parseJSONSeries('[1,2,3]'), [1, 2, 3]);
    assert.deepEqual(parseJSONSeries('[{"v":5},{"v":7}]', 'v'), [5, 7]);
    assert.deepEqual(parseJSONSeries('[{"s":{"score":2}},{"s":{"score":9}}]', 's.score'), [2, 9]);
  });

  check('parseJSONSeries: skips non-numeric/missing; invalid JSON or non-array -> []', () => {
    assert.deepEqual(parseJSONSeries('[1,"x",null,true,3]'), [1, 3]); // string/null/bool skipped
    assert.deepEqual(parseJSONSeries('[{"v":1},{"w":2},{"v":3}]', 'v'), [1, 3]); // missing field skipped
    assert.deepEqual(parseJSONSeries('not json'), []);
    assert.deepEqual(parseJSONSeries('{"a":1}'), []); // not an array
  });

  check('toNumbers: coerces, skips blanks + non-numeric', () => {
    assert.deepEqual(toNumbers(['1', ' 2 ', '', 'x', '3.5', '-4']), [1, 2, 3.5, -4]);
  });

  check('mapSeries: auto-normalise maps series min/max onto [min,max]', () => {
    assert.deepEqual(mapSeries([0, 5, 10], { min: 0, max: 100 }), [0, 50, 100]);
    assert.deepEqual(mapSeries([10, 20, 30], { min: 1, max: 2 }), [1, 1.5, 2]);
  });

  check('mapSeries: explicit domain clamps; invert flips; flat series -> all min', () => {
    // domain 0..100, value 150 clamps to max, -50 clamps to min
    assert.deepEqual(mapSeries([-50, 50, 150], { min: 0, max: 10, domainMin: 0, domainMax: 100 }), [0, 5, 10]);
    assert.deepEqual(mapSeries([0, 5, 10], { min: 0, max: 100, invert: true }), [100, 50, 0]);
    assert.deepEqual(mapSeries([7, 7, 7], { min: 2, max: 9 }), [2, 2, 2]); // no spread -> min
    assert.deepEqual(mapSeries([], { min: 0, max: 1 }), []);
  });

  check('buildDataTrack: N values -> keyframes spanning [start,end], first@start last@end', () => {
    const t = buildDataTrack([0, 50, 100], { propertyPath: 'transform.opacity', target: 'number', startFrame: 0, endFrame: 100 });
    assert.equal(t.propertyPath, 'transform.opacity');
    assert.deepEqual(t.keyframes, [
      { frame: 0, value: 0 },
      { frame: 50, value: 50 },
      { frame: 100, value: 100 },
    ]);
  });

  check('buildDataTrack: single value pins one keyframe at startFrame', () => {
    const t = buildDataTrack([42], { propertyPath: 'p', target: 'number', startFrame: 10, endFrame: 200 });
    assert.deepEqual(t.keyframes, [{ frame: 10, value: 42 }]);
  });

  check('buildDataTrack: vec2 targets carry the base on the undriven axis', () => {
    const uni = buildDataTrack([3], { propertyPath: 'transform.scale', target: 'vec2-uniform', startFrame: 0, endFrame: 0 });
    assert.deepEqual(uni.keyframes[0].value, [3, 3]);
    const x = buildDataTrack([3], { propertyPath: 'transform.position', target: 'vec2-x', startFrame: 0, endFrame: 0, base: [9, 9] });
    assert.deepEqual(x.keyframes[0].value, [3, 9]);
    const y = buildDataTrack([3], { propertyPath: 'transform.position', target: 'vec2-y', startFrame: 0, endFrame: 0, base: [9, 9] });
    assert.deepEqual(y.keyframes[0].value, [9, 3]);
  });

  check('buildDataTrack: more values than frames collapse (dedup, later wins, sorted)', () => {
    const t = buildDataTrack([0, 1, 2, 3, 4], { propertyPath: 'p', target: 'number', startFrame: 0, endFrame: 2 });
    // frames round into 0,0,1,2,2 -> unique 0,1,2 with the later value winning each
    assert.deepEqual(t.keyframes.map((k) => k.frame), [0, 1, 2]);
    for (let i = 1; i < t.keyframes.length; i++) assert.ok(t.keyframes[i].frame > t.keyframes[i - 1].frame);
  });

  console.log(`\ndata-binding: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
