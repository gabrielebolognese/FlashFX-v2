import type { ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight, ChevronsDown, ChevronsUp, X } from 'lucide-react';
import { usePanelStore, type PanelId } from '../../store/panels';

interface PanelContainerProps {
  id: PanelId;
  title: string;
  children: ReactNode;
  canHide?: boolean;
  direction?: 'horizontal' | 'vertical';
}

export function PanelContainer({ id, title, children, canHide = true, direction = 'horizontal' }: PanelContainerProps) {
  const collapsed = usePanelStore((s) => s.panels[id].collapsed);
  const toggleCollapsed = usePanelStore((s) => s.toggleCollapsed);
  const setVisible = usePanelStore((s) => s.setVisible);

  const isVertical = direction === 'vertical';

  if (collapsed && !isVertical) {
    return (
      <div className="flex flex-col items-center w-[24px] min-w-[24px] bg-[#081220]">
        <button
          onClick={() => toggleCollapsed(id)}
          className="mt-1 p-1 text-slate-600 hover:text-[#f7b500] transition-colors"
          title={`Expand ${title}`}
        >
          <ChevronsRight size={11} />
        </button>
        <span className="text-[8px] text-slate-700 uppercase tracking-[0.15em] mt-3 [writing-mode:vertical-lr] rotate-180">
          {title}
        </span>
      </div>
    );
  }

  if (collapsed && isVertical) {
    return (
      <div className="flex items-center h-[22px] min-h-[22px] bg-[#081220] border-t border-[#1a2a42]/40 px-2 gap-1">
        <button
          onClick={() => toggleCollapsed(id)}
          className="p-0.5 text-slate-600 hover:text-[#f7b500] transition-colors"
          title={`Expand ${title}`}
        >
          <ChevronsDown size={10} />
        </button>
        <span className="text-[9px] text-slate-600 uppercase tracking-wider">{title}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0a1628]">
      {/* Header */}
      <div className="flex items-center h-[22px] min-h-[22px] px-2 bg-[#081220] border-b border-[#1a2a42]/40">
        <button
          onClick={() => toggleCollapsed(id)}
          className="p-0.5 text-slate-600 hover:text-[#f7b500] transition-colors mr-1.5"
          title="Collapse"
        >
          {isVertical ? <ChevronsUp size={10} /> : <ChevronsLeft size={10} />}
        </button>
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider flex-1 select-none">
          {title}
        </span>
        {canHide && (
          <button
            onClick={() => setVisible(id, false)}
            className="p-0.5 text-slate-700 hover:text-red-400 transition-colors"
            title={`Close ${title}`}
          >
            <X size={9} />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        {children}
      </div>
    </div>
  );
}
