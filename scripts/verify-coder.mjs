// Coder stage — acceptance for everything testable WITHOUT a network: prompt-marker rendering,
// cache-block ordering, the forced-tool request shape, the parse → retry-once → fail-loudly loop,
// and the Coder-local semantic validator (namespace / panelId / budget / boundary ownership) —
// all driven by a fake client. The real model call is exercised by scripts/coder-run.mjs with your
// ANTHROPIC_API_KEY. Run: node scripts/verify-coder.mjs  (or: npm run verify:coder)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'coder-verify-'));
let passed = 0;
const ok = (name, fn) => { const r = fn(); if (r instanceof Promise) return r.then(() => { passed++; console.log(`  ✓ ${name}`); }); passed++; console.log(`  ✓ ${name}`); };
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

const STYLE = {
  palette: [
    { role: 'background', color: '#1a1210' }, { role: 'primary', color: '#c98a45' },
    { role: 'textPrimary', color: '#f5ece3' }, { role: 'textSecondary', color: '#a89383' },
  ],
  easings: ['easeOut', 'easeInOut', 'easeIn', 'linear'], beatMs: 375, shapeLanguage: 'geometric',
  staggerDoctrine: { mode: 'none', gapMs: 0 },
};
// A valid Job for a single 3s panel (frames). Only the fields runCoder/buildCoderRequest/validate read.
const job = (over = {}) => ({
  requestId: 'job:panel-0', panelId: 'panel-0', styleContract: STYLE,
  panel: { id: 'panel-0', order: 0, start: 0, end: 90, focalPoint: [960, 540], inboundPresent: [], outboundPresent: [], ...(over.panel ?? {}) },
  neighbors: over.neighbors ?? {}, idNamespace: over.idNamespace ?? 'p0:', layerBudget: over.layerBudget ?? 8,
});
// A valid CoderFragment: one namespaced text layer.
const frag = () => ({ panelId: 'panel-0', layers: [{ id: 'p0:title', name: 'hero-title', type: 'text', spans: [{ text: 'Hello' }] }] });
const U = { inputTokens: 1000, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 300 };

function mockClient(responses) {
  const requests = []; let i = 0;
  return { requests, createMessage: async (req) => { requests.push(req); const r = responses[Math.min(i, responses.length - 1)]; i++; return r; } };
}

