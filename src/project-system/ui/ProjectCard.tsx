import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Pencil, Copy, Trash2, Monitor, Download, Film, Smartphone, Star, RotateCcw, FolderOpen } from 'lucide-react';
import type { ProjectCard } from '../types';
import { trashDaysRemaining } from '../types';
import { useProjectStore } from '../hooks/useProjectStore';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  card: ProjectCard;
}

interface MenuItem { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; sep?: boolean }

const MENU_W = 168;

// The card menu renders in a PORTAL (fixed position, clamped to the viewport) so the card's
// `overflow-hidden` — needed to clip the rounded preview — never clips or hides the menu. Used by
// both the ⋯ button (anchored below it) and right-click (at the cursor).
function CardMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    setPos({ left, top, ready: true });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onClose);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClose);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_W, visibility: pos.ready ? 'visible' : 'hidden' }}
      className="bg-[#1a2233] border border-[#2a3a50] rounded-md shadow-xl shadow-black/40 z-[200] py-0.5 overflow-hidden"
    >
      {items.map((it, i) => it.sep ? (
        <div key={i} className="border-t border-[#2a3a50] my-0.5" />
      ) : (
        <button
          key={i}
          onClick={() => { it.onClick(); onClose(); }}
          className={`w-full flex items-center gap-2 px-2.5 py-[5px] text-[11px] transition-colors ${it.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-[#242f3f]'}`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function ProjectCardComponent({ card }: Props) {
  const { metadata, previewUrl } = card;
  const isTrashed = !!metadata.trashedAt;
  const starred = !!metadata.starred;

  const openProject = useProjectStore((s) => s.openProject);
  const trashProjectAction = useProjectStore((s) => s.trashProject);
  const restoreProjectAction = useProjectStore((s) => s.restoreProject);
  const deletePermanentlyAction = useProjectStore((s) => s.deletePermanently);
  const toggleStarAction = useProjectStore((s) => s.toggleStar);
  const renameProjectAction = useProjectStore((s) => s.renameProject);
  const duplicateProjectAction = useProjectStore((s) => s.duplicateProject);
  const exportProjectAction = useProjectStore((s) => s.exportProject);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameInput, setNameInput] = useState(metadata.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleOpen = () => { if (!isTrashed) openProject(metadata.id); };

  const handleRenameSubmit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== metadata.name) renameProjectAction(metadata.id, trimmed);
    setRenaming(false);
  };

  const startRename = () => { setRenaming(true); setNameInput(metadata.name); };
  const doExport = () => exportProjectAction(metadata.id).catch((err) => alert(err instanceof Error ? err.message : 'Failed to download project'));

  const menuItems: MenuItem[] = isTrashed
    ? [
        { icon: <RotateCcw size={10} />, label: 'Restore', onClick: () => restoreProjectAction(metadata.id) },
        { icon: null, label: '', onClick: () => {}, sep: true },
        { icon: <Trash2 size={10} />, label: 'Delete permanently', onClick: () => setConfirmDelete(true), danger: true },
      ]
    : [
        { icon: <FolderOpen size={10} />, label: 'Open', onClick: () => openProject(metadata.id) },
        { icon: <Pencil size={10} />, label: 'Rename', onClick: startRename },
        { icon: <Star size={10} className={starred ? 'text-[#f7b500]' : ''} fill={starred ? 'currentColor' : 'none'} />, label: starred ? 'Unstar' : 'Star', onClick: () => toggleStarAction(metadata.id) },
        { icon: <Copy size={10} />, label: 'Duplicate', onClick: () => duplicateProjectAction(metadata.id) },
        { icon: <Download size={10} />, label: 'Download .ffx', onClick: doExport },
        { icon: null, label: '', onClick: () => {}, sep: true },
        { icon: <Trash2 size={10} />, label: 'Move to Trash', onClick: () => trashProjectAction(metadata.id), danger: true },
      ];

  const openMenuAtButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.right - MENU_W, y: r.bottom + 4 });
  };
  const openMenuAtCursor = (e: React.MouseEvent) => {
    if (renaming) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const daysLeft = isTrashed ? trashDaysRemaining(metadata, Date.now()) : 0;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="group relative flex flex-col rounded-lg overflow-hidden bg-[#111821] border border-[#1c2433] hover:border-[#2a3a50] transition-all duration-150 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
      onContextMenu={openMenuAtCursor}
    >
      {/* Preview area */}
      <div
        className={`aspect-[16/10] bg-[#0a0f16] relative overflow-hidden ${isTrashed ? '' : 'cursor-pointer'}`}
        onClick={handleOpen}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={metadata.name} className={`w-full h-full object-cover ${isTrashed ? 'opacity-40 grayscale' : ''}`} />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-[#0d1520] ${isTrashed ? 'opacity-40' : ''}`}>
            <Monitor size={22} className="text-slate-700" />
          </div>
        )}

        {!isTrashed && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        )}

        {/* Format badge */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          {metadata.videoFormat === 'short' ? <Smartphone size={9} className="text-slate-300" /> : <Film size={9} className="text-slate-300" />}
          <span className="text-[8px] text-slate-300 font-medium uppercase tracking-wide">{metadata.videoFormat === 'short' ? 'Short' : 'Long'}</span>
        </div>

        {/* Star toggle (always visible when starred, else on hover) */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleStarAction(metadata.id); }}
          title={starred ? 'Unstar' : 'Star'}
          className={`absolute top-1.5 right-1.5 p-1 rounded bg-black/50 backdrop-blur-sm transition-opacity ${starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <Star size={12} className={starred ? 'text-[#f7b500]' : 'text-slate-300'} fill={starred ? 'currentColor' : 'none'} />
        </button>

        {/* Trash overlay: retention countdown */}
        {isTrashed && (
          <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <span className="text-[9px] font-medium text-red-300">
              {daysLeft > 0 ? `Deletes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Deleting…'}
              {starred && <span className="text-slate-400"> · starred keeps 30d</span>}
            </span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-[#1a2233] flex items-center justify-center flex-shrink-0">
          <Monitor size={10} className="text-slate-400" />
        </div>

        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              ref={inputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(false); }}
              className="w-full bg-[#1a2233] text-[12px] text-slate-200 px-1.5 py-0.5 rounded border border-[#f7b500]/30 outline-none"
            />
          ) : (
            <>
              <h3 className="text-[12px] text-slate-200 font-medium truncate leading-tight">{metadata.name}</h3>
              <span className="text-[10px] text-slate-500 leading-tight">
                {isTrashed ? `Deletes in ${daysLeft}d` : `Edited ${formatDate(metadata.modifiedAt)}`}
              </span>
            </>
          )}
        </div>

        {isTrashed ? (
          // Trash actions: Restore + Delete permanently (typed-name confirmation).
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => restoreProjectAction(metadata.id)}
              title="Restore"
              className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1a2233] transition-colors"
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete permanently"
              className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={openMenuAtButton}
            title="More"
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1a2233] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          >
            <MoreHorizontal size={13} />
          </button>
        )}
      </div>

      {menu && <CardMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {confirmDelete && (
        <ConfirmDeleteModal
          name={metadata.name}
          onConfirm={() => { deletePermanentlyAction(metadata.id); setConfirmDelete(false); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
