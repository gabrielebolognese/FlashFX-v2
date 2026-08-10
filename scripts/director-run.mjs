// Run the Director against the real model and print a plan you can read, plus token usage and cost.
//
//   ANTHROPIC_API_KEY=... node scripts/director-run.mjs "logo intro for a coffee roaster"
//   ANTHROPIC_API_KEY=... node scripts/director-run.mjs --batch
//   ... "your description" --canvas 1080x1920
//
// The key is read ONLY from the ANTHROPIC_API_KEY environment variable. Put it in your shell or a
// gitignored .env you source yourself; this script never writes it, never reads it from a committed
// file, and never prints it.

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
const batch = args.includes('--batch');
let canvasArg = { width: 1920, height: 1080 };
const descParts = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--batch') continue;
  if (a === '--canvas') { const [w, h] = String(args[++i] ?? '').split('x').map(Number); if (w && h) canvasArg = { width: w, height: h }; continue; }
  descParts.push(a);
}
const description = descParts.join(' ').trim();

const tmp = mkdtempSync(join(tmpdir(), 'director-run-'));
async function bundle(entry) {
  const out = join(tmp, entry.replace(/[\\/]/g, '_') + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

const D = await bundle('src/ai/director/index.ts');
const S = await bundle('src/schema/index.ts');
const { renderDirectorMarkers, runDirector, createAnthropicClient, directorToolSchema, estimateCostUsd, DIRECTOR_MODEL, DIRECTOR_TEST_CASES } = D;
const { validateDirectorPlan, TIER_CAPS } = S;

const systemPrompt = renderDirectorMarkers(readFileSync(join(process.cwd(), 'src/ai/prompts/director.md'), 'utf8'));
const toolSchema = directorToolSchema();
const client = createAnthropicClient({ apiKey: KEY });

const money = (n) => `$${n.toFixed(4)}`;
const k = (n) => `${(n / 1000).toFixed(1)}k`;

// The checks the prompt asserts but the schema cannot — run + print (runDirector already enforces
// them, so a returned plan should be clean; we re-check as belt-and-suspenders and to eyeball).
function checkPlan(output, canvas) {
  return validateDirectorPlan(output, { canvas }).filter((i) => i.severity === 'error');
}

function printPlan(output) {
  const b = output.brief, sc = output.styleContract;
  console.log(`  brief:  ${b.durationMs}ms · ${b.format} · ${b.tone} · subjects=${b.subjects.length} [${b.subjects.map((s) => s.name).join(', ')}]`);
  console.log(`  style:  beat=${sc.beatMs}ms · ${sc.shapeLanguage} · easings=[${sc.easings.join(',')}] · stagger=${sc.staggerDoctrine.mode}(${sc.staggerDoctrine.gapMs}ms)`);
  console.log(`  palette: ${sc.palette.map((p) => `${p.role}=${p.color}`).join('  ')}`);
  for (const p of output.panelPlan) {
    const t = p.transitionIn ? ` <${p.transitionIn.type}:${p.transitionIn.duration}>` : '';
    console.log(`  panel ${p.order}: ${p.startMs}-${p.endMs}ms${t}  elems=[${p.elements.map((e) => `${e.id}(${e.kind})`).join(', ')}]`);
    console.log(`           in[${p.inboundPresent.join(', ')}]  out[${p.outboundPresent.join(', ')}]`);
  }
}

async function runOne(name, desc, canvas) {
  const t0 = Date.now();
  try {
    const res = await runDirector({ description: desc, canvas, caps: TIER_CAPS.pro, client, systemPrompt, toolSchema });
    const u = res.usage;
    const violations = checkPlan(res.output, canvas);
    console.log(`\n▶ ${name}  "${desc}"  [${canvas.width}x${canvas.height}]`);
    printPlan(res.output);
    console.log(`  usage:  in=${k(u.inputTokens)} cacheR=${k(u.cacheReadTokens)} cacheW=${k(u.cacheWriteTokens)} out=${k(u.outputTokens)}  ·  ${money(estimateCostUsd(u))} (est)  ·  ${res.latencyMs}ms  ·  ${res.attempts} attempt(s)`);
    if (violations.length) { console.log(`  ⚠ VIOLATIONS:`); for (const v of violations) console.log(`    - ${v.code}: ${v.message}`); }
    else console.log(`  ✓ all prompt-asserted rules hold (beat, coverage, boundaries, ownership, ids)`);
    return { name, ok: violations.length === 0, usage: u, panels: res.output.panelPlan.length, attempts: res.attempts };
  } catch (e) {
    console.log(`\n▶ ${name}  "${desc}"  — FAILED: ${e.message}`);
    return { name, ok: false, error: e.message };
  } finally { void t0; }
}

console.log(`Director · model ${DIRECTOR_MODEL}\n`);
if (batch) {
  const results = [];
  for (const tc of DIRECTOR_TEST_CASES) results.push(await runOne(tc.name, tc.description, tc.canvas));
  console.log('\n── batch summary ──');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(18)} ${r.error ? r.error : `${r.panels} panels · ${r.attempts} attempt(s) · ${money(estimateCostUsd(r.usage))}`}`);
  const totalOut = results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
  console.log(`  total est cost: ${money(results.reduce((s, r) => s + (r.usage ? estimateCostUsd(r.usage) : 0), 0))}  ·  ${results.filter((r) => r.ok).length}/${results.length} clean  ·  ${k(totalOut)} output tokens`);
} else if (description) {
  await runOne('run', description, canvasArg);
} else {
  console.error('Usage: node scripts/director-run.mjs "<description>" [--canvas 1920x1080]   |   --batch');
  process.exit(1);
}
