// Acceptance harness for the animation recipes (mcp/recipes/*.json) and their engine (mcp/lib/recipes.mjs),
// plus the MCP surface that exposes them (list_recipes / apply_recipe dry run, the taste / authoring resources
// and prompts). Pure Node: no browser, so it runs in `npm test` / CI. The live proof (recipes building real
// layers on the WebGPU renderer) is the taste-proof build, run locally.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { loadRecipes, runRecipe, evaluate, resolveValue, normalizeParams, validateRecipe, describeRecipe, RECIPE_TOOLS } = await import(new URL('../mcp/lib/recipes.mjs', import.meta.url));

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ---- 1. Expression evaluator ------------------------------------------------------------------
const scope = { vars: { x: 3, text: 'Hello big world', c: [1, 0, 0, 1], arr: [1, 2, 3], nothing: null }, results: { a: { result: { masks: [{ id: 'm1' }, { id: 'm2' }] } } }, start: 10, fps: 60 };
const E = (e) => evaluate(e, scope);
ok(E('x * 2 + 1') === 7, 'arithmetic');
ok(E('f(12)') === 24 && E('t(6)') === 22, 'f() scales 30 fps frames to the comp fps, t() adds start');
ok(E('len(words(text))') === 3 && E('chars(text)') === 13, 'words / chars');
ok(E('@a.result.masks[-1].id') === 'm2', 'step refs with negative index');
ok(E('@missing.result') === undefined, 'a skipped step reads as undefined');
ok(E("x > 2 ? 'big' : 'small'") === 'big', 'ternary');
ok(E('nothing == null ? 5 : nothing.boom') === 5, 'ternary is lazy');
assert.deepEqual(E('[x, -x / 2]'), [3, -1.5]); checks++;
assert.deepEqual(E("rgba('#ff8000')"), [1, 0.502, 0, 1]); checks++;
assert.deepEqual(E("mix(c, '#000000', 0.5)"), [0.5, 0, 0, 1]); checks++;
assert.deepEqual(E("obj('a', 1, 'b', nothing, 'c', 'z')"), { a: 1, c: 'z' }); checks++;
assert.deepEqual(E("outline('circle', 100)"), { type: 'ellipse', width: 100, height: 100 }); checks++;
assert.deepEqual(resolveValue({ a: '{{x}}', b: 'n={{x + 1}}', c: ['{{x}}', 2] }, scope), { a: 3, b: 'n=4', c: [3, 2] }); checks++;
assert.throws(() => E('process.exit(1)'), /trailing tokens|unknown/); checks++;
assert.throws(() => E('constructor'), /unknown name/); checks++;
assert.throws(() => E('x +'), /unexpected end/); checks++;

