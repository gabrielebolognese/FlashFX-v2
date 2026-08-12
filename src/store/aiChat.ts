import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Step } from '../ui/panels/aiChatDemo';

// AI chat conversation state, lifted out of the panel component so it survives the panel being
// closed/reopened (the panel unmounts on close) AND survives a project reopen / page reload via
// localStorage. Conversations are keyed by project id so each project keeps its own thread.
// Only durable conversation data lives here — the in-flight generation state (generating/elapsed/
// timers) stays local to the component, since a half-finished stream can't survive an unmount.

export type AttachKind = 'file' | 'drive' | 'image';
export interface Attachment { id: string; name: string; kind: AttachKind }
export interface AiMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  ms?: number;
  attachments?: Attachment[];
  steps?: Step[];
}
export interface AiConversation {
  messages: AiMsg[];
  draft: string;
  attachments: Attachment[];
}

/** Shared empty conversation (stable reference so selectors don't churn). */
export const EMPTY_CONVERSATION: AiConversation = { messages: [], draft: '', attachments: [] };

/** Fallback bucket for a scene that hasn't been saved as a project yet. */
export const UNSAVED_KEY = '__unsaved__';
export const convKey = (projectId: string | null | undefined): string => projectId ?? UNSAVED_KEY;

type MsgUpdater = AiMsg[] | ((prev: AiMsg[]) => AiMsg[]);
type AttUpdater = Attachment[] | ((prev: Attachment[]) => Attachment[]);

/** Clear live streaming flags and drop a trailing assistant bubble that never produced text
 *  (an interrupted generation), so a reopened panel never shows a stuck cursor or empty reply. */
function settle(c: AiConversation): AiConversation {
  let messages = c.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m));
  while (
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    messages[messages.length - 1].text === '' &&
    messages[messages.length - 1].ms == null
  ) {
    messages = messages.slice(0, -1);
  }
  return { ...c, messages };
}

interface AiChatState {
  byProject: Record<string, AiConversation>;
  setMessages: (projectId: string | null, updater: MsgUpdater) => void;
  setDraft: (projectId: string | null, draft: string) => void;
  setAttachments: (projectId: string | null, updater: AttUpdater) => void;
  clearConversation: (projectId: string | null) => void;
  /** Clear any lingering streaming flag (e.g. after the panel was closed mid-generation). */
  settleStreaming: (projectId: string | null) => void;
}

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
      byProject: {},
      setMessages: (projectId, updater) => set((s) => {
        const k = convKey(projectId);
        const cur = s.byProject[k] ?? EMPTY_CONVERSATION;
        const messages = typeof updater === 'function' ? updater(cur.messages) : updater;
        return { byProject: { ...s.byProject, [k]: { ...cur, messages } } };
      }),
      setDraft: (projectId, draft) => set((s) => {
        const k = convKey(projectId);
        const cur = s.byProject[k] ?? EMPTY_CONVERSATION;
        return { byProject: { ...s.byProject, [k]: { ...cur, draft } } };
      }),
      setAttachments: (projectId, updater) => set((s) => {
        const k = convKey(projectId);
        const cur = s.byProject[k] ?? EMPTY_CONVERSATION;
        const attachments = typeof updater === 'function' ? updater(cur.attachments) : updater;
        return { byProject: { ...s.byProject, [k]: { ...cur, attachments } } };
      }),
      clearConversation: (projectId) => set((s) => ({
        byProject: { ...s.byProject, [convKey(projectId)]: { ...EMPTY_CONVERSATION } },
      })),
      settleStreaming: (projectId) => set((s) => {
        const k = convKey(projectId);
        const cur = s.byProject[k];
        if (!cur) return {};
        return { byProject: { ...s.byProject, [k]: settle(cur) } };
      }),
    }),
    {
      name: 'flashfx-ai-chat',
      storage: createJSONStorage(() => localStorage),
      // Never persist a live streaming flag / dangling empty reply.
      partialize: (s) => {
        const byProject: Record<string, AiConversation> = {};
        for (const [k, c] of Object.entries(s.byProject)) byProject[k] = settle(c);
        return { byProject };
      },
    },
  ),
);
