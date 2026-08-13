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
}

export interface GenerateResult extends CompileResult {
  usage: { director: Usage; coder: Usage; total: Usage };
  attempts: { director: number; coder: number[] };
}

/** Run the full pipeline. Director/Coder each self-retry on their own validation and throw loudly
 *  after two attempts; assembly problems surface non-throwing in `result.report`. */
export async function generate(o: GenerateOpts): Promise<GenerateResult> {
  const tier = o.tier ?? 'pro';
  const caps = TIER_CAPS[tier];

  // 1) Director → the ms plan (brief + style contract + panels).
  const d = await runDirector({
    description: o.description, canvas: o.canvas, caps, client: o.client,
    systemPrompt: o.directorSystemPrompt, toolSchema: o.directorToolSchema, now: o.now,
  });

  // 2) Deterministic ms→frame expansion → one self-contained job per panel.
  const plan = compilePlan(d.output, { fps: o.fps, layerBudget: caps.maxLayersPerPanel });

  // 3) Coder per panel (sequential — a single client, one job in flight at a time).
  const fragments: CoderFragment[] = [];
  let coderUsage = ZERO_USAGE;
  const coderAttempts: number[] = [];
  for (const job of plan.jobs) {
    const c = await runCoder({
      job, caps, client: o.client,
      systemPrompt: o.coderSystemPrompt, toolSchema: o.coderToolSchema, now: o.now,
    });
    fragments.push(c.fragment);
    coderUsage = addUsage(coderUsage, c.usage);
    coderAttempts.push(c.attempts);
  }

  // 4) Deterministic assemble + semantic validation → Composition + report (never throws here).
  const result = compile(d.output, fragments, {
    fps: o.fps, tier, seed: o.seed, canvas: { width: o.canvas.width, height: o.canvas.height },
  });

  return {
    ...result,
    usage: { director: d.usage, coder: coderUsage, total: addUsage(d.usage, coderUsage) },
    attempts: { director: d.attempts, coder: coderAttempts },
  };
}