try {
  const C = await bundle('src/ai/coder/index.ts');
  const S = await bundle('src/schema/index.ts');
  const { renderCoderMarkers, buildCoderRequest, coderCachedPrefix, runCoder, coderToolSchema, validateCoderFragment, CODER_TOOL_NAME } = C;
  const { TIER_CAPS, findRefs } = S;

  console.log('Coder stage — acceptance\n');

  const template = readFileSync(join(process.cwd(), 'src/ai/prompts/coder.md'), 'utf8');
  const systemPrompt = renderCoderMarkers(template);
  const toolSchema = coderToolSchema();

  ok('prompt renders every marker (no {{...}} left) and injects the vocabularies', () => {
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(systemPrompt), 'unfilled marker remains');
    for (const token of ['fadeIn', 'staggerReveal', 'popIn', 'textPrimary', 'geometric', 'cloner', 'perLayer']) {
      assert.ok(systemPrompt.includes(token), `prompt missing injected token ${token}`);
    }
  });

  ok('unfilled marker throws', () => {
    assert.throws(() => renderCoderMarkers('hi {{NOPE}}'), /unfilled markers/);
  });

  ok('the forced tool schema is $ref-free (constrained-decoding safe)', () => {
    assert.deepEqual(findRefs(toolSchema), []);
  });

  ok('cache ordering: tools+system are the stable prefix; only the user turn varies', () => {
    const base = { systemPrompt, toolSchema, model: 'claude-opus-5', maxTokens: 8192 };
    const a = buildCoderRequest({ ...base, job: job() });
    const b = buildCoderRequest({ ...base, job: job({ idNamespace: 'p1:', panel: { id: 'panel-0', order: 1, start: 90, end: 180, inboundPresent: [], outboundPresent: [] } }) });
    assert.deepStrictEqual(coderCachedPrefix(a), coderCachedPrefix(b), 'cached prefix must not vary');
    assert.notDeepStrictEqual(a.messages, b.messages);
    assert.equal(a.system[a.system.length - 1].cache_control?.type, 'ephemeral');
    assert.ok(!('cache_control' in a.messages[0]));
    assert.deepEqual(a.tool_choice, { type: 'tool', name: CODER_TOOL_NAME });
    assert.equal(a.tools[0].input_schema, toolSchema);
    assert.ok(a.messages[0].content.includes('p0:'), 'user turn should carry the id namespace');
  });

  const runOpts = (client) => ({ job: job(), caps: TIER_CAPS.pro, client, systemPrompt, toolSchema, now: () => 0 });

  await ok('runCoder returns a validated fragment on a good first response (1 attempt)', async () => {
    const client = mockClient([{ toolInput: frag(), usage: U }]);
    const res = await runCoder(runOpts(client));
    assert.equal(res.attempts, 1);
    assert.equal(res.fragment.panelId, 'panel-0');
    assert.equal(res.fragment.layers[0].id, 'p0:title');
    assert.equal(res.usage.inputTokens, 1000);
    assert.equal(client.requests.length, 1);
  });

  await ok('runCoder retries once with errors fed back, then succeeds (structural)', async () => {
    const bad = frag(); delete bad.layers; // structurally invalid
    const client = mockClient([{ toolInput: bad, usage: U }, { toolInput: frag(), usage: U }]);
    const res = await runCoder(runOpts(client));
    assert.equal(res.attempts, 2);
    assert.equal(client.requests.length, 2);
    assert.equal(client.requests[1].messages.length, 2);
    assert.ok(client.requests[1].messages[1].content.includes('failed'), 'retry must feed errors back');
    assert.equal(res.usage.inputTokens, 2000);
  });

  await ok('a Coder-semantic violation (id outside the namespace) triggers the retry', async () => {
    const nsBad = { panelId: 'panel-0', layers: [{ id: 'x:title', name: 'hero-title', type: 'text', spans: [{ text: 'Hi' }] }] };
    const client = mockClient([{ toolInput: nsBad, usage: U }, { toolInput: frag(), usage: U }]);
    const res = await runCoder(runOpts(client));
    assert.equal(res.attempts, 2);
    assert.ok(client.requests[1].messages[1].content.includes('namespace'), 'retry note should mention the namespace error');
  });

  await ok('two bad responses fail loudly (no silent bad fragment)', async () => {
    const wrongPanel = { panelId: 'nope', layers: frag().layers };
    const client = mockClient([{ toolInput: wrongPanel, usage: U }]);
    await assert.rejects(runCoder(runOpts(client)), /failed after 2 attempts/);
  });

  ok('validateCoderFragment enforces panelId, namespace, budget, uniqueness, and boundary ownership', () => {
    assert.deepEqual(validateCoderFragment(frag(), job()), []);
    // panelId mismatch
    assert.ok(validateCoderFragment({ panelId: 'other', layers: frag().layers }, job()).some((e) => e.includes('panelId')));
    // namespace
    assert.ok(validateCoderFragment({ panelId: 'panel-0', layers: [{ id: 'q:x', name: 'n', type: 'text', spans: [{ text: 'a' }] }] }, job()).some((e) => e.includes('namespace')));
    // budget
    const many = { panelId: 'panel-0', layers: Array.from({ length: 3 }, (_, i) => ({ id: `p0:l${i}`, name: `n${i}`, type: 'text', spans: [{ text: 'a' }] })) };
    assert.ok(validateCoderFragment(many, job({ layerBudget: 2 })).some((e) => e.includes('budget')));
    // duplicate id
    const dup = { panelId: 'panel-0', layers: [{ id: 'p0:a', name: 'a', type: 'text', spans: [{ text: 'x' }] }, { id: 'p0:a', name: 'b', type: 'text', spans: [{ text: 'y' }] }] };
    assert.ok(validateCoderFragment(dup, job()).some((e) => e.includes('duplicate')));
    // boundary ownership: panel says p0:hero is on screen at the edge, but no such layer
    assert.ok(validateCoderFragment(frag(), job({ panel: { id: 'panel-0', order: 0, start: 0, end: 90, inboundPresent: ['p0:hero'], outboundPresent: [] } })).some((e) => e.includes("'p0:hero'")));
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-coder failed:\n', err);
  process.exit(1);
}
