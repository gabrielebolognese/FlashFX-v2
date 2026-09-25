import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/telemetry';
import { useAuthStore } from '../auth/store';
import { usagePeriod, type AiTokenUsage } from '../billing/aiCredits';

// Read-only mirror of the account's MANAGED AI token usage for the current month (the ai_usage table,
// written server-side by the ai-proxy). Powers the "X / budget" display and a pre-flight gate. The
// server remains the source of truth (it enforces the budget); this is a UX convenience refreshed on
// sign-in and after each generation.

interface AiUsageState {
  period: string;
  usage: AiTokenUsage;
  /** True once at least one successful read has landed (so the UI can avoid flashing 0). */
  loaded: boolean;
  /** Total tokens spent this period (sum of the four fields). */
  totalTokens: number;
  refresh: () => Promise<void>;
  reset: () => void;
}

const EMPTY: AiTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export const useAiUsageStore = create<AiUsageState>((set) => ({
  period: usagePeriod(),
  usage: EMPTY,
  loaded: false,
  totalTokens: 0,

  refresh: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!supabase || !userId) {
      set({ usage: EMPTY, totalTokens: 0, loaded: true, period: usagePeriod() });
      return;
    }
    const period = usagePeriod();
    try {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('input_tokens, output_tokens, cache_read_tokens, cache_write_tokens')
        .eq('user_id', userId)
        .eq('period', period)
        .maybeSingle();
      if (error) return; // transient read failure: keep the last-known value
      const usage: AiTokenUsage = {
        inputTokens: Number(data?.input_tokens ?? 0),
        outputTokens: Number(data?.output_tokens ?? 0),
        cacheReadTokens: Number(data?.cache_read_tokens ?? 0),
        cacheWriteTokens: Number(data?.cache_write_tokens ?? 0),
      };
      const totalTokens =
        usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      set({ usage, totalTokens, loaded: true, period });
    } catch (e) {
      captureError(e, { kind: 'ai-usage-refresh' });
    }
  },

  reset: () => set({ usage: EMPTY, totalTokens: 0, loaded: false, period: usagePeriod() }),
}));
