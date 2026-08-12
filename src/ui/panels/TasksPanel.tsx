import { useRef, useEffect } from 'react';
import { ListChecks, X, Loader2, Check, AlertTriangle, Info, Trash2 } from 'lucide-react';
import { usePanelStore } from '../../store/panels';
import { useTasksStore, type TaskStatus } from '../../store/tasks';

// A side panel that mirrors the AI panel's shape but carries NO chat: just a live log of background
// work (model downloads with %, caption generation with per-clip detail, and future long ops).

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'running') return <Loader2 size={12} className="text-[#f7b500] animate-spin flex-shrink-0 mt-0.5" />;
  if (status === 'done') return <Check size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />;
  if (status === 'error') return <AlertTriangle size={12} className="text-rose-400 flex-shrink-0 mt-0.5" />;
  return <Info size={12} className="text-slate-500 flex-shrink-0 mt-0.5" />;
}

export function TasksPanel() {
  const toggleTasks = usePanelStore((s) => s.toggleTasks);
  const items = useTasksStore((s) => s.items);
  const clear = useTasksStore((s) => s.clear);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Follow the tail as new lines arrive.
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [items]);

  return (
    <aside className="flex-shrink-0 h-full flex flex-col bg-[#0b1220] border-l border-[#1a2a42]" style={{ width: '20%', minWidth: 260 }}>
      {/* Header */}
      <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-[#1a2a42]">
        <ListChecks size={14} className="text-[#f7b500]" />
        <span className="text-[12px] font-semibold text-slate-200">Tasks</span>
        <div className="ml-auto flex items-center gap-1">
          <button title="Clear log" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={clear}><Trash2 size={12} /></button>
          <button title="Close" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={toggleTasks}><X size={13} /></button>
        </div>
      </div>

      {/* Log */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {items.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-600 px-2">
            <ListChecks size={22} />
            <p className="text-[12px] leading-relaxed">Background tasks show up here: model downloads, caption generation, and more, with live progress.</p>
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} className="rounded-md bg-[#0e1726] border border-[#1a2a42] px-2.5 py-2">
            <div className="flex items-start gap-2">
              <StatusIcon status={it.status} />
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] text-slate-200 leading-snug">{it.title}</div>
                {it.detail && <div className="text-[10.5px] text-slate-500 leading-snug mt-0.5 break-words">{it.detail}</div>}
                {typeof it.progress === 'number' && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded bg-[#122240] overflow-hidden">
                      <div className="h-full bg-[#f7b500] transition-all" style={{ width: `${Math.max(2, Math.min(100, it.progress))}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-500 tabular-nums w-8 text-right">{Math.round(it.progress)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
