import { create } from 'zustand';

// Bridges the /subscription-success "Show me everything" button to the ProTutorial runner mounted in
// the editor. The success page sets a sessionStorage flag and reloads to the app; on boot App reads
// the flag, opens a fresh project, and calls start(kind). ProTutorial watches `kind` + the active
// project and plays the matching template choreography.

export type ProTutorialKind = 'storage';

interface ProTutorialState {
  kind: ProTutorialKind | null;
  start: (kind: ProTutorialKind) => void;
  clear: () => void;
}

export const useProTutorialStore = create<ProTutorialState>((set) => ({
  kind: null,
  start: (kind) => set({ kind }),
  clear: () => set({ kind: null }),
}));
