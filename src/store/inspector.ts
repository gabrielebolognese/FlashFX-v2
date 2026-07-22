import { create } from 'zustand';

// The Inspector's selectable tabs. Single source of truth so the Inspector and
// any code that asks it to switch tabs (e.g. the top-bar Effects menu) agree.
export type InspectorTab =
  | 'properties'
  | 'advanced'
  | 'motionPath'
  | 'effects'
  | 'filters'
  | 'colorCorrection'
  | 'motionControl'
  | 'masks'
  | 'loop'
  | 'anchor'
  | 'physics'
  | 'stagger'
  | 'fieldSampling'
  | 'animate'
  | 'code';

interface InspectorState {
  // A tab the Inspector should switch to (set by e.g. the Effects menu). The
  // mounted Inspector consumes it once via an effect and clears it. If the tab
  // isn't valid for the current layer, the Inspector falls back to 'properties'.
  requestedTab: InspectorTab | null;
  requestTab: (tab: InspectorTab) => void;
  clearRequestedTab: () => void;
}

export const useInspectorStore = create<InspectorState>((set) => ({
  requestedTab: null,
  requestTab: (requestedTab) => set({ requestedTab }),
  clearRequestedTab: () => set({ requestedTab: null }),
}));
