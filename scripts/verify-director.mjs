// Director stage — acceptance for everything testable WITHOUT a network: prompt-marker rendering,
// cache-block ordering, the forced-tool request shape, and the parse → retry-once → fail-loudly loop
// (driven by a fake client). The real model call is exercised by the runner (scripts/director-run.mjs)
// with your API key. node scripts/verify-director.mjs  (or: npm run verify:director)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'director-verify-'));
let passed = 0;
const ok = (name, fn) => { const r = fn(); if (r instanceof Promise) return r.then(() => { passed++; console.log(`  ✓ ${name}`); }); passed++; console.log(`  ✓ ${name}`); };
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

// A canned VALID DirectorOutput for a 1920x1080 canvas (beat 375, 3000ms = 8 beats, one panel).
const validOutput = () => ({
  brief: { durationMs: 3000, format: 'landscape', tone: 'elegant', subjects: [
    { id: 's-wordmark', name: 'wordmark' }, { id: 's-mark', name: 'mark' }, { id: 's-tag', name: 'tagline' },
  ] },
  styleContract: {
    palette: [
      { role: 'background', color: '#1a1210' }, { role: 'primary', color: '#c98a45' },
      { role: 'textPrimary', color: '#f5ece3' }, { role: 'textSecondary', color: '#a89383' },
    ],
    easings: ['easeOut', 'easeInOut', 'easeIn', 'linear'], beatMs: 375, shapeLanguage: 'geometric',
    staggerDoctrine: { mode: 'none', gapMs: 0 },
  },
  panelPlan: [{ id: 'panel-0', order: 0, startMs: 0, endMs: 3000, elements: [], inboundPresent: [], outboundPresent: [] }],
});
const U = { inputTokens: 1200, cacheReadTokens: 800, cacheWriteTokens: 0, outputTokens: 400 };

function mockClient(responses) {
  const requests = []; let i = 0;
  return { requests, createMessage: async (req) => { requests.push(req); const r = responses[Math.min(i, responses.length - 1)]; i++; return r; } };
}

try {
  const D = await bundle('src/ai/director/index.ts');
  const S = await bundle('src/schema/index.ts');
  const {
    renderDirectorMarkers, buildDirectorRequest, directorCachedPrefix, runDirector, directorToolSchema,
    estimateCostUsd, DIRECTOR_TOOL_NAME, formatForCanvas,
  } = D;
  const { TIER_CAPS, findRefs } = S;

  console.log('Director stage — acceptance\n');

  const template = readFileSync(join(process.cwd(), 'src/ai/prompts/director.md'), 'utf8');
  const systemPrompt = renderDirectorMarkers(template);
  const toolSchema = directorToolSchema();

  ok('prompt renders every marker (no {{...}} left) and injects the vocabularies', () => {
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(systemPrompt), 'unfilled marker remains');
    for (const token of ['textPrimary', 'easeInOut', 'landscape', 'crossDissolve', 'geometric', 'perLayer']) {
      assert.ok(systemPrompt.includes(token), `prompt missing injected token ${token}`);
    }
    // The Director must NOT be handed the preset catalog (it names none of it).
    assert.ok(!systemPrompt.includes('popIn') && !systemPrompt.includes('staggerReveal'), 'preset names leaked into Director prompt');
  });

  ok('unfilled marker throws (a template/marker mismatch is a build error)', () => {
    assert.throws(() => renderDirectorMarkers('hello {{NOPE}}'), /unfilled markers/);
  });

  ok('the forced tool schema is $ref-free (constrained-decoding safe)', () => {
    assert.deepEqual(findRefs(toolSchema), []);
  });

  ok('cache ordering: tools+system are the stable prefix; only the user turn varies', () => {
    const base = { systemPrompt, toolSchema, model: 'claude-opus-5', maxTokens: 8192 };
    const a = buildDirectorRequest({ ...base, description: 'coffee logo', canvas: { width: 1920, height: 1080 } });
    const b = buildDirectorRequest({ ...base, description: 'sneaker sale', canvas: { width: 1080, height: 1920 } });
    // cached prefix identical across different descriptions/canvases
    assert.deepStrictEqual(directorCachedPrefix(a), directorCachedPrefix(b), 'cached prefix must not vary');
    // only the user message differs
    assert.notDeepStrictEqual(a.messages, b.messages);
    // system carries the cache breakpoint; the user turn does not
    assert.equal(a.system[a.system.length - 1].cache_control?.type, 'ephemeral');
    assert.ok(!('cache_control' in a.messages[0]));
    // structured output is FORCED
    assert.deepEqual(a.tool_choice, { type: 'tool', name: DIRECTOR_TOOL_NAME });
    // the tool schema is the (huge, stable) cached content
    assert.equal(a.tools[0].input_schema, toolSchema);
    // format hint mirrors the canvas
    assert.ok(b.messages[0].content.includes('portrait'), 'portrait canvas should hint portrait');
    assert.equal(formatForCanvas({ width: 1080, height: 1080 }), 'square');
  });

  const runOpts = (client) => ({
    description: 'logo intro for a specialty coffee roaster', canvas: { width: 1920, height: 1080 },
    caps: TIER_CAPS.pro, client, systemPrompt, toolSchema, now: () => 0,
  });

  await ok('runDirector returns a validated plan on a good first response (1 attempt)', async () => {
    const client = mockClient([{ toolInput: validOutput(), usage: U }]);
    const res = await runDirector(runOpts(client));
    assert.equal(res.attempts, 1);
    assert.equal(res.output.brief.tone, 'elegant');
    assert.equal(res.usage.inputTokens, 1200);
    assert.equal(client.requests.length, 1);
  });

  await ok('runDirector retries once with errors fed back, then succeeds (2 attempts)', async () => {
    const bad = validOutput(); delete bad.panelPlan; // structurally invalid
    const client = mockClient([{ toolInput: bad, usage: U }, { toolInput: validOutput(), usage: U }]);
    const res = await runDirector(runOpts(client));
    assert.equal(res.attempts, 2);
    assert.equal(client.requests.length, 2);
    // the retry request feeds the errors back as a second user turn
    assert.equal(client.requests[1].messages.length, 2);
    assert.ok(client.requests[1].messages[1].content.includes('failed'), 'retry must feed errors back');
    // usage is summed across both attempts
    assert.equal(res.usage.inputTokens, 2400);
  });

  await ok('a semantic violation (off-beat) also triggers the retry', async () => {
    const offbeat = validOutput(); offbeat.brief.durationMs = 3100; offbeat.panelPlan[0].endMs = 3100; // 3100 not a multiple of 375
    const client = mockClient([{ toolInput: offbeat, usage: U }, { toolInput: validOutput(), usage: U }]);
    const res = await runDirector(runOpts(client));
    assert.equal(res.attempts, 2);
    assert.ok(client.requests[1].messages[1].content.includes('beat') || client.requests[1].messages[1].content.includes('duration'));
  });

  await ok('two bad responses fail loudly (no silent bad plan)', async () => {
    const bad = validOutput(); delete bad.styleContract;
    const client = mockClient([{ toolInput: bad, usage: U }]);
    await assert.rejects(runDirector(runOpts(client)), /failed after 2 attempts/);
  });

  ok('cost estimate is finite and scales with tokens', () => {
    const c1 = estimateCostUsd(U);
    const c2 = estimateCostUsd({ ...U, outputTokens: U.outputTokens * 2 });
    assert.ok(c1 > 0 && c2 > c1);
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-director failed:\n', err);
  process.exit(1);
}
