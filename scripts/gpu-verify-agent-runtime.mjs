// Headless-Chrome smoke test of the agent-mode runtime (window.__ffxAgent, src/agent/runtime.ts) on the
// REAL editor / history / expression stores. Run locally: npm run gpu:agent-runtime
// (Like the other gpu:* harnesses it needs Chrome on the machine, so it is NOT part of `npm test`.)
//
// Proves: listFeatures/getState work, whitelisted actions mutate the real composition, composite
// helpers (text, animator preset, expression) are each ONE undo step, and the whitelist / argument
// validation reject anything not declared in the manifest.

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { bundleEntry, makeTempDir, withHeadlessPage } from './lib/headless-gpu.mjs';

const ENTRY = `
import { installAgentRuntime } from './src/agent/runtime';
import { useEditorStore } from './src/store/editor';
import { useExpressionStore } from './src/expressions/store';
installAgentRuntime();
window.__probe = {
  layer: (id) => useEditorStore.getState().composition.layers.find((l) => l.id === id) || null,
  expr: (id, name) => useExpressionStore.getState().getExpression(id, name),
};
window.__ready = true;
`;

const TEST = `(async () => {
  const a = window.__ffxAgent;
  const out = {};
  const m = a.listFeatures();
  out.features = m.features.length; out.actions = m.actions.length; out.catalogKeys = Object.keys(m.catalogs);
  out.version = a.version;
  const s0 = a.getState();
  out.layers0 = s0.layers.length; out.size = [s0.width, s0.height]; out.undo0 = s0.canUndo;

  const add = await a.run('editor.addText', { content: 'Hello' });
  out.add = add; const id = add.activeLayerId;
  out.textAfterAdd = a.getState().layers.find((l) => l.id === id)?.text;

  out.setText = await a.run('agent.setTextContent', { layerId: id, text: 'Stunning text' });
  out.textAfterSet = a.getState().layers.find((l) => l.id === id)?.text;

  out.anim = await a.run('agent.applyTextAnimatorPreset', { layerId: id, presetId: 'pop-in', startFrame: 0, durationFrames: 20 });
  out.animatorsAfter = (window.__probe.layer(id).animators || []).length;

  out.kf = await a.run('editor.addKeyframe', [id, 'transform.opacity', 0, 0]);
  out.opacityKfs = window.__probe.layer(id).transform.opacity.keyframes.length;

  out.expr = await a.run('agent.setExpression', { layerId: id, propertyName: 'Rotation', code: 'time * 90' });
  out.exprSet = window.__probe.expr(id, 'Rotation')?.code || null;
  out.undoExpr = await a.run('history.undo');
  out.exprAfterUndo = window.__probe.expr(id, 'Rotation');
  out.redoExpr = await a.run('history.redo');
  out.exprAfterRedo = window.__probe.expr(id, 'Rotation')?.code || null;

  // Rejections: not whitelisted, unknown arg, bad enum, missing required arg.
  out.rejectPrivate = await a.run('editor._setComposition', [{}]);
  out.rejectUnknownArg = await a.run('editor.addText', { bogus: 1 });
  out.rejectEnum = await a.run('editor.addMask', { layerId: id, type: 'hexagon' });
  out.rejectMissing = await a.run('editor.renameLayer', { id });
  out.rejectEval = await a.run('eval', 'alert(1)');

  // Undo everything we did: expression, keyframe, animator, text, add -> layer gone.
  for (let i = 0; i < 5; i++) await a.run('history.undo');
  out.layerAfterUndoAll = window.__probe.layer(id);
  out.layersEnd = a.getState().layers.length;
  return out;
})()`;

const dir = makeTempDir('ffx-agent-runtime-');
try {
  await bundleEntry(ENTRY, dir);
  const r = await withHeadlessPage({ dir, timeoutMs: 180000 }, async (page) => {
    await page.evaluate("import('/bundle.js').then(() => true)");
    for (let i = 0; i < 100; i++) {
      if (await page.evaluate('window.__ready === true')) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    if (!(await page.evaluate('window.__ready === true'))) {
      throw new Error(`runtime bundle failed to load:\n${page.logs.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}`);
    }
    return page.evaluate(TEST);
  });

  let passed = 0;
  const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
  console.log('gpu:agent-runtime');
  check('listFeatures returns features, actions and live catalogs', () => {
    assert.ok(r.features >= 30 && r.actions >= 50);
    assert.ok(r.catalogKeys.includes('textAnimatorPresets') && r.catalogKeys.includes('animationTemplates'));
    assert.match(r.version, /^ffx-agent\//);
  });
  check('editor.addText creates a real text layer and reports its id', () => {
    assert.equal(r.add.ok, true, JSON.stringify(r.add));
    assert.ok(r.add.activeLayerId);
    assert.equal(r.textAfterAdd, 'Hello');
  });
  check('agent.setTextContent replaces the text', () => {
    assert.equal(r.setText.ok, true, JSON.stringify(r.setText));
    assert.equal(r.textAfterSet, 'Stunning text');
  });
  check('agent.applyTextAnimatorPreset adds a range-selector animator', () => {
    assert.equal(r.anim.ok, true, JSON.stringify(r.anim));
    assert.equal(r.animatorsAfter, 1);
  });
  check('editor.addKeyframe with positional args sets a keyframe', () => {
    assert.equal(r.kf.ok, true, JSON.stringify(r.kf));
    assert.equal(r.opacityKfs, 1);
  });
  check('agent.setExpression is one undoable history step (undo removes, redo restores)', () => {
    assert.equal(r.expr.ok, true, JSON.stringify(r.expr));
    assert.equal(r.exprSet, 'time * 90');
    assert.equal(r.exprAfterUndo, null);
    assert.equal(r.exprAfterRedo, 'time * 90');
  });
  check('non-whitelisted ids and bad arguments are rejected without side effects', () => {
    for (const k of ['rejectPrivate', 'rejectUnknownArg', 'rejectEnum', 'rejectMissing', 'rejectEval']) {
      assert.equal(r[k].ok, false, `${k}: ${JSON.stringify(r[k])}`);
    }
  });
  check('undoing every step removes the layer again (each action = one undo)', () => {
    assert.equal(r.layerAfterUndoAll, null);
    assert.equal(r.layersEnd, r.layers0);
  });
  console.log(`\n${passed} checks passed.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
