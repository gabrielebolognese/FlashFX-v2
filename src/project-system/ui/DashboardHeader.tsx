import { useRef, useState } from 'react';
import { Search, Plus, ArrowUpDown, Upload } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import type { SortField } from '../hooks/useProjectStore';
import { FFX_EXTENSION } from '../services/ffx';

interface Props {
  onCreateNew: () => void;
}

export function DashboardHeader({ onCreateNew }: Props) {
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const sortField = useProjectStore((s) => s.sortField);
  const setSortField = useProjectStore((s) => s.setSortField);
  const sortDirection = useProjectStore((s) => s.sortDirection);
  const setSortDirection = useProjectStore((s) => s.setSortDirection);
  const importProject = useProjectStore((s) => s.importProject);
  const openProject = useProjectStore((s) => s.openProject);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const metadata = await importProject(file);
      await openProject(metadata.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import project');
    } finally {
      setImporting(false);
    }
  };

  return (
    <header className="flex-shrink-0 h-11 border-b border-[#1c2433] bg-[#0d1219] flex items-center px-4 gap-3">
      {/* Page title */}
      <span className="text-[13px] font-medium text-slate-200 mr-2">Recents</span>

      {/* Search */}
      <div className="flex-1 max-w-xs relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-7 pr-2.5 py-[5px] bg-[#141c28] border border-[#1c2433] rounded-md text-[11px] text-slate-300 placeholder:text-slate-600 focus:border-[#f7b500]/40 focus:outline-none transition-all"
        />
      </div>

      <div className="flex-1" />

      {/* Sort controls */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown size={11} className="text-slate-500" />
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className="bg-[#141c28] border border-[#1c2433] rounded text-[10px] text-slate-400 px-1.5 py-1 focus:outline-none cursor-pointer"
        >
          <option value="modifiedAt">Last viewed</option>
          <option value="createdAt">Created</option>
          <option value="name">Name</option>
        </select>
        <button
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          className="px-1.5 py-1 bg-[#141c28] border border-[#1c2433] rounded text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </button>
      </div>

      {/* Import button */}
      <input
        ref={fileInputRef}
        type="file"
        accept={`.${FFX_EXTENSION}`}
        className="hidden"
        onChange={handleImportFile}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-1.5 px-2.5 py-[5px] bg-[#141c28] border border-[#1c2433] hover:border-[#2a3548] text-slate-400 hover:text-slate-200 text-[11px] font-medium rounded-md transition-all disabled:opacity-50"
      >
        <Upload size={11} />
        <span>{importing ? 'Importing...' : 'Import'}</span>
      </button>

      {/* Create button */}
      <button
        onClick={onCreateNew}
        className="flex items-center gap-1.5 px-3 py-[5px] bg-[#f7b500] hover:bg-[#ffc83d] text-[#0a0f16] text-[11px] font-semibold rounded-md transition-colors"
      >
        <Plus size={12} strokeWidth={2.5} />
        <span>New</span>
      </button>
    </header>
  );
}
