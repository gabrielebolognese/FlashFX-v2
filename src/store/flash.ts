import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Visibility of the Flash character (the hopping mascot). Persisted so "Hide Flash" sticks across
// reloads; the Flash tab (AiChatPanel header) toggles it back on.
interface FlashState {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const useFlashStore = create<FlashState>()(
  persist(
    (set) => ({
      hidden: false,
      setHidden: (hidden) => set({ hidden }),
    }),
    { name: 'flashfx-flash' },
  ),
);
