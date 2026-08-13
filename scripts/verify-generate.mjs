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

// Returns the Director plan on the director tool, and a valid fragment per Coder call (parsing the
// panel id + namespace out of the request's user turn).
function fakeClient() {
  const requests = [];
  return {
    requests,
    createMessage: async (req) => {
      requests.push(req);
      if (req.tools[0].name === 'emit_director_output') return { toolInput: validDirector(), usage: U };
      const turn = req.messages[0].content;
      const panelId = /Panel id: (\S+)/.exec(turn)?.[1] ?? 'panel-0';
      const ns = /start with "([^"]+)"/.exec(turn)?.[1] ?? 'p0:';
      return { toolInput: { panelId, layers: [{ id: ns + 'title', name: 'title', type: 'text', spans: [{ text: 'Hello' }] }] }, usage: U };
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
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verify-generate failed:\n', err);
  process.exit(1);
}
