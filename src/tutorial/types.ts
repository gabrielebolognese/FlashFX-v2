import type { useEditorStore } from '../store/editor';
import type { useTimelineStore } from '../store/timeline';
import type { useShapeToolStore } from '../store/shapeTool';

// Live-state getters + helpers a tutorial step uses to drive the REAL editor (so every edit the
// user watches is genuine). Getters return fresh state each call.
export interface TutorialApi {
  editor: () => ReturnType<typeof useEditorStore.getState>;
  timeline: () => ReturnType<typeof useTimelineStore.getState>;
  tools: () => ReturnType<typeof useShapeToolStore.getState>;
  /** Sleep, scaled by playback speed, honouring pause/abort. */
  wait: (ms: number) => Promise<void>;
  setFrame: (n: number) => void;
  select: (ids: string[]) => void;
  /** Id of the most-recently-added layer (for chaining a step onto what the last one made). */
  lastLayerId: () => string | undefined;
}

export interface TutorialStep {
  id: string;
  say: string;                 // narration
  spotlight?: string;          // data-tutorial-id target, or 'canvas' | 'none' (Phase 4)
  run?: (api: TutorialApi) => void | Promise<void>;
  hold?: number;               // ms to linger after run (default 1200), scaled by speed
}

export interface TutorialChapter {
  id: string;
  title: string;
  steps: TutorialStep[];
}
