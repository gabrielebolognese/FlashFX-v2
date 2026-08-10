import { makeSchemas, validateDirectorPlan, type Caps, type DirectorOutput } from '../../schema';
import { buildDirectorRequest, type Canvas } from './request';
import { type DirectorClient, type Usage, ZERO_USAGE, addUsage } from './client';

// The Director stage: description + canvas + caps → a validated DirectorOutput, with usage. The
// network call is behind `client`; everything here is deterministic given a client. Structured
// output is FORCED (tool_choice), not requested. On a validation failure (structural OR semantic) we
// retry ONCE with the errors fed back, then fail loudly — two attempts, never a silent bad plan.

export const DIRECTOR_MODEL = 'claude-opus-5';
export const DIRECTOR_MAX_TOKENS = 8192; // fits a full multi-panel plan with headroom (a truncated tool call is unrecoverable)

export interface DirectorResult {
  output: DirectorOutput;
  usage: Usage;
  latencyMs: number;
  attempts: number;
}

export interface RunDirectorOpts {
  description: string;
  canvas: Canvas;
  caps: Caps;
  client: DirectorClient;
  /** Rendered, marker-filled system prompt (cache-stable). Built once by the caller and reused. */
  systemPrompt: string;
  /** The DirectorOutput JSON schema (frozen DECODE_CAPS) for the forced tool. */
  toolSchema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
  /** Injected clock for deterministic tests; defaults to Date.now. */
  now?: () => number;
}

export async function runDirector(o: RunDirectorOpts): Promise<DirectorResult> {
  const schema = makeSchemas(o.caps).directorOutput;
  const model = o.model ?? DIRECTOR_MODEL;
  const maxTokens = o.maxTokens ?? DIRECTOR_MAX_TOKENS;
  const now = o.now ?? Date.now;
  const t0 = now();

  let usage = ZERO_USAGE;
  let retry: { previousOutput: unknown; errors: string[] } | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const req = buildDirectorRequest({
      systemPrompt: o.systemPrompt, toolSchema: o.toolSchema,
      description: o.description, canvas: o.canvas, model, maxTokens, retry,
    });
    const res = await o.client.createMessage(req);
    usage = addUsage(usage, res.usage);

    const parsed = schema.safeParse(res.toolInput);
    if (!parsed.success) {
      retry = { previousOutput: res.toolInput, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
      continue;
    }
    // Structural OK — also enforce the semantic rules Zod cannot (they would fail generation later).
    const semErrors = validateDirectorPlan(parsed.data, { canvas: o.canvas }).filter((i) => i.severity === 'error');
    if (semErrors.length === 0) {
      return { output: parsed.data, usage, latencyMs: now() - t0, attempts: attempt };
    }
    retry = { previousOutput: res.toolInput, errors: semErrors.map((e) => `${e.code}: ${e.message}`) };
  }

  throw new Error(`[director] failed after 2 attempts. Last errors:\n${(retry?.errors ?? []).map((e) => `  - ${e}`).join('\n')}`);
}