// ---- 2. Recipes load and validate -------------------------------------------------------------
const recipes = loadRecipes();
ok(recipes.size >= 8, `at least 8 recipes (found ${recipes.size})`);
for (const r of recipes.values()) {
  ok(validateRecipe(r).length === 0, `${r.id} validates`);
  ok(r.source.some((s) => /\br0\d\b/.test(s)), `${r.id} names the reference(s) it was extracted from`);
  ok(Object.keys(r.params ?? {}).length >= 3, `${r.id} is parameterized (>= 3 params)`);
  const d = describeRecipe(r);
  ok(d.params && d.description, `${r.id} describes itself`);
  ok(!JSON.stringify(r).includes(String.fromCharCode(0x2014)), `${r.id} has no em dash`);
}
ok(validateRecipe({ id: 'Bad Id', name: 'x', category: 'x', description: 'x', steps: [{ action: 'a', tool: 'b' }] }).length >= 3, 'validator rejects a bad recipe');
const kt = recipes.get('kinetic-title');
assert.throws(() => normalizeParams(kt, {}), /text" is required/); checks++;
assert.throws(() => normalizeParams(kt, { text: 'x', bogus: 1 }), /unknown param "bogus"/); checks++;
assert.throws(() => normalizeParams(kt, { text: 'x', size: 'big' }), /must be a number/); checks++;
assert.throws(() => normalizeParams(kt, { text: 'x', color: 'red' }), /colour|must be/); checks++;
ok(normalizeParams(kt, { text: 'x', color: '#ff0000' }).color[0] === 1, 'hex colours are normalised to RGBA');

// ---- 3. Every action a recipe calls is whitelisted --------------------------------------------
const manifestPath = join(ROOT, 'public/agent/features.json');
if (!existsSync(manifestPath)) execFileSync(process.execPath, [join(ROOT, 'scripts/gen-agent-manifest.mjs')], { cwd: ROOT, stdio: 'ignore' });
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const whitelist = new Map(manifest.actions.map((a) => [a.id, a]));
const presets = new Set((manifest.catalogs.textAnimatorPresets ?? []).map((p) => p.id));
const easings = new Set((manifest.catalogs.easings ?? []).map((p) => p.id));

// ---- 4. Run every recipe on a mock runtime, three comp formats --------------------------------
function mockExec(log) {
  let n = 0;
  return async ({ kind, name, args }) => {
    log.push({ kind, name, args });
    n++;
    if (kind === 'tool') {
      ok(RECIPE_TOOLS.has(name), `tool ${name} is allowed in recipes`);
      if (name === 'get_state') return { background: [], layers: [] };
      if (name === 'get_layer') return { ok: true, result: { id: args.layerId, masks: [{ id: 'mask_1' }], transform: { position: { defaultValue: [0, 0] } } } };
      if (name === 'measure_text') return { ok: true, result: { center: [540, 540], ink: { top: 480, bottom: 600, left: 200, right: 880, width: 680, height: 120 } } };
      if (name === 'import_image') {
        ok(existsSync(args.path), `import_image path exists: ${args.path}`);
        return { ok: true, result: { assetId: 'asset', width: 256, height: 256 }, placed: true, activeLayerId: `L${n}` };
      }
    }
    const spec = whitelist.get(name);
    ok(!!spec, `action ${name} is in the agent whitelist`);
    if (Array.isArray(args)) ok(args.length <= spec.params.length, `${name}: positional args fit`);
    else for (const k of Object.keys(args ?? {})) ok(spec.params.some((p) => p.name === k), `${name}: param "${k}" exists`);
    if (name === 'agent.applyTextAnimatorPreset') ok(presets.has(args.presetId), `preset ${args.presetId} exists`);
    if (name === 'agent.measureString') return { ok: true, result: { width: String(args.text).length * args.fontSize * 0.55, lineHeightPx: args.fontSize * 1.2 } };
    if (name === 'agent.addCursor') return { ok: true, result: { cursorId: `cursor${n}` } };
    if (name === 'agent.cursorMoveTo') return { ok: true, result: { endFrame: args.frame + (args.durationFrames ?? 10) } };
    if (name === 'agent.cursorClick') return { ok: true, result: { responseFrame: args.frame + 2 } };
    return { ok: true, result: `L${n}`, activeLayerId: `L${n}` };
  };
}

function checkValue(v, where) {
  const s = JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? '__NAN__' : x));
  ok(!s.includes('__NAN__'), `${where}: no NaN / Infinity`);
  ok(!s.includes('{{'), `${where}: every template resolved`);
}

