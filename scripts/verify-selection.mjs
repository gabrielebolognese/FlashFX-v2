// Acceptance harness for the selection core (core/selection.ts): select-same + deep-select/isolation.
// Run: node scripts/verify-selection.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'selection-verify-'));
const outfile = join(tmp, 'sel.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// Minimal layer fixtures. parentId/visible/locked/type are the fields the core reads.
const L = (id, type, over = {}) => ({ id, type, parentId: null, visible: true, locked: false, ...over });
const group = (id, over = {}) => L(id, 'group', over);
const shape = (id, fill, stroke, over = {}) => L(id, 'shape', { shape: { type: 'rectangle', fillColor: fill, strokeColor: stroke, strokeWidth: { valueType: 'number', defaultValue: 1, keyframes: [] } }, ...over });
const textL = (id, font, color, over = {}) => L(id, 'text', { content: { spans: [{ text: 'x', style: { fontFamily: font, color, strokeColor: [0, 0, 0, 1] } }] }, ...over });

try {
  await build({ entryPoints: ['src/core/selection.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  const m = await import(pathToFileURL(outfile).href);
  const { getGroupPath, getTopLevelGroupAncestor, getChildOnPath, resolveCanvasClick, resolveDoubleClick, selectSameLayers, vec4Eq, availableSameAttrs, getLayerEffectSig } = m;

  // Hierarchy: outer(group) > inner(group) > leaf ; plus an ungrouped shape.
  const hier = () => [
    group('outer'),
    group('inner', { parentId: 'outer' }),
    shape('leaf', [1, 0, 0, 1], [0, 0, 0, 1], { parentId: 'inner' }),
    shape('free', [1, 0, 0, 1], [0, 0, 0, 1]),
  ];

  check('getGroupPath: nested leaf → [outer, inner]; ungrouped → []', () => {
    assert.deepEqual(getGroupPath('leaf', hier()), ['outer', 'inner']);
    assert.deepEqual(getGroupPath('free', hier()), []);
  });
  check('getTopLevelGroupAncestor: grouped → outermost; ungrouped → null', () => {
    assert.equal(getTopLevelGroupAncestor('leaf', hier()), 'outer');
    assert.equal(getTopLevelGroupAncestor('free', hier()), null);
  });
  check('getChildOnPath(null,leaf) → top group; getChildOnPath(inner,leaf) → leaf', () => {
    assert.equal(getChildOnPath(null, 'leaf', hier()), 'outer');
    assert.equal(getChildOnPath('inner', 'leaf', hier()), 'leaf');
    assert.equal(getChildOnPath('outer', 'leaf', hier()), 'inner');
  });

  check('resolveCanvasClick plain ungrouped → {leaf, null}', () => {
    assert.deepEqual(resolveCanvasClick({ leafId: 'free', deepSelect: false, activeGroupId: null, layers: hier() }), { selectId: 'free', activeGroupId: null });
  });
  check('resolveCanvasClick plain grouped, no isolation → {topGroup, null}', () => {
    assert.deepEqual(resolveCanvasClick({ leafId: 'leaf', deepSelect: false, activeGroupId: null, layers: hier() }), { selectId: 'outer', activeGroupId: null });
  });
  check('resolveCanvasClick deepSelect grouped → {leaf, scope unchanged}', () => {
    assert.deepEqual(resolveCanvasClick({ leafId: 'leaf', deepSelect: true, activeGroupId: 'outer', layers: hier() }), { selectId: 'leaf', activeGroupId: 'outer' });
  });
  check('resolveCanvasClick isolation + leaf in scope → {childOnPath, same scope}', () => {
    assert.deepEqual(resolveCanvasClick({ leafId: 'leaf', deepSelect: false, activeGroupId: 'outer', layers: hier() }), { selectId: 'inner', activeGroupId: 'outer' });
  });
  check('resolveCanvasClick isolation + leaf outside scope → exits isolation, selects that top-level object', () => {
    // 'free' is an ungrouped top-level object → its top group is null → select 'free' itself, scope cleared.
    assert.deepEqual(resolveCanvasClick({ leafId: 'free', deepSelect: false, activeGroupId: 'outer', layers: hier() }), { selectId: 'free', activeGroupId: null });
  });
  check('resolveCanvasClick leafId=null → {null, null}', () => {
    assert.deepEqual(resolveCanvasClick({ leafId: null, deepSelect: false, activeGroupId: 'outer', layers: hier() }), { selectId: null, activeGroupId: null });
  });

  check('resolveDoubleClick ungrouped leaf → {leaf, unchanged} (no descend)', () => {
    assert.deepEqual(resolveDoubleClick({ leafId: 'free', activeGroupId: null, layers: hier() }), { selectId: 'free', activeGroupId: null });
  });
  check('resolveDoubleClick grouped from root → enters top group, selects childOnPath', () => {
    assert.deepEqual(resolveDoubleClick({ leafId: 'leaf', activeGroupId: null, layers: hier() }), { selectId: 'inner', activeGroupId: 'outer' });
  });
  check('resolveDoubleClick again with activeGroupId=outer → descends into inner, selects leaf', () => {
    assert.deepEqual(resolveDoubleClick({ leafId: 'leaf', activeGroupId: 'outer', layers: hier() }), { selectId: 'leaf', activeGroupId: 'inner' });
  });

  check("selectSameLayers 'fill' → matching fills only, excludes non-matching/locked/hidden, includes reference", () => {
    const layers = [
      shape('a', [1, 0, 0, 1], [0, 0, 0, 1]),
      shape('b', [1, 0, 0, 1], [0, 0, 0, 1]),
      shape('c', [0, 1, 0, 1], [0, 0, 0, 1]),               // different fill
      shape('d', [1, 0, 0, 1], [0, 0, 0, 1], { locked: true }), // locked out
      shape('e', [1, 0, 0, 1], [0, 0, 0, 1], { visible: false }), // hidden out
      group('g'),
    ];
    assert.deepEqual(selectSameLayers(layers, 'a', 'fill'), ['a', 'b']);
  });
  check("selectSameLayers 'stroke' uses epsilon vec4Eq", () => {
    const layers = [shape('a', [1, 0, 0, 1], [0.5, 0.5, 0.5, 1]), shape('b', [0, 1, 0, 1], [0.5, 0.5, 0.500001, 1])];
    assert.deepEqual(selectSameLayers(layers, 'a', 'stroke'), ['a', 'b']);
  });
  check("selectSameLayers 'font' → text sharing fontFamily only", () => {
    const layers = [textL('a', 'Inter', [1, 1, 1, 1]), textL('b', 'Inter', [0, 0, 0, 1]), textL('c', 'Roboto', [1, 1, 1, 1]), shape('s', [1, 0, 0, 1], [0, 0, 0, 1])];
    assert.deepEqual(selectSameLayers(layers, 'a', 'font'), ['a', 'b']);
  });
  check("selectSameLayers 'type' → same layer.type", () => {
    const layers = [shape('a', [1, 0, 0, 1], [0, 0, 0, 1]), shape('b', [0, 1, 0, 1], [0, 0, 0, 1]), textL('t', 'Inter', [1, 1, 1, 1])];
    assert.deepEqual(selectSameLayers(layers, 'a', 'type'), ['a', 'b']);
  });
  check("selectSameLayers 'effect' → same enabled-effect signature", () => {
    const withShadow = (id) => shape(id, [1, 0, 0, 1], [0, 0, 0, 1], { shadow: { enabled: true, color: [0, 0, 0, 1] } });
    const noEffect = (id) => shape(id, [1, 0, 0, 1], [0, 0, 0, 1]);
    const layers = [withShadow('a'), withShadow('b'), noEffect('c')];
    assert.equal(getLayerEffectSig(layers[0]), 'shadow');
    assert.deepEqual(selectSameLayers(layers, 'a', 'effect'), ['a', 'b']);
  });

  check('vec4Eq: -0 vs +0 equal; within epsilon equal; beyond not', () => {
    assert.equal(vec4Eq([-0, 0, 0, 1], [0, 0, 0, 1]), true);
    assert.equal(vec4Eq([0.5, 0, 0, 1], [0.50005, 0, 0, 1]), true);
    assert.equal(vec4Eq([0.5, 0, 0, 1], [0.6, 0, 0, 1]), false);
    assert.equal(vec4Eq(null, null), true);
    assert.equal(vec4Eq([0, 0, 0, 1], null), false);
  });
  check('availableSameAttrs: shape → type/fill/stroke; text → type/fill/stroke/font; group → type only', () => {
    assert.deepEqual(availableSameAttrs(shape('s', [1, 0, 0, 1], [0, 0, 0, 1])), ['type', 'fill', 'stroke']);
    assert.deepEqual(availableSameAttrs(textL('t', 'Inter', [1, 1, 1, 1])), ['type', 'fill', 'stroke', 'font']);
    assert.deepEqual(availableSameAttrs(group('g')), ['type']);
  });
  check('purity: identical inputs → identical outputs', () => {
    const a = selectSameLayers(hier(), 'leaf', 'type');
    const b = selectSameLayers(hier(), 'leaf', 'type');
    assert.deepEqual(a, b);
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
