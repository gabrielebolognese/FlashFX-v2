import { useMemo, useState } from 'react';
import { Plus, Sparkles, ListVideo } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { ANIMATION_TEMPLATES, CATEGORY_LABELS } from '../../animation-templates/catalog';
import type { TemplateCategory } from '../../animation-templates/types';

// Phase-1 gallery: browse the animation templates and click "Use this" to drop a fully-keyframed
// animation onto the timeline at the playhead. Static cards for now; live Canvas2D previews land in
// Phase 2.

type Filter = 'all' | TemplateCategory;

export function AnimationTemplatesTab() {
  const insert = useEditorStore((s) => s.insertAnimationTemplate);
  const insertAll = useEditorStore((s) => s.insertAllAnimationTemplates);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    const present = new Set(ANIMATION_TEMPLATES.map((t) => t.category));
    return (Object.keys(CATEGORY_LABELS) as TemplateCategory[]).filter((c) => present.has(c));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANIMATION_TEMPLATES.filter((t) => {
      if (filter !== 'all' && t.category !== filter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q));
    });
  }, [filter, query]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="p-2 flex-shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search animations…"
          className="w-full h-7 px-2 rounded bg-[#0b1220] border border-[#1a2a42] text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#2a3a52]"
        />
      </div>

      {/* Category chips */}
      <div className="px-2 pb-2 flex flex-wrap gap-1 flex-shrink-0">
        {(['all', ...categories] as Filter[]).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              filter === c ? 'bg-[#f7b500]/15 text-[#f7b500]' : 'bg-[#0e1c32] text-slate-400 hover:text-slate-200'
            }`}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-2">
        {shown.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-8">No animations match.</div>
        )}
        {shown.map((t) => (
          <div key={t.id} className="rounded-lg bg-[#0b1524] border border-[#1a2a42] overflow-hidden">
            <div className="h-20 flex items-center justify-center bg-gradient-to-br from-[#0e1c32] to-[#0a1220] text-slate-600">
              <Sparkles size={22} />
            </div>
            <div className="p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-slate-100 truncate">{t.name}</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wide flex-shrink-0">{CATEGORY_LABELS[t.category]}</span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500 line-clamp-2">{t.description}</p>
              <button
                onClick={() => insert(t.id)}
                className="mt-2 w-full h-7 flex items-center justify-center gap-1 rounded bg-[#f7b500] hover:bg-[#ffc21a] text-[#0e1c32] text-[11px] font-semibold transition-colors"
              >
                <Plus size={12} /> Use this
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Always-visible footer: drop every animation onto the timeline back-to-back. */}
      <div className="flex-shrink-0 p-2 border-t border-[#1a2a42] bg-[#0b1220]">
        <button
          onClick={() => insertAll()}
          title="Insert all animations in sequence, one after another"
          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-md bg-[#122240] hover:bg-[#1a2f52] text-slate-100 text-[12px] font-semibold border border-[#26405f] transition-colors"
        >
          <ListVideo size={14} /> All ({ANIMATION_TEMPLATES.length}) → timeline
        </button>
      </div>
    </div>
  );
}
