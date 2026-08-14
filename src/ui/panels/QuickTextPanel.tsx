import { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useQuickTextStore } from '../../store/quickText';
import { useEditorStore } from '../../store/editor';
import { FONT_MANIFEST } from '../../engine/fonts';
import { useCustomFontStore } from '../../engine/customFonts';

// Fast-text panel: opened by Shift-placing with the text tool. A compact, non-modal popover to
// write the text, pick a font, choose a quick entrance preset + granularity, and place it — all
// wired to the existing preset / text-explode engine via placeQuickText.

type Granularity = 'whole' | 'word' | 'character';

const PRESETS: { label: string; id: string | null }[] = [
  { label: 'None', id: null },
  { label: 'Fade In', id: 'fade-in' },
  { label: 'Slide ↓', id: 'fade-slide-down' },
  { label: 'Slide ↑', id: 'fade-slide-up' },
  { label: 'Slide →', id: 'fade-slide-left' },
  { label: 'Slide ←', id: 'fade-slide-right' },
  { label: 'Pop', id: 'pop-in' },
];

const GRANULARITIES: { label: string; value: Granularity }[] = [
  { label: 'Whole', value: 'whole' },
  { label: 'Per word', value: 'word' },
  { label: 'Per char', value: 'character' },
];

const FONT_CATEGORY_ORDER = ['Sans', 'Display', 'Serif', 'Mono', 'System'] as const;

export function QuickTextPanel() {
  const target = useQuickTextStore((s) => s.target);
  const close = useQuickTextStore((s) => s.close);
  const updateTextLive = useEditorStore((s) => s.updateTextLive);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const placeQuickText = useEditorStore((s) => s.placeQuickText);
  const customFonts = useCustomFontStore((s) => s.fonts);

  const layer = useEditorStore((s) =>
    target ? s.composition.layers.find((l) => l.id === target.layerId) : undefined,
  );

  const [text, setText] = useState('modify this');
  const [preset, setPreset] = useState<string | null>('fade-slide-up');
  const [gran, setGran] = useState<Granularity>('whole');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const font = layer?.type === 'text' ? layer.content.spans[0]?.style.fontFamily ?? 'Inter' : 'Inter';

  // Reset + focus each time a new quick text is placed.
  useEffect(() => {
    if (!target) return;
    setText('modify this');
    setPreset('fade-slide-up');
    setGran('whole');
    const el = inputRef.current;
    if (el) { el.focus(); el.select(); }
  }, [target?.layerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target || !layer || layer.type !== 'text') return null;

  const customFamilies = Array.from(new Set(customFonts.map((f) => f.family)));
  const left = Math.min(target.x, window.innerWidth - 268);
  const top = Math.min(target.y, window.innerHeight - 340);

  const commitText = (v: string) => { setText(v); updateTextLive(target.layerId, v); };
  const place = () => {
    // Bake the final text into history, then animate via the existing preset / explode engine.
    updateLayerProperty(target.layerId, 'content.spans[0].text', text.length ? text : 'modify this');
    placeQuickText(target.layerId, { presetId: preset, granularity: gran });
    close();
  };

  return (
    <div
      className="fixed z-[80] w-[256px] rounded-lg border border-[#26364f] bg-[#0d1524] shadow-2xl shadow-black/50 select-none"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-hairline">
        <Sparkles size={12} className="text-accent" />
        <span className="text-[11px] font-semibold text-slate-200">Fast text</span>
        <button title="Close" className="ml-auto p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={close}><X size={12} /></button>
      </div>

      <div className="p-2.5 space-y-2.5">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => commitText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); place(); } }}
          rows={2}
          className="w-full resize-none rounded bg-[#0e1726] border border-hairline focus:border-hairline text-[12px] text-slate-100 px-2 py-1.5 outline-none"
          placeholder="Type your text…"
        />

        {/* Font */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-slate-500 w-10 flex-shrink-0">Font</label>
          <select
            value={font}
            onChange={(e) => updateLayerProperty(target.layerId, 'content.spans[0].style.fontFamily', e.target.value)}
            className="flex-1 min-w-0 bg-surface-3 text-[10px] text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
          >
            {FONT_CATEGORY_ORDER.map((cat) => {
              const fams = FONT_MANIFEST.filter((f) => f.category === cat).map((f) => f.family);
              return fams.length ? (
                <optgroup key={cat} label={cat}>
                  {fams.map((f) => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              ) : null;
            })}
            {customFamilies.length > 0 && (
              <optgroup label="Custom">
                {customFamilies.map((f) => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {/* Preset */}
        <div>
          <div className="text-[10px] text-slate-500 mb-1">Animation</div>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPreset(p.id)}
                className={`px-2 h-6 rounded text-[10.5px] border transition-colors ${
                  preset === p.id
                    ? 'bg-accent text-on-accent border-accent font-medium'
                    : 'bg-surface-3 text-slate-300 border-hairline hover:border-hairline'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Granularity (only meaningful when animating) */}
        <div className={preset ? '' : 'opacity-40 pointer-events-none'}>
          <div className="text-[10px] text-slate-500 mb-1">Apply to</div>
          <div className="flex rounded border border-hairline overflow-hidden">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGran(g.value)}
                className={`flex-1 h-6 text-[10.5px] transition-colors ${
                  gran === g.value ? 'bg-[#1c2c46] text-slate-100' : 'bg-[#0e1726] text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={place}
          className="w-full h-8 rounded-md bg-accent hover:bg-[#ffc21a] text-on-accent text-[12px] font-semibold transition-colors"
        >
          {preset ? 'Place Animated Text' : 'Place Text'}
        </button>
      </div>
    </div>
  );
}
