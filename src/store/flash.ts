import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Flash the character: visibility + live activity status. `hidden` is persisted (Hide Flash sticks
// across reloads; the Flash tab toggles it back on). `status` is transient and shared so the character
// can react to the AI pipeline: 'building' = Flash has taken the wheel and is building a scene.
export type FlashStatus = 'idle' | 'thinking' | 'building';

interface FlashState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  status: FlashStatus;
  setStatus: (status: FlashStatus) => void;
}

export const useFlashStore = create<FlashState>()(
  persist(
    (set) => ({
      hidden: false,
      setHidden: (hidden) => set({ hidden }),
      status: 'idle',
      setStatus: (status) => set({ status }),
    }),
    { name: 'flashfx-flash', partialize: (s) => ({ hidden: s.hidden }) },
  ),
);
