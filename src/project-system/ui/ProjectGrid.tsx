import { useMemo } from 'react';
import { Plus, Film, Star, Trash2 } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import { ProjectCardComponent } from './ProjectCard';

export type ProjectSection = 'recents' | 'all' | 'starred' | 'trash';

interface Props {
  section: ProjectSection;
  onCreateNew: () => void;
}

export function ProjectGrid({ section, onCreateNew }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const sortField = useProjectStore((s) => s.sortField);
  const sortDirection = useProjectStore((s) => s.sortDirection);

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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pt-5">
      {filteredAndSorted.map((card) => (
        <ProjectCardComponent key={card.metadata.id} card={card} />
      ))}
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
