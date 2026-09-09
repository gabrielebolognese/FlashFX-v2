import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Film, Star, Trash2, X, AlertTriangle, CheckSquare } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import { ProjectCardComponent } from './ProjectCard';

export type ProjectSection = 'recents' | 'all' | 'starred' | 'trash';

interface Props {
  section: ProjectSection;
  onCreateNew: () => void;
}

type MarqueeState = { x: number; y: number; w: number; h: number };

export function ProjectGrid({ section, onCreateNew }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const sortField = useProjectStore((s) => s.sortField);
  const sortDirection = useProjectStore((s) => s.sortDirection);
  const trashMany = useProjectStore((s) => s.trashMany);
  const deleteManyPermanently = useProjectStore((s) => s.deleteManyPermanently);

  const inSection = useMemo(() => {
    const trashed = (p: (typeof projects)[number]) => !!p.metadata.trashedAt;
    if (section === 'trash') return projects.filter(trashed);
    const active = projects.filter((p) => !trashed(p));
    if (section === 'starred') return active.filter((p) => p.metadata.starred);
    return active; // recents / all
  }, [projects, section]);

  const filteredAndSorted = useMemo(() => {
    let filtered = inSection;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = inSection.filter((p) => p.metadata.name.toLowerCase().includes(q));
    }
    // Trash sorts by when it was trashed (soonest to be erased last); others by the chosen field.
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (section === 'trash') cmp = (a.metadata.trashedAt ?? 0) - (b.metadata.trashedAt ?? 0);
      else if (sortField === 'name') cmp = a.metadata.name.localeCompare(b.metadata.name);
      else if (sortField === 'modifiedAt') cmp = a.metadata.modifiedAt - b.metadata.modifiedAt;
      else cmp = a.metadata.createdAt - b.metadata.createdAt;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [inSection, searchQuery, sortField, sortDirection, section]);

  // ---- Multi-select (drag-marquee, mirroring the canvas rubber-band) + bulk delete ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startCX: number; startCY: number; active: boolean; additive: boolean; base: Set<string> } | null>(null);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => setSelectedIds(new Set(filteredAndSorted.map((c) => c.metadata.id))), [filteredAndSorted]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Reset selection when the section changes (the grid stays mounted; the list swaps under it).
  useEffect(() => { setSelectedIds(new Set()); setMarquee(null); }, [section]);

  // Drop ids that are no longer visible (deleted, moved, or filtered out by search).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredAndSorted.map((c) => c.metadata.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredAndSorted]);

  // Keyboard: Ctrl/Cmd+A select all · Delete/Backspace → confirm bulk delete · Escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (showConfirm) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        if (filteredAndSorted.length === 0) return;
        e.preventDefault();
        setSelectedIds(new Set(filteredAndSorted.map((c) => c.metadata.id)));
        return;
      }
      if (e.key === 'Escape' && selectedIds.size > 0) { setSelectedIds(new Set()); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        setShowConfirm(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filteredAndSorted, selectedIds, showConfirm]);

  const rectHitsCard = (r: MarqueeState, el: Element) => {
    const cr = el.getBoundingClientRect();
    return r.x < cr.right && r.x + r.w > cr.left && r.y < cr.bottom && r.y + r.h > cr.top;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // A press on a card or any control handles itself (open / select / menu) — marquee starts only
    // on empty grid space (the gaps and padding), exactly like the canvas background.
    if (target.closest('[data-project-id]') || target.closest('button')) return;
    dragRef.current = {
      startCX: e.clientX, startCY: e.clientY, active: false,
      additive: e.shiftKey || e.ctrlKey || e.metaKey, base: new Set(selectedIds),
    };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startCX, dy = e.clientY - d.startCY;
    if (!d.active && Math.hypot(dx, dy) < 4) return; // dead-zone so a plain click isn't a drag
    d.active = true;
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const client: MarqueeState = { x: Math.min(e.clientX, d.startCX), y: Math.min(e.clientY, d.startCY), w: Math.abs(dx), h: Math.abs(dy) };
    setMarquee({ x: client.x - gridRect.left, y: client.y - gridRect.top, w: client.w, h: client.h });
    const hits = new Set<string>(d.additive ? d.base : []);
    grid.querySelectorAll('[data-project-id]').forEach((el) => {
      if (rectHitsCard(client, el)) {
        const id = (el as HTMLElement).dataset.projectId;
        if (id) hits.add(id);
      }
    });
    setSelectedIds(hits);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // A press-release with no drag on empty space clears the selection (canvas: click-empty deselects).
    if (d && !d.active && !d.additive) setSelectedIds(new Set());
    setMarquee(null);
  };

  const doBulkDelete = async () => {
    const ids = [...selectedIds];
    setShowConfirm(false);
    setSelectedIds(new Set());
    if (section === 'trash') await deleteManyPermanently(ids);
    else await trashMany(ids);
  };

  if (inSection.length === 0) {
    if (section === 'trash') return <Empty icon={<Trash2 size={24} className="text-slate-600" />} title="Trash is empty" sub="Deleted projects appear here for 7 days (30 if starred), then erase for good." />;
    if (section === 'starred') return <Empty icon={<Star size={24} className="text-slate-600" />} title="No starred projects" sub="Star a project to keep it handy — and give it a 30-day trash window." />;
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#141c28] border border-[#1c2433] flex items-center justify-center">
          <Film size={24} className="text-slate-600" />
        </div>
        <div className="text-center">
          <h2 className="text-[13px] text-slate-300 font-medium mb-0.5">No projects yet</h2>
          <p className="text-[11px] text-slate-500">Create your first project to get started</p>
        </div>
        <button onClick={onCreateNew} className="flex items-center gap-1.5 px-3.5 py-[6px] bg-[#f7b500] hover:bg-[#ffc83d] text-[#0a0f16] text-[11px] font-semibold rounded-md transition-colors">
          <Plus size={12} strokeWidth={2.5} />
          <span>Create Project</span>
        </button>
      </div>
    );
  }

  if (filteredAndSorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[40vh] gap-2">
        <p className="text-[12px] text-slate-500">No projects match "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <>
      {/* Selection action bar — appears once anything is selected. */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#141c28] border border-[#2a3a50] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
          <CheckSquare size={13} className="text-[#f7b500]" />
          <span className="text-[11px] text-slate-200 font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={selectAll}
            className="px-2 py-1 text-[10px] font-medium text-slate-300 hover:text-slate-100 rounded hover:bg-white/[0.05] transition-colors"
          >
            Select all ({filteredAndSorted.length})
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded hover:bg-white/[0.05] transition-colors"
          >
            <X size={11} /> Clear
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-white bg-red-600 hover:bg-red-500 rounded transition-colors"
          >
            <Trash2 size={11} />
            {section === 'trash' ? 'Delete permanently' : 'Move to Trash'}
          </button>
        </div>
      )}

      <div
        ref={gridRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pt-5"
      >
        {filteredAndSorted.map((card) => (
          <ProjectCardComponent
            key={card.metadata.id}
            card={card}
            selected={selectedIds.has(card.metadata.id)}
            selectionActive={selectedIds.size > 0}
            onSelectToggle={toggleSelect}
          />
        ))}
        {marquee && (
          <div
            className="absolute pointer-events-none z-30 border border-sky-400 bg-sky-400/10 rounded-sm"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>

      {showConfirm && (
        <BulkDeleteConfirm
          count={selectedIds.size}
          permanent={section === 'trash'}
          onConfirm={doBulkDelete}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

/** Count-based confirm for a bulk delete (typed-name-per-project doesn't scale to many). Permanent
 *  (Trash section) is red + "cannot be undone"; move-to-Trash is amber + recoverable. */
function BulkDeleteConfirm({ count, permanent, onConfirm, onClose }: {
  count: number; permanent: boolean; onConfirm: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const plural = count === 1 ? '' : 's';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[400px] max-w-[92vw] bg-[#111821] border border-[#2a3a50] rounded-lg shadow-2xl shadow-black/50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#1c2433] flex items-center gap-2">
          <AlertTriangle size={15} className={permanent ? 'text-red-400' : 'text-amber-400'} />
          <h2 className="text-[13px] font-semibold text-slate-100">
            {permanent ? `Delete ${count} project${plural} permanently` : `Move ${count} project${plural} to Trash`}
          </h2>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            {permanent ? (
              <>This <span className="text-slate-200 font-medium">cannot be undone</span>. The selected project{plural}, their scenes and all media assets are erased.</>
            ) : (
              <>The selected project{plural} move to Trash. You can restore them from there before they auto-erase.</>
            )}
          </p>
        </div>
        <div className="px-4 py-3 border-t border-[#1c2433] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-[6px] text-[11px] font-medium text-slate-300 hover:text-slate-100 rounded-md hover:bg-[#1a2233] transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-[6px] text-[11px] font-semibold rounded-md text-white transition-colors ${permanent ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}
          >
            {permanent ? 'Delete permanently' : 'Move to Trash'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] gap-3 text-center">
      <div className="w-14 h-14 rounded-xl bg-[#141c28] border border-[#1c2433] flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-[13px] text-slate-300 font-medium mb-0.5">{title}</h2>
        <p className="text-[11px] text-slate-500 max-w-[280px]">{sub}</p>
      </div>
    </div>
  );
}
