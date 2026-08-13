// Pipeline orchestrator — acceptance for the full glue WITHOUT a network: generate() runs Director →
// compilePlan → Coder(per panel) → compile, driven by a fake client that returns a valid Director
// plan and a valid fragment per panel (parsed from the request). Proves the stages tie together into
// a committed-ready composition. The real-model run is scripts/coder-run.mjs. Run:
//   node scripts/verify-generate.mjs   (or: npm run verify:generate)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'generate-verify-'));
let passed = 0;
const ok = (n, fn) => { const r = fn(); return r instanceof Promise ? r.then(() => { passed++; console.log(`  ✓ ${n}`); }) : (passed++, console.log(`  ✓ ${n}`)); };
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

const validDirector = () => ({
  brief: { durationMs: 3000, format: 'landscape', tone: 'elegant', subjects: [
    { id: 's-a', name: 'wordmark' }, { id: 's-b', name: 'mark' }, { id: 's-c', name: 'tagline' }] },
  styleContract: {
    palette: [{ role: 'background', color: '#111111' }, { role: 'primary', color: '#c98a45' }, { role: 'textPrimary', color: '#eeeeee' }, { role: 'textSecondary', color: '#999999' }],
    easings: ['easeOut', 'easeInOut', 'easeIn', 'linear'], beatMs: 375, shapeLanguage: 'geometric', staggerDoctrine: { mode: 'none', gapMs: 0 } },
  panelPlan: [{ id: 'panel-0', order: 0, startMs: 0, endMs: 3000, focalPoint: [960, 540], elements: [], inboundPresent: [], outboundPresent: [] }],
});
const U = { inputTokens: 1000, cacheReadTokens: 800, cacheWriteTokens: 0, outputTokens: 300 };

function parseJob(req) {
  const turn = req.messages[0].content;
  return {
    panelId: /Panel id: (\S+)/.exec(turn)?.[1] ?? 'panel-0',
    ns: /start with "([^"]+)"/.exec(turn)?.[1] ?? 'p0:',
    isRepair: req.messages.length > 1, // a feedback note was seeded into the first request
  };
}

// Returns the Director plan on the director tool, and a valid fragment per Coder call (parsing the
// panel id + namespace out of the request's user turn).
function fakeClient() {
  const requests = [];
  return {
    requests,
    createMessage: async (req) => {
      requests.push(req);
      if (req.tools[0].name === 'emit_director_output') return { toolInput: validDirector(), usage: U };
      const { panelId, ns } = parseJob(req);
      return { toolInput: { panelId, layers: [{ id: ns + 'title', name: 'title', type: 'text', spans: [{ text: 'Hello' }] }] }, usage: U };
    },
  };
}

// First Coder response has a dangling parentId — it PASSES runCoder's own validation but FAILS
// assembly (compile-only error). On the repair round (feedback seeded), it returns a clean fragment.
function autoFixClient() {
  const requests = [];
  return {
    requests,
    createMessage: async (req) => {
      requests.push(req);
      if (req.tools[0].name === 'emit_director_output') return { toolInput: validDirector(), usage: U };
      const { panelId, ns, isRepair } = parseJob(req);
      const layer = isRepair
        ? { id: ns + 'title', name: 'title', type: 'text', spans: [{ text: 'Hello' }] }
        : { id: ns + 'title', name: 'title', type: 'text', spans: [{ text: 'Hello' }], parentId: ns + 'ghost' };
      return { toolInput: { panelId, layers: [layer] }, usage: U };
    },
  };
}

try {
  const G = await bundle('src/ai/generate.ts');
  const D = await bundle('src/ai/director/index.ts');
  const Co = await bundle('src/ai/coder/index.ts');
  const { generate } = G;
  const { renderDirectorMarkers, directorToolSchema } = D;
  const { renderCoderMarkers, coderToolSchema } = Co;

  console.log('Pipeline orchestrator — acceptance\n');

  const directorSystemPrompt = renderDirectorMarkers(readFileSync(join(process.cwd(), 'src/ai/prompts/director.md'), 'utf8'));
  const coderSystemPrompt = renderCoderMarkers(readFileSync(join(process.cwd(), 'src/ai/prompts/coder.md'), 'utf8'));
  const opts = (client) => ({
    description: 'logo intro for a coffee roaster', canvas: { width: 1920, height: 1080 }, fps: 30, seed: 1, client,
    directorSystemPrompt, coderSystemPrompt, directorToolSchema: directorToolSchema(), coderToolSchema: coderToolSchema(), now: () => 0,
  });

  await ok('generate() runs Director → Coder → compile into a committed-ready composition', async () => {
    const client = fakeClient();
    const res = await generate(opts(client));
    // one Director call, then one Coder call (single-panel plan)
    assert.equal(client.requests.length, 2);
    assert.equal(client.requests[0].tools[0].name, 'emit_director_output');
    assert.equal(client.requests[1].tools[0].name, 'emit_coder_fragment');
    // a real composition came out, with no error-severity report issues
    assert.ok(res.composition.layers.length >= 1, `expected layers, got ${res.composition.layers.length}`);
    const errors = res.report.issues.filter((i) => i.severity === 'error');
    assert.deepEqual(errors, [], `unexpected report errors: ${JSON.stringify(errors)}`);
    assert.equal(res.report.ok, true);
    // usage summed across both stages; attempts recorded; aiMeta carried for later regenerate
    assert.equal(res.usage.total.inputTokens, 2000);
    assert.equal(res.attempts.director, 1);
    assert.deepEqual(res.attempts.coder, [1]);
    assert.ok(res.aiMeta && res.aiMeta.seed === 1, 'aiMeta.seed should be carried through');
    assert.equal(res.repairs, 0, 'a clean run needs no repairs');
  });

  await ok('generate() auto-fixes a compile-only error (dangling parent) by re-running the panel', async () => {
    const client = autoFixClient();
    const res = await generate(opts(client));
    // director + coder(broken) + coder(repair) = 3 calls
    assert.equal(client.requests.length, 3, `expected 3 calls, got ${client.requests.length}`);
    assert.ok(client.requests[2].messages.length === 2, 'the repair call must feed the errors back');
    assert.equal(res.repairs, 1, 'exactly one repair round');
    assert.equal(res.report.ok, true, `report should be clean after repair: ${JSON.stringify(res.report.issues)}`);
    assert.ok(res.composition.layers.length >= 1);
  });

  await ok('generate() gives up after maxRepairs and returns the report (never loops forever)', async () => {
    // A client that never fixes the dangling parent.
    const stubborn = () => ({ createMessage: async (req) => {
      if (req.tools[0].name === 'emit_director_output') return { toolInput: validDirector(), usage: U };
      const { panelId, ns } = parseJob(req);
      return { toolInput: { panelId, layers: [{ id: ns + 'title', name: 'title', type: 'text', spans: [{ text: 'x' }], parentId: ns + 'ghost' }] }, usage: U };
    } });
    const res = await generate({ ...opts(stubborn()), maxRepairs: 2 });
    assert.equal(res.repairs, 2, 'stopped at maxRepairs');
    assert.equal(res.report.ok, false, 'unfixable error remains in the report');
    assert.ok(res.report.issues.some((i) => i.code === 'dangling-parent'));
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-generate failed:\n', err);
  process.exit(1);
}
