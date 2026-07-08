import { useState, useCallback, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import {
  fetchFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  getFolderItems,
} from './folderService';
import type { AssetFolder } from './types';

interface FolderBrowserProps {
  folderType: 'images' | 'videos' | 'audio';
  currentFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFilterByFolder: (assetIds: string[] | null) => void;
}

export function FolderBrowser({ folderType, currentFolderId, onFolderChange, onFilterByFolder }: FolderBrowserProps) {
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    const result = await fetchFolders(folderType);
    setFolders(result.filter((f) => f.parent_id === (currentFolderId || null)));
  }, [folderType, currentFolderId]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (currentFolderId) {
      getFolderItems(currentFolderId).then((items) => {
        onFilterByFolder(items.map((i) => i.asset_id));
      });
    } else {
      onFilterByFolder(null);
    }
  }, [currentFolderId, onFilterByFolder]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), folderType, currentFolderId || undefined);
    setNewFolderName('');
    setCreating(false);
    loadFolders();
  }, [newFolderName, folderType, currentFolderId, loadFolders]);

  const handleRename = useCallback(async (id: string) => {
    if (!renameValue.trim()) return;
    await renameFolder(id, renameValue.trim());
    setRenamingId(null);
    setRenameValue('');
    loadFolders();
  }, [renameValue, loadFolders]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFolder(id);
    setContextMenuId(null);
    if (currentFolderId === id) {
      onFolderChange(null);
    }
    loadFolders();
  }, [currentFolderId, onFolderChange, loadFolders]);

  if (folders.length === 0 && !creating && !currentFolderId) {
    return (
      <div className="px-2 py-1 border-b border-[#1a2a42]">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          <FolderPlus size={10} />
          <span>New folder</span>
        </button>
        {creating && (
          <div className="flex items-center gap-1 mt-1">
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Folder name..."
              className="flex-1 bg-[#16294a] border border-[#1c3155] rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none placeholder:text-slate-700"
            />
            <button onClick={handleCreateFolder} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check size={10} /></button>
            <button onClick={() => setCreating(false)} className="p-0.5 text-slate-500 hover:text-slate-300"><X size={10} /></button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-[#1a2a42]">
      {/* Back button when inside a folder */}
      {currentFolderId && (
        <button
          onClick={() => onFolderChange(null)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors"
        >
          <ChevronLeft size={10} />
          <span>All {folderType}</span>
        </button>
      )}

      {/* Folder list */}
      <div className="px-1 py-0.5">
        {folders.map((folder) => (
          <div key={folder.id} className="relative">
            {renamingId === folder.id ? (
              <div className="flex items-center gap-1 px-1 py-0.5">
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(folder.id); if (e.key === 'Escape') setRenamingId(null); }}
                  className="flex-1 bg-[#16294a] border border-[#1c3155] rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none"
                />
                <button onClick={() => handleRename(folder.id)} className="p-0.5 text-emerald-400"><Check size={9} /></button>
                <button onClick={() => setRenamingId(null)} className="p-0.5 text-slate-500"><X size={9} /></button>
              </div>
            ) : (
              <button
                onClick={() => onFolderChange(folder.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors group ${
                  currentFolderId === folder.id
                    ? 'bg-[#f7b500]/10 text-[#f7b500]'
                    : 'hover:bg-white/[0.03] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Folder size={11} className="flex-shrink-0" style={{ color: folder.color }} />
                <span className="text-[9px] truncate flex-1">{folder.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setContextMenuId(contextMenuId === folder.id ? null : folder.id); }}
                  className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300 transition-all"
                >
                  <MoreHorizontal size={10} />
                </button>
                <ChevronRight size={9} className="text-slate-700 flex-shrink-0" />
              </button>
            )}

            {/* Context menu */}
            {contextMenuId === folder.id && (
              <div className="absolute right-2 top-full z-50 bg-[#1a2a42] border border-[#2a3a52] rounded shadow-lg py-0.5 min-w-[80px]">
                <button
                  onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); setContextMenuId(null); }}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] text-slate-300 hover:bg-white/5"
                >
                  <Pencil size={9} /> Rename
                </button>
                <button
                  onClick={() => handleDelete(folder.id)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] text-red-400 hover:bg-red-400/10"
                >
                  <Trash2 size={9} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create new folder */}
      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center gap-1 px-3 py-1 text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          <FolderPlus size={9} />
          <span>New folder</span>
        </button>
      ) : (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Folder name..."
            className="flex-1 bg-[#16294a] border border-[#1c3155] rounded px-1.5 py-0.5 text-[9px] text-slate-300 outline-none placeholder:text-slate-700"
          />
          <button onClick={handleCreateFolder} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check size={10} /></button>
          <button onClick={() => setCreating(false)} className="p-0.5 text-slate-500 hover:text-slate-300"><X size={10} /></button>
        </div>
      )}
    </div>
  );
}
