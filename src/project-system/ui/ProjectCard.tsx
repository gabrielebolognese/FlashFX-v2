import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Copy, Trash2, Monitor, Download, Film, Smartphone } from 'lucide-react';
import type { ProjectCard } from '../types';
import { useProjectStore } from '../hooks/useProjectStore';

interface Props {
  card: ProjectCard;
}

export function ProjectCardComponent({ card }: Props) {
  const { metadata, previewUrl } = card;
  const openProject = useProjectStore((s) => s.openProject);
  const deleteProjectAction = useProjectStore((s) => s.deleteProject);
  const renameProjectAction = useProjectStore((s) => s.renameProject);
  const duplicateProjectAction = useProjectStore((s) => s.duplicateProject);
  const exportProjectAction = useProjectStore((s) => s.exportProject);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(metadata.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleOpen = () => {
    openProject(metadata.id);
  };

  const handleRenameSubmit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== metadata.name) {
      renameProjectAction(metadata.id, trimmed);
    }
    setRenaming(false);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
    <div className="group relative flex flex-col rounded-lg overflow-hidden bg-[#111821] border border-[#1c2433] hover:border-[#2a3a50] transition-all duration-150 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      {/* Preview area */}
      <div
        className="aspect-[16/10] bg-[#0a0f16] relative cursor-pointer overflow-hidden"
        onClick={handleOpen}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={metadata.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#0d1520]">
            <Monitor size={22} className="text-slate-700" />
          </div>
        )}

        {/* Subtle hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        {/* Format badge */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          {metadata.videoFormat === 'short' ? (
            <Smartphone size={9} className="text-slate-300" />
          ) : (
            <Film size={9} className="text-slate-300" />
          )}
          <span className="text-[8px] text-slate-300 font-medium uppercase tracking-wide">
            {metadata.videoFormat === 'short' ? 'Short' : 'Long'}
          </span>
        </div>
      </div>

      {/* Info area */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        {/* Project icon */}
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-full bg-[#1a2233] text-[12px] text-slate-200 px-1.5 py-0.5 rounded border border-[#f7b500]/30 outline-none"
            />
          ) : (
            <>
              <h3 className="text-[12px] text-slate-200 font-medium truncate leading-tight">{metadata.name}</h3>
              <span className="text-[10px] text-slate-500 leading-tight">Edited {formatDate(metadata.modifiedAt)}</span>
            </>
          )}
        </div>

        {/* Context menu trigger */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1a2233] transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal size={13} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-[#1a2233] border border-[#2a3a50] rounded-md shadow-xl shadow-black/40 z-50 py-0.5 overflow-hidden">
              <button
                onClick={() => { setRenaming(true); setNameInput(metadata.name); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-[5px] text-[11px] text-slate-300 hover:bg-[#242f3f] transition-colors"
              >
                <Pencil size={10} />
                Rename
              </button>
              <button
                onClick={() => { duplicateProjectAction(metadata.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-[5px] text-[11px] text-slate-300 hover:bg-[#242f3f] transition-colors"
              >
                <Copy size={10} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  exportProjectAction(metadata.id).catch((err) =>
                    alert(err instanceof Error ? err.message : 'Failed to download project')
                  );
                }}
                className="w-full flex items-center gap-2 px-2.5 py-[5px] text-[11px] text-slate-300 hover:bg-[#242f3f] transition-colors"
              >
                <Download size={10} />
                Download .ffx
              </button>
              <div className="border-t border-[#2a3a50] my-0.5" />
              <button
                onClick={() => { deleteProjectAction(metadata.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-[5px] text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={10} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
