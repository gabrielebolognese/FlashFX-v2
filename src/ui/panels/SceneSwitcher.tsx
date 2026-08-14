import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Film, Check } from 'lucide-react';
import { useEditorStore } from '../../store/editor';

/**
 * Top-bar scene switcher. Lists the document's top-level scenes (navStack[0] is
 * the current one), lets you switch between them, and add a new one. Scene
 * create/duplicate/delete/rename live in the Toolbar's Scene menu.
 */
export function SceneSwitcher() {
  const scenes = useEditorStore((s) => s.scenes);
  const navStack = useEditorStore((s) => s.navStack);
  const compositions = useEditorStore((s) => s.compositions);
  const composition = useEditorStore((s) => s.composition);
  const activeCompositionId = useEditorStore((s) => s.activeCompositionId);
  const switchScene = useEditorStore((s) => s.switchScene);
  const createScene = useEditorStore((s) => s.createScene);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (scenes.length === 0) return null;

  const currentSceneId = navStack[0];
  const nameFor = (id: string): string => (id === activeCompositionId ? composition.name : compositions[id]?.name) ?? 'Scene';

  return (
    <div ref={ref} className="relative flex items-stretch border-l border-hairline">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Scenes"
        className={`flex items-center gap-1.5 px-3 transition-colors ${open ? 'bg-white/[0.05] text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}
      >
        <Film size={13} />
        <span className="text-[11px] font-medium max-w-[130px] truncate">{nameFor(currentSceneId)}</span>
        <ChevronDown size={12} className="text-slate-500" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-0.5 z-[60] bg-surface-2 border border-hairline rounded-md shadow-2xl py-1 min-w-[210px] max-h-[380px] overflow-y-auto">
          <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-slate-600">Scenes</div>
          {scenes.map((id) => (
            <button
              key={id}
              onClick={() => { switchScene(id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-slate-300 hover:bg-white/[0.05] hover:text-slate-100 cursor-pointer"
            >
              <span className="w-3 flex-shrink-0">{id === currentSceneId && <Check size={11} className="text-accent" />}</span>
              <span className="flex-1 text-left truncate">{nameFor(id)}</span>
            </button>
          ))}
          <div className="h-px bg-surface-4 my-1" />
          <button
            onClick={() => { createScene(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-slate-300 hover:bg-white/[0.05] hover:text-slate-100 cursor-pointer"
          >
            <Plus size={12} /> New Scene
          </button>
        </div>
      )}
    </div>
  );
}