const FORMATS = [{ width: 1080, height: 1080, fps: 60 }, { width: 1920, height: 1080, fps: 30 }, { width: 1080, height: 1920, fps: 60 }];
const SAMPLE = {
  'kinetic-title': { text: 'FlashFX MCP early access', accentWord: 1 },
  'blur-in-text': { text: 'Built by Claude' },
  'type-on': { text: 'make me a launch title', left: 120 },
  'prompt-bar': { query: 'launch title, early access' },
  'pop-in': { label: 'EARLY ACCESS' },
  'cursor-click': { x: 700, y: 500 },
  'transition': { style: 'wipe-up' },
};
for (const r of recipes.values()) {
  for (const fmt of FORMATS) {
    for (const withEnd of [false, true]) {
      const log = [];
      const params = { ...(r.example?.params ?? {}), ...(SAMPLE[r.id] ?? {}) };
      const startFrame = 12;
      const out = await runRecipe(r, params, { ...fmt, durationFrames: 600, startFrame, endFrame: withEnd ? startFrame + 4 * fmt.fps : undefined, parentId: withEnd ? 'cam' : undefined, parentPosition: [fmt.width / 2, fmt.height / 2] }, mockExec(log));
      const tag = `${r.id} @${fmt.width}x${fmt.height}@${fmt.fps}${withEnd ? ' endFrame+parent' : ''}`;
      ok(out.end > out.start, `${tag}: end after start`);
      ok(log.length > 0, `${tag}: runs actions`);
      for (const step of log) {
        checkValue(step.args, `${tag} ${step.name}`);
        const a = step.args ?? {};
        for (const k of ['frame', 'startFrame', 'durationFrames', 'newInPoint']) if (a[k] !== undefined) ok(Number.isFinite(a[k]) && a[k] >= 0, `${tag} ${step.name}: ${k} is a frame >= 0`);
        if (step.name === 'editor.setKeyframes') {
          const fr = a.keyframes.map((k) => k.frame);
          ok(fr.every((f, i) => i === 0 || f > fr[i - 1]), `${tag} ${a.propertyPath}: keyframe frames strictly increase (${fr.join(',')})`);
          for (const k of a.keyframes) if (typeof k.ease === 'string') ok(['linear', 'hold', 'spring', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(k.ease) || easings.has(k.ease), `${tag}: ease "${k.ease}" exists`);
        }
        if (step.name === 'editor.setShapeMorph') {
          const fr = a.poses.map((p) => p.frame);
          ok(fr.every((f, i) => i === 0 || f > fr[i - 1]), `${tag}: morph pose frames strictly increase (${fr.join(',')})`);
        }
      }
      ok(out.checkFrames.every((f) => f >= out.start && f <= out.end), `${tag}: checkFrames inside the span`);
      if (withEnd && r.clip !== false) ok(log.filter((s) => s.args?.path === 'outPoint').every((s) => s.args.value === out.end), `${tag}: layers clipped to endFrame`);
      if (withEnd) ok(log.filter((s) => s.name === 'editor.setLayerParent' && s.args.parentId === 'cam').length === out.layers.filter((l) => l.root).length, `${tag}: root layers parented to the camera`);
    }
  }
}

// ---- 5. The MCP server exposes it (stdio, no browser) -----------------------------------------
const proc = spawn(process.execPath, [join(ROOT, 'mcp/flashfx-mcp.mjs')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map();
let nextId = 1;
createInterface({ input: proc.stdout }).on('line', (line) => { const m = JSON.parse(line); pending.get(m.id)?.(m); pending.delete(m.id); });
const rpc = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 20000);
  pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(m.error.message)) : res(m.result); });
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
try {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify-recipes', version: '1' } });
  ok(init.capabilities.prompts && init.capabilities.resources, 'server advertises prompts + resources');
  ok(/list_recipes/.test(init.instructions) && /flashfx:\/\/taste/.test(init.instructions), 'server instructions point at recipes and taste');
  const tools = (await rpc('tools/list')).tools.map((t) => t.name);
  ok(tools.includes('list_recipes') && tools.includes('apply_recipe'), 'list_recipes + apply_recipe tools');
  const lr = await rpc('tools/call', { name: 'list_recipes', arguments: {} });
  ok(!lr.isError && lr.structuredContent.count === recipes.size, 'list_recipes returns every recipe');
  const one = await rpc('tools/call', { name: 'list_recipes', arguments: { id: 'prompt-bar' } });
  ok(one.structuredContent.recipes[0].params.query.required === true, 'list_recipes shows required params');
  const dry = await rpc('tools/call', { name: 'apply_recipe', arguments: { id: 'kinetic-title', params: { text: 'Hello there' }, startFrame: 6, dryRun: true } });
  ok(!dry.isError && Array.isArray(dry.structuredContent.steps) && dry.structuredContent.steps.length > 10, 'apply_recipe dryRun expands the steps without a browser');
  const bad = await rpc('tools/call', { name: 'apply_recipe', arguments: { id: 'kinetic-title', params: {}, dryRun: true } });
  ok(bad.isError && /required/.test(bad.content[0].text), 'apply_recipe reports a missing param as a tool error');
  const res = (await rpc('resources/list')).resources.map((r) => r.uri);
  ok(['flashfx://taste', 'flashfx://authoring', 'flashfx://recipes'].every((u) => res.includes(u)), 'taste / authoring / recipes resources');
  const taste = await rpc('resources/read', { uri: 'flashfx://taste' });
  ok(taste.contents[0].mimeType === 'text/markdown' && taste.contents[0].text === readFileSync(join(ROOT, 'mcp/TASTE.md'), 'utf8'), 'flashfx://taste serves mcp/TASTE.md');
  const rec = await rpc('resources/read', { uri: 'flashfx://recipe/end-card' });
  ok(JSON.parse(rec.contents[0].text).id === 'end-card', 'flashfx://recipe/{id} serves one recipe');
  const prompts = (await rpc('prompts/list')).prompts.map((p) => p.name);
  ok(['motion-brief', 'taste', 'authoring'].every((p) => prompts.includes(p)), 'motion-brief / taste / authoring prompts');
  const pb = await rpc('prompts/get', { name: 'motion-brief', arguments: { brief: 'a 6 s title' } });
  ok(/a 6 s title/.test(pb.messages[0].content.text) && /apply_recipe/.test(pb.messages[0].content.text), 'motion-brief prompt carries the brief and the workflow');
} finally {
  proc.stdin.end();
  setTimeout(() => proc.kill(), 3000).unref();
}

// ---- 6. Docs exist ----------------------------------------------------------------------------
for (const f of ['mcp/TASTE.md', 'mcp/skill/flashfx-motion/SKILL.md']) {
  const t = readFileSync(join(ROOT, f), 'utf8');
  ok(t.length > 2000, `${f} is written`);
  ok(!t.includes(String.fromCharCode(0x2014)), `${f} has no em dash`);
}

console.log(`verify:recipes OK - ${checks} checks, ${recipes.size} recipes`);
