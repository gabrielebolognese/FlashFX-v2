import { useMemo } from 'react';
import { Plus, Film } from 'lucide-react';
import { useProjectStore } from '../hooks/useProjectStore';
import { ProjectCardComponent } from './ProjectCard';

interface Props {
  onCreateNew: () => void;
}

export function ProjectGrid({ onCreateNew }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const sortField = useProjectStore((s) => s.sortField);
  const sortDirection = useProjectStore((s) => s.sortDirection);

  const filteredAndSorted = useMemo(() => {
    let filtered = projects;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = projects.filter((p) =>
        p.metadata.name.toLowerCase().includes(q)
      );
    }

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.metadata.name.localeCompare(b.metadata.name);
      } else if (sortField === 'modifiedAt') {
        cmp = a.metadata.modifiedAt - b.metadata.modifiedAt;
      } else {
        cmp = a.metadata.createdAt - b.metadata.createdAt;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [projects, searchQuery, sortField, sortDirection]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <div className="w-14 h-14 rounded-xl bg-[#141c28] border border-[#1c2433] flex items-center justify-center">
          <Film size={24} className="text-slate-600" />
        </div>
        <div className="text-center">
          <h2 className="text-[13px] text-slate-300 font-medium mb-0.5">No projects yet</h2>
          <p className="text-[11px] text-slate-500">Create your first project to get started</p>
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1.5 px-3.5 py-[6px] bg-[#f7b500] hover:bg-[#ffc83d] text-[#0a0f16] text-[11px] font-semibold rounded-md transition-colors"
        >
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
