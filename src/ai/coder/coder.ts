import { makeSchemas, type Caps, type Job, type CoderFragment } from '../../schema';
import { buildCoderRequest } from './request';
import { type DirectorClient, type Usage, ZERO_USAGE, addUsage } from '../director/client';

// The Coder stage: one panel Job → a validated CoderFragment (this panel's layers), with usage.
// Mirrors runDirector: the network call is behind `client` (the SAME Anthropic wire client), output
// is FORCED (tool_choice), and on a validation failure (structural OR Coder-semantic) we retry ONCE
// with the errors fed back, then fail loudly — two attempts, never a silent bad fragment.

export const CODER_MODEL = 'claude-opus-5';
export const CODER_MAX_TOKENS = 8192; // a panel's worth of layers with headroom (a truncated tool call is unrecoverable)

export interface CoderResult {
  fragment: CoderFragment;
  usage: Usage;
  latencyMs: number;
  attempts: number;
}

export interface RunCoderOpts {
  job: Job;
  caps: Caps;
  client: DirectorClient; // same Anthropic wire client as the Director
  /** Rendered, marker-filled system prompt (cache-stable). Built once by the caller and reused. */
  systemPrompt: string;
  /** The CoderFragment JSON schema (frozen DECODE_CAPS) for the forced tool. */
  toolSchema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  /** Injected clock for deterministic tests; defaults to Date.now. */
  now?: () => number;
  /** Errors + prior output from a repair round (assembly problems only compile() sees), fed into
   *  the FIRST request so the Coder corrects them. See the pipeline auto-fix loop (generate.ts). */
  feedback?: { previousOutput: unknown; errors: string[] };
}

/**
 * Coder-local semantic checks — the cross-fragment rules Zod can't express that assembly would
 * otherwise reject: panel identity, id-namespace ownership, budget, unique ids, and that every
 * element the panel declares on-screen at a boundary is realized as a layer here.
 */
export function validateCoderFragment(fragment: CoderFragment, job: Job): string[] {
  const errors: string[] = [];
  if (fragment.panelId !== job.panelId) {
    errors.push(`panelId '${fragment.panelId}' must equal the job's panelId '${job.panelId}'`);
  }
  if (fragment.layers.length > job.layerBudget) {
    errors.push(`too many layers: ${fragment.layers.length} > budget ${job.layerBudget}`);
  }
  const ids = new Set<string>();
  for (const l of fragment.layers) {
    if (!l.id.startsWith(job.idNamespace)) {
      errors.push(`layer id '${l.id}' must start with the id namespace '${job.idNamespace}'`);
    }
    if (ids.has(l.id)) errors.push(`duplicate layer id '${l.id}'`);
    ids.add(l.id);
  }
  const required = new Set<string>([...job.panel.inboundPresent, ...job.panel.outboundPresent]);
  for (const id of required) {
    if (!ids.has(id)) {
      errors.push(`element '${id}' is on screen at a panel edge (present-list) but has no layer in this fragment`);
    }
  }
  return errors;
}

export async function runCoder(o: RunCoderOpts): Promise<CoderResult> {
  const schema = makeSchemas(o.caps).coderFragment;
  const model = o.model ?? CODER_MODEL;
  const maxTokens = o.maxTokens ?? CODER_MAX_TOKENS;
  const now = o.now ?? Date.now;
  const t0 = now();

  let usage = ZERO_USAGE;
  let retry: { previousOutput: unknown; errors: string[] } | undefined = o.feedback;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const req = buildCoderRequest({
      systemPrompt: o.systemPrompt, toolSchema: o.toolSchema, job: o.job, model, maxTokens, retry,
    });
    const res = await o.client.createMessage(req);
    usage = addUsage(usage, res.usage);

    const parsed = schema.safeParse(res.toolInput);
    if (!parsed.success) {
      retry = { previousOutput: res.toolInput, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
      continue;
    }
    const fragment = parsed.data as CoderFragment;
    const semErrors = validateCoderFragment(fragment, o.job);
    if (semErrors.length === 0) {
      return { fragment, usage, latencyMs: now() - t0, attempts: attempt };
    }
    retry = { previousOutput: res.toolInput, errors: semErrors };
  }

  throw new Error(`[coder] failed after 2 attempts. Last errors:\n${(retry?.errors ?? []).map((e) => `  - ${e}`).join('\n')}`);
}
