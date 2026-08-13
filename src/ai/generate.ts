// The pipeline ORCHESTRATOR: description + canvas → a committed-ready Composition, by running the
// Director, expanding the plan into per-panel jobs, running the Coder on each, and assembling. This
// is the single entry point the app, the node runner, and tests share. The network is entirely
// behind `client` (the same Anthropic wire client both stages use), so this is deterministic given a
// client and fully testable with a fake one — no key needed to prove the glue.

import { TIER_CAPS } from '../schema';
import { runDirector } from './director';
import { runCoder } from './coder';
import { compilePlan } from './compilePlan';
import { compile, type CompileResult } from './index';
import { type DirectorClient, type Usage, ZERO_USAGE, addUsage } from './director/client';
import type { Canvas } from './director/request';
import type { CoderFragment } from '../schema';

export interface GenerateOpts {
  description: string;
  canvas: Canvas;
  fps: number;
  seed: number;
  client: DirectorClient;
  /** Rendered, cache-stable system prompts (built once by the caller: renderDirectorMarkers/renderCoderMarkers). */
  directorSystemPrompt: string;
  coderSystemPrompt: string;
  /** Frozen decode schemas for the forced tools (directorToolSchema()/coderToolSchema()). */
  directorToolSchema: Record<string, unknown>;
  coderToolSchema: Record<string, unknown>;
  tier?: keyof typeof TIER_CAPS;
  now?: () => number;
  /** Auto-fix rounds after assembly if compile() reports panel-attributable errors (default 2). */
  maxRepairs?: number;
}

export interface GenerateResult extends CompileResult {
  usage: { director: Usage; coder: Usage; total: Usage };
  attempts: { director: number; coder: number[] };
  /** How many auto-fix rounds ran (0 = clean first pass). */
  repairs: number;
}

/** Run the full pipeline. Director/Coder each self-retry on their OWN validation and throw loudly
 *  after two attempts. Cross-stage problems only assembly sees (dangling parents, overlapping
 *  presets, seam mismatches) are fed back to the offending panel's Coder for a bounded number of
 *  repair rounds; any that survive are left in `result.report` (non-throwing). */
export async function generate(o: GenerateOpts): Promise<GenerateResult> {
  const tier = o.tier ?? 'pro';
  const caps = TIER_CAPS[tier];
  const maxRepairs = o.maxRepairs ?? 2;

  // 1) Director -> the ms plan (brief + style contract + panels).
  const d = await runDirector({
    description: o.description, canvas: o.canvas, caps, client: o.client,
    systemPrompt: o.directorSystemPrompt, toolSchema: o.directorToolSchema, now: o.now,
  });

  // 2) Deterministic ms->frame expansion -> one self-contained job per panel.
  const plan = compilePlan(d.output, { fps: o.fps, layerBudget: caps.maxLayersPerPanel });
  const jobByPanel = new Map(plan.jobs.map((j) => [j.panelId, j]));

  const fragmentByPanel = new Map<string, CoderFragment>();
  let coderUsage = ZERO_USAGE;
  const coderAttempts = new Map<string, number>();

  const runPanel = async (panelId: string, feedback?: { previousOutput: unknown; errors: string[] }) => {
    const job = jobByPanel.get(panelId);
    if (!job) return;
    const c = await runCoder({
      job, caps, client: o.client,
      systemPrompt: o.coderSystemPrompt, toolSchema: o.coderToolSchema, now: o.now, feedback,
    });
    fragmentByPanel.set(panelId, c.fragment);
    coderUsage = addUsage(coderUsage, c.usage);
    coderAttempts.set(panelId, (coderAttempts.get(panelId) ?? 0) + c.attempts);
  };

  const orderedFragments = (): CoderFragment[] =>
    plan.jobs.map((j) => fragmentByPanel.get(j.panelId)).filter(Boolean) as CoderFragment[];
  const doCompile = (): CompileResult => compile(d.output, orderedFragments(), {
    fps: o.fps, tier, seed: o.seed, canvas: { width: o.canvas.width, height: o.canvas.height },
  });

  // 3) Coder per panel (sequential — a single client, one job in flight at a time).
  for (const job of plan.jobs) await runPanel(job.panelId);

  // 4) Assemble; then auto-fix: re-run any panel whose layers/plan produced an error, feeding the
  //    errors back, until the report is clean or we run out of repair rounds.
  let result = doCompile();
  let repairs = 0;
  while (!result.report.ok && repairs < maxRepairs) {
    // Attribute each error to a panel — directly (panelId) or via the offending layer's fragment.
    const panelOfLayer = new Map<string, string>();
    for (const [pid, frag] of fragmentByPanel) for (const l of frag.layers) panelOfLayer.set(l.id, pid);

    const errorsByPanel = new Map<string, string[]>();
    for (const issue of result.report.issues) {
      if (issue.severity !== 'error') continue;
      const pid = issue.panelId ?? (issue.layerId ? panelOfLayer.get(issue.layerId) : undefined);
      if (!pid || !jobByPanel.has(pid)) continue;
      const arr = errorsByPanel.get(pid) ?? [];
      arr.push(`${issue.code}: ${issue.message}`);
      errorsByPanel.set(pid, arr);
    }
    if (errorsByPanel.size === 0) break; // no panel-attributable errors -> nothing to auto-fix

    for (const [pid, errs] of errorsByPanel) {
      await runPanel(pid, { previousOutput: fragmentByPanel.get(pid), errors: errs });
    }
    repairs++;
    result = doCompile();
  }

  return {
    ...result,
    usage: { director: d.usage, coder: coderUsage, total: addUsage(d.usage, coderUsage) },
    attempts: { director: d.attempts, coder: plan.jobs.map((j) => coderAttempts.get(j.panelId) ?? 0) },
    repairs,
  };
}
