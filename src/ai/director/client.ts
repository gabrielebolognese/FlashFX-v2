import type { AnthropicRequest } from './request';

// The network call lives behind this small interface. The Worker session will supply a different
// implementation (a fetch to the app's own endpoint); swapping it is one line, not a refactor.
// Everything else in the Director stage is testable without a network by passing a fake client.

export interface Usage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}
export const ZERO_USAGE: Usage = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export interface ClientResponse {
  /** The forced tool call's `input` — the raw DirectorOutput candidate (unvalidated). */
  toolInput: unknown;
  usage: Usage;
}

export interface DirectorClient {
  createMessage(req: AnthropicRequest): Promise<ClientResponse>;
}

// ── Pricing (ESTIMATE — verify against current Anthropic pricing before trusting the dollar figure).
// Per 1M tokens. Cache write ≈ 1.25× input, cache read ≈ 0.1× input (Anthropic's published multipliers).
export interface Pricing { inputPerM: number; outputPerM: number; cacheWritePerM: number; cacheReadPerM: number }
export const OPUS5_PRICING_ESTIMATE: Pricing = { inputPerM: 15, outputPerM: 75, cacheWritePerM: 18.75, cacheReadPerM: 1.5 };

export function estimateCostUsd(u: Usage, p: Pricing = OPUS5_PRICING_ESTIMATE): number {
  return (
    (u.inputTokens * p.inputPerM +
      u.outputTokens * p.outputPerM +
      u.cacheWriteTokens * p.cacheWritePerM +
      u.cacheReadTokens * p.cacheReadPerM) /
    1_000_000
  );
}

// ── Real Anthropic implementation ──
export interface AnthropicClientOptions {
  apiKey: string;
  /** Injected for tests; defaults to global fetch (Node 18+/browser). */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  anthropicVersion?: string;
  /** Direct browser→Anthropic calls (BYOK) require this opt-in header; the API rejects them
   *  otherwise. Leave off for Node and for a same-origin proxy (which injects the key server-side). */
  dangerousDirectBrowserAccess?: boolean;
}

export function createAnthropicClient(opts: AnthropicClientOptions): DirectorClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? 'https://api.anthropic.com';
  const version = opts.anthropicVersion ?? '2023-06-01';
  return {
    async createMessage(req: AnthropicRequest): Promise<ClientResponse> {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': version,
        // Prompt caching is GA, but sending the beta header is harmless and explicit.
        'anthropic-beta': 'prompt-caching-2024-07-31',
      };
      if (opts.dangerousDirectBrowserAccess) headers['anthropic-dangerous-direct-browser-access'] = 'true';
      const res = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[director] Anthropic API ${res.status}: ${body.slice(0, 500)}`);
      }
      const json = (await res.json()) as {
        content?: Array<{ type: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
        stop_reason?: string;
      };
      // Match the block for the tool this request FORCED (Director and Coder force different tools
      // through the same client), falling back to the first tool_use block. A prior version pinned
      // the Director's tool name here, so the same client silently failed the Coder stage.
      const wanted = req.tool_choice?.name;
      const blocks = json.content ?? [];
      const toolBlock =
        blocks.find((b) => b.type === 'tool_use' && (!wanted || b.name === wanted)) ??
        blocks.find((b) => b.type === 'tool_use');
      if (!toolBlock) {
        throw new Error(`[ai] model did not return a tool call (stop_reason=${json.stop_reason}); a truncated or prose reply is unrecoverable`);
      }
      const u = json.usage ?? {};
      return {
        toolInput: toolBlock.input,
        usage: {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
