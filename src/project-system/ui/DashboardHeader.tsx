import { useRef, useState } from 'react';
import { Search, Plus, ArrowUpDown, Upload, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import type { SortField } from '../hooks/useProjectStore';
import { FFX_EXTENSION } from '../services/ffx';
import { FlashFXLogo } from '../../ui/components/FlashFXLogo';
import { useAuthStore } from '../../auth/store';
import { useCloudSyncStore } from '../services/cloudSync';
import { AccountSettingsModal } from '../../auth/AccountSettingsModal';

interface Props {
  onCreateNew: () => void;
  /** Section title shown at the left (defaults to "Recents"). */
  title?: string;
  /** Hide the project sort controls (e.g. on the Templates tab). */
  showSort?: boolean;
}

export function DashboardHeader({ onCreateNew, title = 'Recents', showSort = true }: Props) {
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const sortField = useProjectStore((s) => s.sortField);
  const setSortField = useProjectStore((s) => s.setSortField);
  const sortDirection = useProjectStore((s) => s.sortDirection);
  const setSortDirection = useProjectStore((s) => s.setSortDirection);
  const importProject = useProjectStore((s) => s.importProject);
  const openProject = useProjectStore((s) => s.openProject);

  const authStatus = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const initials = ((user?.displayName || user?.email || '?').trim()[0] ?? '?').toUpperCase();

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
      {/* Brand */}
      <a href="https://flashfx.app" title="FlashFX" className="mr-2 flex items-center">
        <FlashFXLogo size={20} />
      </a>
      {/* Page title */}
      <span className="text-[13px] font-medium text-slate-200 mr-2">{title}</span>

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
      {showSort && (
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
      )}

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

      {/* Cloud sync status */}
      {authStatus === 'signed-in' && <CloudStatus />}

      {/* Account avatar → settings */}
      {authStatus === 'signed-in' && (
        <button
          onClick={() => setShowAccount(true)}
          title="Account settings"
          className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#2a3548] bg-[#141c28] text-[11px] font-semibold text-slate-200 transition-colors hover:border-[#f7b500]/50"
        >
          {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
        </button>
      )}
      {showAccount && <AccountSettingsModal onClose={() => setShowAccount(false)} />}
    </header>
  );
}

function CloudStatus() {
  const status = useCloudSyncStore((s) => s.status);
  const lastSyncedAt = useCloudSyncStore((s) => s.lastSyncedAt);
  const mediaCapped = useCloudSyncStore((s) => s.mediaCapped);
  const title =
    mediaCapped ? 'Cloud storage full — some media isn’t synced. Upgrade for more space.'
    : status === 'syncing' ? 'Syncing to cloud…'
    : status === 'error' ? 'Cloud sync unavailable — your work is saved on this device'
    : lastSyncedAt ? 'Projects synced to your account'
    : 'Cloud sync';
  return (
    <span title={title} className="flex h-7 w-7 items-center justify-center">
      {status === 'syncing' ? <Loader2 size={13} className="animate-spin text-slate-400" />
        : mediaCapped ? <CloudOff size={13} className="text-amber-500/80" />
        : status === 'error' ? <CloudOff size={13} className="text-amber-500/80" />
        : status === 'synced' ? <Cloud size={13} className="text-emerald-500/80" />
        : <Cloud size={13} className="text-slate-600" />}
    </span>
  );
}
