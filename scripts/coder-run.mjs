// Run the full Director → compilePlan → Coder pipeline against the real model, end to end, and print
// each panel's fragment (layers + attached presets) plus total token usage/cost.
//
//   ANTHROPIC_API_KEY=... node scripts/coder-run.mjs "logo intro for a coffee roaster"
//   ANTHROPIC_API_KEY=... node scripts/coder-run.mjs "sneaker sale" --canvas 1080x1920 --fps 30
//
// The key is read ONLY from the ANTHROPIC_API_KEY environment variable. Put it in your shell or a
// gitignored .env you source yourself; this script never writes it, never reads a committed file,
// and never prints it.

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('ANTHROPIC_API_KEY is not set.\n' +
    'Set it in your shell:  export ANTHROPIC_API_KEY=sk-ant-...\n' +
    'or source a gitignored .env you manage yourself. This script never stores it.');
  process.exit(1);
}

const args = process.argv.slice(2);
let canvas = { width: 1920, height: 1080 };
let fps = 30;
const descParts = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--canvas') { const [w, h] = String(args[++i] ?? '').split('x').map(Number); if (w && h) canvas = { width: w, height: h }; continue; }
  if (a === '--fps') { const f = Number(args[++i]); if (f) fps = f; continue; }
  descParts.push(a);
}
const description = descParts.join(' ').trim() || 'logo intro for a specialty coffee roaster';

const tmp = mkdtempSync(join(tmpdir(), 'coder-run-'));
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

const D = await bundle('src/ai/director/index.ts');
const Co = await bundle('src/ai/coder/index.ts');
const P = await bundle('src/ai/compilePlan.ts');
const S = await bundle('src/schema/index.ts');
const { renderDirectorMarkers, runDirector, createAnthropicClient, directorToolSchema, estimateCostUsd } = D;
const { renderCoderMarkers, runCoder, coderToolSchema } = Co;
const { compilePlan } = P;
const { TIER_CAPS } = S;

const caps = TIER_CAPS.pro;
const client = createAnthropicClient({ apiKey: KEY });
const k = (n) => `${(n / 1000).toFixed(1)}k`;
const money = (n) => `$${n.toFixed(4)}`;
const addU = (a, b) => ({
  inputTokens: a.inputTokens + b.inputTokens, cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens, outputTokens: a.outputTokens + b.outputTokens,
});
let total = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };

console.log(`Director → Coder   "${description}"   [${canvas.width}x${canvas.height} @ ${fps}fps]\n`);

// 1) Director
const dSys = renderDirectorMarkers(readFileSync(join(process.cwd(), 'src/ai/prompts/director.md'), 'utf8'));
const dRes = await runDirector({ description, canvas, caps, client, systemPrompt: dSys, toolSchema: directorToolSchema() });
total = addU(total, dRes.usage);
console.log(`Director: ${dRes.output.panelPlan.length} panels · ${dRes.output.brief.durationMs}ms · tone ${dRes.output.brief.tone} · ${dRes.attempts} attempt(s)`);

// 2) Deterministic plan → per-panel jobs
const plan = compilePlan(dRes.output, { fps, layerBudget: caps.maxLayersPerPanel });
console.log(`Plan: ${plan.durationFrames} frames · beat ${plan.beatFrames}f · ${plan.jobs.length} jobs\n`);

// 3) Coder per panel
const cSys = renderCoderMarkers(readFileSync(join(process.cwd(), 'src/ai/prompts/coder.md'), 'utf8'));
const cTool = coderToolSchema();
for (const job of plan.jobs) {
  try {
    const r = await runCoder({ job, caps, client, systemPrompt: cSys, toolSchema: cTool });
    total = addU(total, r.usage);
    console.log(`▶ ${job.panelId} (ns ${job.idNamespace})  ${r.fragment.layers.length} layers · ${r.attempts} attempt(s)`);
    for (const l of r.fragment.layers) {
      const presets = (l.presets ?? []).map((p) => p.preset ?? p.name ?? JSON.stringify(p)).join(',');
      console.log(`    ${l.id}  ${l.type}  "${l.name}"${presets ? `  presets=[${presets}]` : ''}`);
    }
  } catch (e) {
    console.log(`▶ ${job.panelId}  — FAILED: ${e.message}`);
  }
}

console.log(`\nTotal usage: in=${k(total.inputTokens)} cacheR=${k(total.cacheReadTokens)} cacheW=${k(total.cacheWriteTokens)} out=${k(total.outputTokens)}  ·  ${money(estimateCostUsd(total))} (est)`);
