// Anthropic Messages request assembly for the Coder stage, mirroring the Director's cache-block
// ordering: tools → system form the byte-identical cached prefix; only the user turn (this panel's
// job) and the optional retry note vary. Reuses the Director's wire types (same Anthropic format).

import type { AnthropicRequest, AnthropicMessage, AnthropicTool, AnthropicTextBlock } from '../director/request';
import type { Job } from '../../schema';

export const CODER_TOOL_NAME = 'emit_coder_fragment';

export interface BuildCoderRequestOpts {
  systemPrompt: string;
  toolSchema: Record<string, unknown>;
  job: Job;
  model: string;
  maxTokens: number;
  /** Present on the retry attempt: the prior (invalid) output + the validation errors to fix. */
  retry?: { previousOutput: unknown; errors: string[] };
}

/** The per-panel job, rendered as a compact instruction for the user turn (frames). */
function jobBrief(job: Job): string {
  const p = job.panel;
  const focal = p.focalPoint ? `, focal point [${p.focalPoint.join(', ')}]` : '';
  return [
    `Panel id: ${job.panelId}`,
    `Id namespace: every layer id MUST start with "${job.idNamespace}".`,
    `Layer budget: at most ${job.layerBudget} layers.`,
    `Panel frames: start ${p.start}, end ${p.end}${focal}.`,
    `On screen at the in-point (inboundPresent): [${p.inboundPresent.join(', ') || 'none'}].`,
    `On screen at the out-point (outboundPresent): [${p.outboundPresent.join(', ') || 'none'}].`,
    job.neighbors.prevOutbound ? `Handed over from the previous panel (must also appear here): [${job.neighbors.prevOutbound.join(', ')}].` : '',
    job.neighbors.nextInbound ? `The next panel expects these present at your out-point: [${job.neighbors.nextInbound.join(', ')}].` : '',
    `Style contract (bind colors to these palette roles; use these easings/beat/shape language):`,
    JSON.stringify(job.styleContract),
  ].filter(Boolean).join('\n');
}

export function buildCoderRequest(o: BuildCoderRequestOpts): AnthropicRequest {
  const messages: AnthropicMessage[] = [{ role: 'user', content: `Author the layers for this panel.\n\n${jobBrief(o.job)}` }];
  if (o.retry) {
    messages.push({
      role: 'user',
      content:
        `Your previous tool call failed schema/semantic validation:\n` +
        o.retry.errors.map((e) => `- ${e}`).join('\n') +
        `\n\nHere was your previous output:\n${JSON.stringify(o.retry.previousOutput)}\n\n` +
        `Return one corrected CoderFragment tool call that fixes every error. Change nothing else.`,
    });
  }

  return {
    model: o.model,
    max_tokens: o.maxTokens,
    // tools first (the frozen decode schema — the most stable, cacheable content).
    tools: [{
      name: CODER_TOOL_NAME,
      description: "Emit this panel's layers as a CoderFragment (frames).",
      input_schema: o.toolSchema,
    }],
    // system second; the cache_control breakpoint sits here → tools + system are cached, user is not.
    system: [{ type: 'text', text: o.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: CODER_TOOL_NAME }, // FORCE structured output
    messages,
  };
}

/** The stable, cacheable prefix (tools + system). Two jobs differing only in panel data MUST share it. */
export function coderCachedPrefix(req: AnthropicRequest): { tools: AnthropicTool[]; system: AnthropicTextBlock[] } {
  return { tools: req.tools, system: req.system };
}
