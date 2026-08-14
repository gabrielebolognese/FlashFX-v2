import { useEffect } from 'react';
import { useRenameModalStore } from '../../store/renameModal';
import { useEditorStore } from '../../store/editor';
import { computeBatchNames } from '../../core/batchRename';
import { Pencil, X, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';

// M19 — Batch rename modal. Composes new names from a token/number template + optional regex,
// with a live preview, and commits via the undoable renameLayers store action. Numbering follows
// document (z-order) order, resolved in the store at commit time.

const INPUT = 'bg-surface-3 text-[12px] text-slate-300 px-2.5 py-1.5 rounded border border-hairline focus:border-cyan-400/50 outline-none w-full';
const LABEL = 'text-[10px] uppercase tracking-wider text-slate-500 font-medium';

export function RenameModal() {
  const isOpen = useRenameModalStore((s) => s.isOpen);
  const pattern = useRenameModalStore((s) => s.pattern);
  const setPattern = useRenameModalStore((s) => s.setPattern);
  const close = useRenameModalStore((s) => s.close);

  const composition = useEditorStore((s) => s.composition);
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const renameLayers = useEditorStore((s) => s.renameLayers);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  // Doc-ordered selection → live preview (same core the store commits with).
  const ordered = composition.layers.filter((l) => selectedIds.includes(l.id));
  const { results, regexError } = computeBatchNames(ordered.map((l) => ({ id: l.id, name: l.name, type: l.type })), pattern);

  const insertToken = (tok: string) => setPattern({ template: pattern.template + tok });
  const apply = () => { renameLayers(selectedIds, pattern); close(); };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />

      <div className="relative bg-surface-2 border border-hairline rounded-lg shadow-overlay w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-cyan-400 shrink-0" />
            <h2 className="text-sm font-medium text-slate-200">Rename {ordered.length} Layers</h2>
          </div>
          <button onClick={close} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex">
          {/* Fields */}
          <div className="w-1/2 p-4 space-y-3 border-r border-hairline">
            <div className="space-y-1">
              <label className={LABEL}>Template</label>
              <input className={INPUT} value={pattern.template} onChange={(e) => setPattern({ template: e.target.value })} placeholder="{name}_{n}" />
              <div className="flex gap-1 pt-1">
                {[['{name}', 'Name'], ['{n}', 'Number'], ['{type}', 'Type']].map(([tok, lbl]) => (
                  <button key={tok} onClick={() => insertToken(tok)} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 border border-hairline text-slate-400 hover:text-cyan-300">+ {lbl}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className={LABEL}>Start #</label>
                <input type="number" className={INPUT} value={pattern.startNumber} onChange={(e) => setPattern({ startNumber: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="flex-1 space-y-1">
                <label className={LABEL}>Order</label>
                <div className="flex rounded border border-hairline overflow-hidden">
                  <button onClick={() => setPattern({ descending: false })} className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 ${!pattern.descending ? 'bg-cyan-400/20 text-cyan-300' : 'bg-surface-3 text-slate-400'}`}><ArrowUp size={11} />Asc</button>
                  <button onClick={() => setPattern({ descending: true })} className={`flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 ${pattern.descending ? 'bg-cyan-400/20 text-cyan-300' : 'bg-surface-3 text-slate-400'}`}><ArrowDown size={11} />Desc</button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className={LABEL}>Match (regex)</label>
              <input className={INPUT} value={pattern.find ?? ''} onChange={(e) => setPattern({ find: e.target.value })} placeholder="^Layer " />
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Replace</label>
              <input className={INPUT} value={pattern.replace ?? ''} onChange={(e) => setPattern({ replace: e.target.value })} placeholder="$1" />
            </div>
            {regexError && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400"><AlertTriangle size={12} />Invalid regex — ignored</div>
            )}
          </div>

          {/* Preview */}
          <div className="w-1/2 p-4">
            <label className={LABEL}>Preview</label>
            <div className="mt-1 max-h-64 overflow-y-auto font-mono text-[11px] space-y-0.5">
              {results.length === 0 && <div className="text-slate-600 text-[11px]">No layers selected.</div>}
              {ordered.map((l, i) => (
                <div key={l.id} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-slate-600 truncate max-w-[38%]">{l.name}</span>
                  <span className="text-slate-700">→</span>
                  <span className="text-cyan-300 truncate">{results[i]?.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-hairline">
          <button onClick={close} className="px-3 py-1.5 rounded-lg text-[12px] bg-surface-3 hover:bg-surface-4 text-slate-400">Cancel</button>
          <button onClick={apply} disabled={ordered.length === 0} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-on-accent disabled:opacity-40">Rename</button>
        </div>
      </div>
    </div>
  );
}
