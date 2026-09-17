import { GraduationCap } from 'lucide-react';
import { useTutorialStore } from '../../store/tutorial';
import { getTutorial } from './registry';

// The "Tutorial: How to use X" button shown at the bottom of a panel. Renders nothing if no tutorial
// is registered for the id, so it's safe to drop into any panel.
export function PanelTutorialButton({ id }: { id: string }) {
  const open = useTutorialStore((s) => s.open);
  const def = getTutorial(id);
  if (!def) return null;
  return (
    <button
      type="button"
      onClick={() => open(id)}
      title={`Tutorial: How to use ${def.label}`}
      className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-[10.5px] text-slate-400 transition-colors hover:border-accent/40 hover:text-accent"
    >
      <GraduationCap size={12} />
      Tutorial: How to use {def.label}
    </button>
  );
}
