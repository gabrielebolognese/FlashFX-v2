import type { Plan } from './plans';

// Token-based AI metering. AI generation is a Pro-only, MANAGED feature: the Anthropic key lives in
// the ai-proxy edge function (server-side), and every generation's real token usage is metered against
// a per-account MONTHLY token budget. This module is the pure, dependency-free source of truth for the
// budget numbers and the math - it's unit-tested (scripts/verify-ai-credits.mjs) and imported by both
// the client (usage display, pre-flight gate) and mirrored by the edge function (the authority).
//
// KEEP IN SYNC: supabase/functions/ai-proxy/index.ts duplicates AI_MONTHLY_TOKENS.pro and usagePeriod()
// because it runs in Deno and can't import from src/. If you change the budget here, change it there.
//
// METRIC NOTE: the budget counts TOTAL tokens (input + output + cache read + cache write). Anthropic
// prices output ~5x input, so a token budget under-bounds worst-case cost if a user's generations are
// output-heavy; the budget below is set conservatively for that reason. If cost from output-heavy abuse
// ever bites, switch the meter to a cost-weighted unit (the proxy already records each field separately).

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_AI_USAGE: AiTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** The single metered number: every token the account consumed, summed. */
export function totalTokens(u: AiTokenUsage): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

// Monthly token budget per plan. Free gets ZERO (AI is a Pro perk - the panel gate keeps free users
// out entirely; this is defense-in-depth). Pro's budget is a placeholder tuned against the $29.99/mo
// price: at the Opus estimate a typical prompt-to-scene run (Director + a handful of Coder calls, most
// input cached) lands well under 100k tokens, so ~6M covers dozens of generations a month. TUNE after
// watching real usage/cost in the ai_usage table.
export const AI_MONTHLY_TOKENS: Record<Plan, number> = {
  free: 0,
  pro: 6_000_000,
};

/** This account's monthly token allowance. */
export function aiBudget(plan: Plan): number {
  return AI_MONTHLY_TOKENS[plan];
}

/** Tokens left this period (never negative - an over-budget account clamps to 0). */
export function aiTokensRemaining(usedTokens: number, plan: Plan): number {
  return Math.max(0, aiBudget(plan) - usedTokens);
}

/** Pre-flight gate: may this account START a generation? True while any budget remains. A generation
 *  already in flight can push usage slightly past the budget (we meter AFTER the model responds); that
 *  small, bounded overage is accepted rather than pre-reserving an unknown cost. */
export function hasAiBudget(usedTokens: number, plan: Plan): boolean {
  return usedTokens < aiBudget(plan);
}

/** Fraction of the budget consumed, clamped to 0..1 (0 when the plan has no budget). */
export function aiUsageFraction(usedTokens: number, plan: Plan): number {
  const budget = aiBudget(plan);
  if (budget <= 0) return 0;
  return Math.min(1, Math.max(0, usedTokens / budget));
}

/** The UTC month bucket a usage row is keyed by, as 'YYYY-MM'. UTC (not local) so the reset moment is
 *  the same for every user regardless of timezone, and matches the edge function's bucket exactly. */
export function usagePeriod(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
