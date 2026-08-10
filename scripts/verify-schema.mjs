// AI schema package — acceptance. Tests in BOTH directions: valid documents/contracts parse (and a
// hand-authored scene round-trips losslessly), and the specific malformed shapes a model would
// plausibly emit are rejected. Also verifies the JSON Schema export is constrained-decoding-safe.
//   node scripts/verify-schema.mjs   (or: npm run verify:schema)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'schema-verify-'));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}
const reject = (schema, value, why) => assert.equal(schema.safeParse(value).success, false, `should REJECT: ${why}`);
const accept = (schema, value, why) => {
  const r = schema.safeParse(value);
  assert.equal(r.success, true, `should ACCEPT: ${why}\n${r.success ? '' : JSON.stringify(r.error?.issues, null, 2)}`);
  return r.data;
};

try {
  const S = await bundle('src/schema/index.ts');
  const factory = await bundle('src/core/factory.ts');
  const {
    defaultSchemas, makeSchemas, TIER_CAPS, DEFAULT_CAPS, EASING_TABLE,
    exportDecodingSchemas, findRefs, toJsonSchema,
  } = S;
  const { createComposition, createRectangleLayer, createTextLayer, createGroupLayer } = factory;

  console.log('AI schema package — acceptance\n');

  const s = defaultSchemas;

  // ── Easing single source ──
  ok('easing table has the 5 named curves with expected handles', () => {
    assert.deepEqual(Object.keys(EASING_TABLE).sort(), ['easeIn', 'easeInOut', 'easeOut', 'linear', 'spring']);
    assert.deepEqual(EASING_TABLE.easeInOut, { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [0.58, 1] });
    assert.equal(EASING_TABLE.linear.interpolation, 'linear');
  });

  // ── Round-trip: a hand-authored (factory) scene parses AND is byte-identical after parse ──
  ok('hand-authored factory scene round-trips losslessly', () => {
    const comp = createComposition('Test', { width: 1920, height: 1080, frameRate: 30, durationFrames: 150, backgroundColor: [0, 0, 0, 1] });
    comp.layers.push(createRectangleLayer('box', 100, 100, 200, 120, [1, 0.5, 0, 1], 150));
    comp.layers.push(createTextLayer('title', 200, 200, 'Hello', 150));
    comp.layers.push(createGroupLayer('grp', 0, 0, 150));
    const doc = { version: 2, rootCompositionId: comp.id, compositions: { [comp.id]: comp } };
    const parsed = accept(s.sceneDocument, doc, 'factory scene');
    assert.deepStrictEqual(parsed, doc, 'parse must not add/drop/reorder anything (lossless)');
  });

  // ── Valid AI contracts ──
  const roleFill = { role: 'primary' };
  ok('a well-formed Coder fragment parses (static + keyframes + cloner + role color)', () => {
    accept(s.coderFragment, {
      panelId: 'panel-1',
      layers: [
        { id: 'p1:box', name: 'hero-box', type: 'shape',
          shape: { type: 'rectangle', width: 300, height: 200 }, fill: roleFill,
          transform: { position: [960, 540] } },
        { id: 'p1:title', name: 'title', type: 'text',
          spans: [{ text: 'Hi', color: { role: 'textPrimary' } }],
          transform: { opacity: { keyframes: [ { frame: 0, value: 0, easing: 'easeOut' }, { frame: 30, value: 1 } ] } } },
        { id: 'p1:dots', name: 'dot-grid', type: 'cloner',
          sourceRef: { type: 'layer', layerId: 'p1:box' },
          distribution: { type: 'grid', countX: 5, countY: 5, countZ: 1, spacing: { x: 40, y: 40, z: 0 }, origin: { x: 0, y: 0, z: 0 }, rowOffset: 0 },
          effectors: [ { type: 'random', strength: 1, blendMode: 'add', seed: 7, positionAmount: { x: 5, y: 5, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 }, scaleAmount: 0, opacityAmount: 0 } ],
          stagger: { delaySeconds: 0 }, renderCount: 25 },
      ],
    }, 'coder fragment');
  });

  ok('Director output (ms), Job (frames), Patch parse', () => {
    accept(s.directorOutput, {
      brief: { durationMs: 6000, format: 'landscape', tone: 'bold', subjects: [{ id: 's1', name: 'logo' }] },
      styleContract: { palette: [{ role: 'primary', color: '#f7b500' }], easings: ['easeOut', 'linear', 'easeInOut'], beatMs: 250, shapeLanguage: 'geometric', staggerDoctrine: { mode: 'perLayer', gapMs: 80 } },
      panelPlan: [{ id: 'panel-1', order: 0, startMs: 0, endMs: 6000, elements: [{ id: 'p1:box', name: 'box', kind: 'shape' }], inboundPresent: [], outboundPresent: ['p1:box'] }],
    }, 'director output');
    accept(s.patch, { compositionId: 'c1', ops: [
      { op: 'setProperty', layerId: 'p1:box', propertyPath: 'transform.opacity', value: 0.5 },
      { op: 'reparentLayer', layerId: 'p1:box', parentId: null },
      { op: 'reorderLayer', layerId: 'p1:box', after: 'p1:title' },
      { op: 'renameLayer', layerId: 'p1:box', name: 'renamed' },
    ] }, 'patch');
  });

  // ── Malformed shapes a model would plausibly emit — each REJECTED ──
  const baseLayer = { id: 'p1:x', name: 'x', type: 'shape', shape: { type: 'rectangle', width: 10, height: 10 } };
  ok('rejects an unexpected key on an AI layer (strict — model misunderstood)', () => {
    reject(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, wobble: true }] }, 'unknown key');
  });
  ok('rejects a color LITERAL where a role is required (AI never picks a color)', () => {
    reject(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, fill: [1, 0, 0, 1] }] }, 'literal color');
  });
  ok('rejects a fractional frame in a keyframe track', () => {
    reject(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, transform: { opacity: { keyframes: [{ frame: 1.5, value: 1 }] } } }] }, 'fractional frame');
  });
  ok('rejects a missing semantic name', () => {
    const { name, ...noName } = baseLayer; void name;
    reject(s.coderFragment, { panelId: 'p1', layers: [noName] }, 'no name');
  });
  ok('rejects an unknown easing name', () => {
    reject(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, transform: { opacity: { keyframes: [{ frame: 0, value: 1, easing: 'boing' }] } } }] }, 'bad easing');
  });
  ok('rejects a namespaced id with a space', () => {
    reject(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, id: 'p1 box' }] }, 'space in id');
  });
  ok('rejects index-based addressing in a patch (setProperty needs layerId, no stray index key)', () => {
    reject(s.patch, { compositionId: 'c1', ops: [{ op: 'setProperty', index: 0, propertyPath: 'x', value: 1 }] }, 'index addressing / missing layerId');
  });

  // ── Caps enforced at PARSE time, per tier ──
  ok('renderCount over the tier cap is rejected at parse time', () => {
    const free = makeSchemas(TIER_CAPS.free);
    const cloner = { id: 'p1:c', name: 'c', type: 'cloner', sourceRef: { type: 'layer', layerId: 'p1:c' },
      distribution: { type: 'radial', count: 10, radius: 100, arcDegrees: 360, center: { x: 0, y: 0, z: 0 }, startAngleDegrees: 0, orientToCenter: false },
      effectors: [], stagger: { delaySeconds: 0 }, renderCount: TIER_CAPS.free.maxClonerInstances + 1 };
    reject(free.coderFragment, { panelId: 'p1', layers: [cloner] }, 'over free-tier instance cap');
    // same cloner within pro cap is fine
    accept(makeSchemas(TIER_CAPS.pro).coderFragment, { panelId: 'p1', layers: [{ ...cloner, renderCount: 200 }] }, 'within pro cap');
  });

  // ── Panel within-object guard ──
  ok('a panel with end <= start is rejected (within-object refine)', () => {
    reject(s.panel, { id: 'panel-1', order: 0, start: 60, end: 30, inboundPresent: [], outboundPresent: [] }, 'end<=start');
    accept(s.panel, { id: 'panel-1', order: 0, start: 0, end: 60, inboundPresent: [], outboundPresent: [] }, 'valid panel');
  });

  // ── ID preservation ──
  ok('a namespaced Coder id survives parse unchanged (must never be re-minted)', () => {
    const parsed = accept(s.coderFragment, { panelId: 'p1', layers: [{ ...baseLayer, id: 'p2:title' }] }, 'namespaced id');
    assert.equal(parsed.layers[0].id, 'p2:title');
  });

  // ── JSON Schema export for constrained decoding ──
  ok('decoding schemas export and are $ref-free (no recursion leaked)', () => {
    const js = exportDecodingSchemas(DEFAULT_CAPS);
    for (const [name, schema] of Object.entries(js)) {
      assert.deepEqual(findRefs(schema), [], `${name} must be $ref-free`);
    }
    const frag = JSON.stringify(js.coderFragment);
    assert.ok(frag.includes('"additionalProperties":false'), 'strict → additionalProperties:false');
    assert.ok(frag.includes('anyOf'), 'layer union → anyOf');
  });
  ok('io:input makes defaulted fields optional in the tool schema', () => {
    // blendMode has a default → must NOT be required in the input schema.
    const js = toJsonSchema(s.aiLayer, { io: 'input' });
    const anyOf = js.anyOf || [];
    for (const variant of anyOf) {
      if (Array.isArray(variant.required)) assert.ok(!variant.required.includes('blendMode'), 'blendMode is defaulted → optional on input');
    }
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-schema failed:\n', err);
  process.exit(1);
}
