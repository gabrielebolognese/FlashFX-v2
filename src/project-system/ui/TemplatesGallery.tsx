import { useState } from 'react';
import { Play, Film, Loader2 } from 'lucide-react';
import { ANIMATION_TEMPLATES, CATEGORY_LABELS } from '../../animation-templates/catalog';
import type { AnimationTemplate } from '../../animation-templates/types';
import { useProjectStore } from '../hooks/useProjectStore';
import { launchAnimationTemplate } from '../../templates/launch';

// Dashboard "Templates" tab: the animation-template library as project cards. "Start with this"
// creates a NEW project seeded with that template and opens the editor (so it also lands in
// Recents, like any project). Search (the header box) filters across name/description/tags.

// Deterministic hue per template id → a stable, varied preview gradient (no thumbnails to store).
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function TemplatesGallery() {
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const [starting, setStarting] = useState<string | null>(null);

  const q = searchQuery.trim().toLowerCase();
  const items = q
    ? ANIMATION_TEMPLATES.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)))
    : ANIMATION_TEMPLATES;

  const start = async (id: string) => {
    if (starting) return;
    setStarting(id);
    try {
      await launchAnimationTemplate(id);
    } catch (err) {
      console.error('[templates] launch failed', err);
      setStarting(null); // on success the view switches to the editor and this unmounts
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[40vh] gap-2">
        <p className="text-[12px] text-slate-500">No templates match "{searchQuery}"</p>
      </div>
    );
  }

  // Preserve catalog order; group into category sections.
  const cats: string[] = [];
  const byCat = new Map<string, AnimationTemplate[]>();
  for (const t of items) {
    if (!byCat.has(t.category)) { byCat.set(t.category, []); cats.push(t.category); }
    byCat.get(t.category)!.push(t);
  }

  return (
    <div className="pt-5 space-y-7">
      <p className="text-[11px] text-slate-500 -mb-2">
        Pick a starting point — we'll create a new project from it and open the editor.
      </p>
      {cats.map((cat) => (
        <section key={cat}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {byCat.get(cat)!.map((tpl) => (
              <TemplateCard key={tpl.id} tpl={tpl} busy={starting === tpl.id} disabled={!!starting} onStart={() => start(tpl.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TemplateCard({ tpl, busy, disabled, onStart }: { tpl: AnimationTemplate; busy: boolean; disabled: boolean; onStart: () => void }) {
  const h = hueOf(tpl.id);
  const seconds = Math.round(tpl.durationFrames / tpl.authorFps);
  return (
    <div className="group relative flex flex-col rounded-lg overflow-hidden bg-[#111821] border border-[#1c2433] hover:border-[#2a3a50] transition-all duration-150 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
      {/* Preview (click to start) — deterministic gradient with the template name. */}
      <button
        onClick={onStart}
        disabled={disabled}
        className="aspect-[16/10] relative overflow-hidden text-left cursor-pointer disabled:cursor-default"
        style={{ background: `linear-gradient(135deg, hsl(${h} 58% 24%), hsl(${(h + 42) % 360} 62% 12%))` }}
        title={`Start with “${tpl.name}”`}
      >
        <span className="absolute inset-0 flex items-center justify-center">
          {busy
            ? <Loader2 size={22} className="text-white/90 animate-spin" />
            : <Play size={26} className="text-white/85 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="currentColor" />}
        </span>
        <span className="absolute bottom-2 left-2.5 right-2.5 text-[12px] font-semibold text-white/95 leading-tight truncate drop-shadow">
          {tpl.name}
        </span>
        <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 backdrop-blur-sm">
          <Film size={9} className="text-slate-200" />
          <span className="text-[8px] text-slate-200 font-medium uppercase tracking-wide">{seconds}s</span>
        </span>
      </button>

      {/* Info + action */}
      <div className="px-3 py-2.5">
        <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 min-h-[26px]">{tpl.description}</p>
        <button
          onClick={onStart}
          disabled={disabled}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2.5 py-[6px] bg-[#f7b500] hover:bg-[#ffc83d] text-[#0a0f16] text-[11px] font-semibold rounded-md transition-colors disabled:opacity-60"
        >
          {busy ? <><Loader2 size={11} className="animate-spin" /> Opening…</> : <><Play size={11} fill="currentColor" /> Start with this</>}
        </button>
      </div>
    </div>
  );
}
