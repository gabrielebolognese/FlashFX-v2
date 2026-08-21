import directorTemplate from './prompts/director.md?raw';
import coderTemplate from './prompts/coder.md?raw';
import { renderDirectorMarkers, directorToolSchema } from './director';
import { renderCoderMarkers, coderToolSchema } from './coder';
import { generate, type GenerateResult } from './generate';
import { commitAiComposition } from './commit';
import { estimateCostUsd, type DirectorClient } from './director/client';

// Browser entry point for the AI pipeline. This is the DYNAMIC-IMPORT boundary — the panel imports
// it lazily (await import) so the engine + zod + prompt templates stay OUT of the initial bundle
// until the user actually generates. The system prompts + tool schemas are byte-stable, so they're
// built once at module load (cache-friendly and cheap). Splitting generate() from commit() lets the
// caller drop a result if the user hit Stop mid-flight — nothing lands on the canvas unless committed.

const directorSystemPrompt = renderDirectorMarkers(directorTemplate);
const coderSystemPrompt = renderCoderMarkers(coderTemplate);
const directorSchema = directorToolSchema();
const coderSchema = coderToolSchema();

export interface GenerateSceneOpts {
  description: string;
  client: DirectorClient;
  canvas: { width: number; height: number };
  fps: number;
  seed: number;
}

export interface GenerateSceneSummary {
  layers: number;
  panels: number;
  clonersBuilt: number;
  repairs: number;
  errors: number;
  costUsd: number;
}

/** Run Director → Coder → assemble → auto-fix. Does NOT touch the editor — the caller commits. */
export async function generateScene(o: GenerateSceneOpts): Promise<GenerateResult> {
  return generate({
    description: o.description,
    canvas: o.canvas,
    fps: o.fps,
    seed: o.seed,
    client: o.client,
    directorSystemPrompt,
    coderSystemPrompt,
    directorToolSchema: directorSchema,
    coderToolSchema: coderSchema,
  });
}

/** Commit a generated scene as ONE undo step and return a short summary for the chat. */
export function commitScene(result: GenerateResult): GenerateSceneSummary {
  commitAiComposition(result.composition, result.styles, result.aiMeta as unknown as Record<string, unknown>);
  const s = result.report.stats;
  return {
    layers: s.layers,
    panels: s.panels,
    clonersBuilt: s.clonersBuilt,
    repairs: result.repairs,
    errors: result.report.issues.filter((i) => i.severity === 'error').length,
    costUsd: estimateCostUsd(result.usage.total),
  };
}
