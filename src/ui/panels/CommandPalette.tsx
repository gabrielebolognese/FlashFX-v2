import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useCommandPaletteStore } from '../commands/store';
import { buildCommands, type Command } from '../commands/registry';
import { rankItems } from '../commands/fuzzy';

// Ctrl/Cmd+K command palette: a top-anchored, fuzzy-searchable list of every command,
// showing its shortcut. Empty query shows recents first. ↑↓ navigate, Enter runs,
// Esc closes. Opening/closing is driven by useCommandPaletteStore (App wires the key).

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const close = useCommandPaletteStore((s) => s.closePalette);
  const recents = useCommandPaletteStore((s) => s.recents);
  const recordUse = useCommandPaletteStore((s) => s.recordUse);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => buildCommands(), []);
  const byId = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);

  // Empty query → recents first, then the rest (registry order). Non-empty → ranked.
  const { list, recentCount } = useMemo(() => {
    if (query.trim() === '') {
      const rc = recents.map((id) => byId.get(id)).filter((c): c is Command => !!c);
      const seen = new Set(rc.map((c) => c.id));
      return { list: [...rc, ...commands.filter((c) => !seen.has(c.id))], recentCount: rc.length };
    }
    return { list: rankItems(query, commands), recentCount: 0 };
  }, [query, commands, byId, recents]);

  // Reset on open; refocus input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the active index valid + scrolled into view.
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, list.length - 1))); }, [list.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runAt = (i: number) => {
    const c = list[i];
    if (!c) return;
    close();
    recordUse(c.id);
    // Run after the palette closes so focus/selection is back on the canvas.
    requestAnimationFrame(() => c.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % Math.max(1, list.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + list.length) % Math.max(1, list.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] bg-black/40"
      onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-[min(640px,92vw)] max-h-[70vh] flex flex-col rounded-xl overflow-hidden bg-[#0e1c32] border border-[#243a5c] shadow-2xl">
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[#1a2a42]">
          <Search size={15} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search commands…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            spellCheck={false}
          />
        </div>

        <div ref={listRef} className="overflow-y-auto py-1">
          {list.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">No matching commands</div>
          )}
          {list.map((c, i) => (
            <div key={c.id}>
              {recentCount > 0 && i === 0 && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-slate-600">Recent</div>
              )}
              {recentCount > 0 && i === recentCount && (
                <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-slate-600">All Commands</div>
              )}
              <button
                data-idx={i}
                onPointerEnter={() => setActive(i)}
                onClick={() => runAt(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left ${
                  i === active ? 'bg-[#1c3155]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-[13px] text-slate-200 flex-1 truncate">{c.label}</span>
                <span className="text-[10px] text-slate-500 shrink-0">{c.category}</span>
                {c.shortcut && (
                  <span className="ml-1 shrink-0 text-[10px] font-mono text-slate-400 bg-[#0a1526] border border-[#243a5c] rounded px-1.5 py-0.5">
                    {c.shortcut}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
