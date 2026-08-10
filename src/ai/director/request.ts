// Anthropic Messages request assembly with EXPLICIT cache-block ordering. The cached prefix is
// tools → system, both byte-identical on every call; only the user turn (description + canvas) and
// the optional retry note vary. The cache breakpoint is a `cache_control` on the LAST system block,
// so everything before and including it — the huge tool JSON schema and the system prompt — is cached,
// and the user turn falls after the boundary. Getting this wrong is silent and expensive, so
// buildDirectorRequest is unit-tested (see scripts/verify-director.mjs).

export interface Canvas { width: number; height: number }

export type OutputFormat = 'landscape' | 'portrait' | 'square';
export function formatForCanvas(c: Canvas): OutputFormat {
  if (c.width > c.height) return 'landscape';
  if (c.height > c.width) return 'portrait';
  return 'square';
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
}
export interface AnthropicTextBlock { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
export interface AnthropicMessage { role: 'user' | 'assistant'; content: string }
export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system: AnthropicTextBlock[];
  tools: AnthropicTool[];
  tool_choice: { type: 'tool'; name: string };
  messages: AnthropicMessage[];
}

export const DIRECTOR_TOOL_NAME = 'emit_director_output';

export interface BuildRequestOpts {
  systemPrompt: string;
  toolSchema: Record<string, unknown>;
  description: string;
  canvas: Canvas;
  model: string;
  maxTokens: number;
  /** Present on the retry attempt: the prior (invalid) output + the validation errors to fix. */
  retry?: { previousOutput: unknown; errors: string[] };
}

export function buildDirectorRequest(o: BuildRequestOpts): AnthropicRequest {
  const fmt = formatForCanvas(o.canvas);
  const userTurn = `Description: ${o.description}\nCanvas: ${o.canvas.width}x${o.canvas.height} (${fmt}). Set brief.format to "${fmt}".`;

  const messages: AnthropicMessage[] = [{ role: 'user', content: userTurn }];
  if (o.retry) {
    // Feed the errors back as a second user turn (kept OUT of the cached prefix by construction).
    messages.push({
      role: 'user',
      content:
        `Your previous tool call failed schema/semantic validation:\n` +
        o.retry.errors.map((e) => `- ${e}`).join('\n') +
        `\n\nHere was your previous output:\n${JSON.stringify(o.retry.previousOutput)}\n\n` +
        `Return one corrected DirectorOutput tool call that fixes every error. Change nothing else.`,
    });
  }

  return {
    model: o.model,
    max_tokens: o.maxTokens,
    // tools first in the canonical cache order (most stable — the frozen decode schema).
    tools: [{
      name: DIRECTOR_TOOL_NAME,
      description: 'Emit the complete DirectorOutput plan (brief + style contract + panel plan). Milliseconds.',
      input_schema: o.toolSchema,
    }],
    // system second; the cache_control breakpoint sits here → tools + system are cached, user is not.
    system: [{ type: 'text', text: o.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: DIRECTOR_TOOL_NAME }, // FORCE structured output
    messages,
  };
}

/** The stable, cacheable prefix of a request (tools + system) — everything up to the cache boundary.
 *  Two requests that differ only in description/canvas MUST have an identical prefix. */
export function directorCachedPrefix(req: AnthropicRequest): { tools: AnthropicTool[]; system: AnthropicTextBlock[] } {
  return { tools: req.tools, system: req.system };
}
