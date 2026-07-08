import { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import type { MenuEntry, ContextMenuState } from './types';

interface ContextMenuContextValue {
  state: ContextMenuState | null;
  show: (x: number, y: number, items: MenuEntry[]) => void;
  hide: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue>({
  state: null,
  show: () => {},
  hide: () => {},
});

export function useContextMenu() {
  return useContext(ContextMenuContext);
}

export function useContextMenuTrigger(buildItems: () => MenuEntry[]) {
  const { show } = useContextMenu();
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      show(e.clientX, e.clientY, buildItems());
    },
    [show, buildItems]
  );
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const show = useCallback((x: number, y: number, items: MenuEntry[]) => {
    setState({ x, y, items });
  }, []);

  const hide = useCallback(() => {
    setState(null);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stateRef.current) {
        setState(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <ContextMenuContext.Provider value={{ state, show, hide }}>
      {children}
    </ContextMenuContext.Provider>
  );
}
