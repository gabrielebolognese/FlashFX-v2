import { ChevronRight, ArrowUp } from 'lucide-react';
import { useEditorStore } from '../../store/editor';

/**
 * Precomposition breadcrumb: shows the navigation path root → precomp → … while
 * editing a nested composition, with clickable segments (navigateToComposition) and
 * an "up one level" button. Hidden at the root (navStack length 1).
 */
export function CompositionBreadcrumb() {
  const navStack = useEditorStore((s) => s.navStack);
  const compositions = useEditorStore((s) => s.compositions);
  const composition = useEditorStore((s) => s.composition);
  const activeCompositionId = useEditorStore((s) => s.activeCompositionId);
  const navigateToComposition = useEditorStore((s) => s.navigateToComposition);
  const exitPrecomp = useEditorStore((s) => s.exitPrecomp);

  if (navStack.length <= 1) return null;

  const nameFor = (id: string): string =>
    (id === activeCompositionId ? composition.name : compositions[id]?.name) ?? 'Comp';

  return (
    <div className="flex items-center gap-1 px-3 h-7 flex-shrink-0 border-b border-[#1a2a42] bg-[#0c1a2d] text-[11px] overflow-x-auto">
      <button
        onClick={exitPrecomp}
        title="Up one level (Esc)"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors flex-shrink-0"
      >
        <ArrowUp size={12} />
      </button>
      {navStack.map((id, i) => {
        const isLast = i === navStack.length - 1;
        return (
          <div key={id} className="flex items-center gap-1 flex-shrink-0">
            {i > 0 && <ChevronRight size={11} className="text-slate-600" />}
            <button
              onClick={() => navigateToComposition(i)}
              className={`px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                isLast ? 'text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
              }`}
            >
              {nameFor(id)}
            </button>
          </div>
        );
      })}
    </div>
  );
}
