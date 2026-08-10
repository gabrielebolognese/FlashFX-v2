// The deterministic compiler: Director output + panel fragments → committed-ready Composition.
// ZERO model calls, zero tokens. Node-safe (NO store/React import here — the browser-only commit
// helper lives in ./commit and is imported separately by the dev hook).

import { makeSchemas, TIER_CAPS, validateDirectorPlan, type DirectorOutput, type CoderFragment, type AiMeta, type DirectorCanvas } from '../schema';
import { compilePlan, type PlanResult } from './compilePlan';
import { assemble, type AssembleResult } from './assemble';

export * from './presetCatalog';
export * from './compilePlan';
export * from './assemble';

export interface CompileOptions {
  fps: number;
  tier?: keyof typeof TIER_CAPS;
  seed: number;
  name?: string;
  /** Preflight canvas. When given, the semantic validator also enforces format-mirrors-canvas. */
  canvas?: DirectorCanvas;
}
export interface CompileResult extends AssembleResult {
  plan: PlanResult;
  /** The regeneration inputs, also attached to `document.aiMeta` at runtime (persistence of that
   *  field on the core document needs the validation-whitelist wiring — a later step). */
  aiMeta: AiMeta;
}

// A tiny, dependency-free deterministic digest (djb2) — NO Date/Math.random (reproducibility).
function digest(input: unknown): string {
  const s = JSON.stringify(input);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * Compile a Director output + its per-panel fragments into a Composition + report. Structural
 * validation (Zod) runs here; SEMANTIC validation and auto-fix are the next session. Never throws on
 * assembly problems — the report carries them. Parse failures ARE surfaced as errors in the report.
 */
export function compile(directorRaw: unknown, fragmentsRaw: unknown[], opts: CompileOptions): CompileResult {
  const caps = TIER_CAPS[opts.tier ?? 'pro'];
  const schemas = makeSchemas(caps);

  const dRes = schemas.directorOutput.safeParse(directorRaw);
  if (!dRes.success) {
    return failed('director parse failed', dRes.error.issues.map((i) => i.message));
  }
  const director = dRes.data as DirectorOutput;

  const fragments: CoderFragment[] = [];
  const parseIssues: string[] = [];
  for (const fr of fragmentsRaw) {
    const r = schemas.coderFragment.safeParse(fr);
    if (r.success) fragments.push(r.data as CoderFragment);
    else parseIssues.push(...r.error.issues.map((i) => `${(fr as { panelId?: string })?.panelId ?? '?'}: ${i.path.join('.')} ${i.message}`));
  }

  const plan = compilePlan(director, { fps: opts.fps, layerBudget: caps.maxLayersPerPanel });
  const result = assemble(fragments, plan.panels, director.styleContract, {
    fps: opts.fps, format: director.brief.format, seed: opts.seed, durationFrames: plan.durationFrames, name: opts.name,
  });

  // Semantic validation of the plan (beat alignment, contiguity, sum-to-duration, element ownership,
  // and — given a canvas — format-mirror). These are the cross-panel rules Zod cannot express.
  for (const s of validateDirectorPlan(director, { canvas: opts.canvas })) {
    result.report.issues.unshift({ severity: s.severity, code: s.code, message: s.message, panelId: s.panelId, layerId: s.elementId });
  }
  // Surface any fragment parse failures into the report (never silently dropped).
  for (const m of parseIssues) result.report.issues.unshift({ severity: 'error', code: 'fragment-parse', message: m });
  result.report.ok = !result.report.issues.some((i) => i.severity === 'error');

  // The regeneration inputs the edit-path needs. Attached to the document at runtime too (its
  // persistence on the core document type is deferred — see CompileResult.aiMeta).
  const aiMeta: AiMeta = {
    brief: director.brief, styleContract: director.styleContract, panelPlan: director.panelPlan,
    seed: opts.seed, digest: digest({ director: directorRaw, fragments: fragmentsRaw }),
    tier: opts.tier ?? 'pro',
  };
  (result.document as unknown as { aiMeta: AiMeta }).aiMeta = aiMeta;

  return { ...result, plan, aiMeta };
}

function failed(message: string, details: string[]): CompileResult {
  const empty = { width: 1920, height: 1080, frameRate: 30, durationFrames: 1, backgroundColor: [0, 0, 0, 1] as [number, number, number, number] };
  const composition = { id: 'ai-comp', name: 'AI Generation (failed)', settings: empty, layers: [], tracks: [], background: { layers: [] }, motionPaths: [] };
  return {
    composition: composition as unknown as CompileResult['composition'],
    styles: {},
    document: { version: 2, rootCompositionId: 'ai-comp', compositions: { 'ai-comp': composition } } as unknown as CompileResult['document'],
    panels: [],
    plan: { beatFrames: 1, durationFrames: 1, panels: [], jobs: [] },
    aiMeta: undefined as unknown as AiMeta,
    report: { ok: false, issues: [{ severity: 'error', code: 'parse', message }, ...details.map((d) => ({ severity: 'error' as const, code: 'parse-detail', message: d }))], stats: { panels: 0, layers: 0, presetsExpanded: 0, clonersBuilt: 0, stylesRegistered: 0, boundaryChecks: 0 } },
  };
}
