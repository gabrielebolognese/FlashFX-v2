import { useEffect, useState } from 'react';
import { useProjectStore } from '../hooks/useProjectStore';
import { ProjectGrid } from './ProjectGrid';
import { DashboardHeader } from './DashboardHeader';
import { CreateProjectModal } from './CreateProjectModal';
import { Clock, FolderOpen, Star, Trash2, Film } from 'lucide-react';

type NavSection = 'recents' | 'all' | 'starred' | 'trash';

export function Dashboard() {
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const loading = useProjectStore((s) => s.loading);
  const [showCreate, setShowCreate] = useState(false);
  const [activeNav, setActiveNav] = useState<NavSection>('recents');

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const navItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'recents', label: 'Recents', icon: <Clock size={14} /> },
    { id: 'all', label: 'All Projects', icon: <FolderOpen size={14} /> },
    { id: 'starred', label: 'Starred', icon: <Star size={14} /> },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={14} /> },
  ];

  return (
    <div className="h-screen w-screen bg-[#0a0f16] text-slate-200 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 bg-[#0d1219] border-r border-[#1c2433] flex flex-col">
        {/* Logo */}
        <div className="h-11 flex items-center gap-2 px-4 border-b border-[#1c2433]">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-[#f7b500] to-[#e09000] flex items-center justify-center">
            <span className="text-[#0a0f16] text-[9px] font-bold leading-none">F</span>
          </div>
          <span className="text-xs font-semibold text-slate-200 tracking-tight">FlashFX</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-md text-[12px] font-medium transition-colors ${
                activeNav === item.id
                  ? 'bg-[#1a2233] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#141c28]'
              }`}
            >
              <span className={activeNav === item.id ? 'text-[#f7b500]' : 'text-slate-500'}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-[#1c2433]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Film size={12} className="text-slate-500" />
            <span className="text-[11px] text-slate-500">Motion Graphics Editor</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader onCreateNew={() => setShowCreate(true)} />

        <main className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-5 h-5 border-[1.5px] border-[#f7b500]/30 border-t-[#f7b500] rounded-full animate-spin" />
            </div>
          ) : (
            <ProjectGrid onCreateNew={() => setShowCreate(true)} />
          )}
        </main>
      </div>

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
