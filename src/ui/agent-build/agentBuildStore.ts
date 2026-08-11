import { create } from 'zustand';

// Global state for the "cinematic agent build" — the show that plays when a template is inserted:
// the editor's border pulses amber, a fake agent cursor glides around, and inspector property rows
// light up as keyframes get placed. This store holds ONLY the visual/agent state; the actual
// composition staging + choreography lives in the editor store's insertAnimationTemplateAnimated,
// which drives this store as it runs. Kept free of React/DOM so it can be poked from anywhere.

export type AgentCursorIcon = 'arrow' | 'hand';

/** Where the on-screen agent cursor should glide next. The overlay resolves each kind to a screen
 *  point every frame (so it tracks scroll / layout changes live):
 *   - dom:       the centre of `querySelector(selector)`'s bounding rect
 *   - canvasRel: a fraction (fx,fy) inside the viewport/canvas element's rect
 *   - screen:    absolute client pixels */
export type AgentCursorTarget =
  | { kind: 'dom'; selector: string }
  | { kind: 'canvasRel'; fx: number; fy: number }
  | { kind: 'screen'; x: number; y: number };

interface AgentBuildState {
  /** A cinematic build is running — drives the pulsing border and shows the cursor. */
  active: boolean;
  /** Short status shown beside the cursor ("Placing keyframes…"). */
  label: string;
  cursorTarget: AgentCursorTarget | null;
  cursorIcon: AgentCursorIcon;
  /** Bumped to fire a one-shot click pop on the cursor. */
  clickPulse: number;
  /** Inspector property row to ring (e.g. "transform.position"), or null. */
  highlightPropPath: string | null;

  begin: (label?: string) => void;
  end: () => void;
  setLabel: (label: string) => void;
  moveCursor: (target: AgentCursorTarget | null, icon?: AgentCursorIcon) => void;
  clickCursor: () => void;
  highlightProp: (path: string | null) => void;
}

export const useAgentBuildStore = create<AgentBuildState>((set) => ({
  active: false,
  label: '',
  cursorTarget: null,
  cursorIcon: 'arrow',
  clickPulse: 0,
  highlightPropPath: null,

  begin: (label = 'Working…') =>
    set({ active: true, label, cursorTarget: { kind: 'canvasRel', fx: 0.5, fy: 0.45 }, cursorIcon: 'arrow', highlightPropPath: null }),
  end: () => set({ active: false, label: '', cursorTarget: null, highlightPropPath: null }),
  setLabel: (label) => set({ label }),
  moveCursor: (cursorTarget, icon) => set(icon ? { cursorTarget, cursorIcon: icon } : { cursorTarget }),
  clickCursor: () => set((s) => ({ clickPulse: s.clickPulse + 1 })),
  highlightProp: (highlightPropPath) => set({ highlightPropPath }),
}));
