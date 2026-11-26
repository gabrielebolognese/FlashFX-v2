import type { TextLayer, TextSpanStyle, Vec4 } from '../../core/types';
import { wordRanges } from '../../core/textRuns';
import { FONT_MANIFEST } from '../../engine/fonts';
import { useEditorStore } from '../../store/editor';

// "Accent word": set ONE word of a text in its own face / colour (the kinetic-title look where one
// word of each phrase is an italic serif). Writes through the undoable editor.styleTextWord /
// clearTextStyles actions; the renderer draws mixed styles via the per-glyph stamp path (single-line,
// multi-line and wrapped text alike).

const DEFAULT_ACCENT_FAMILY = 'Playfair Display';
const FAMILIES = FONT_MANIFEST.map((f) => f.family);

const toHex = (c: Vec4): string => `#${[c[0], c[1], c[2]].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (hex: string, alpha: number): Vec4 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
};

/** The accent the text currently has: the first span that draws differently from the base span. */
function currentAccent(layer: TextLayer): { wordIndex: number; style: TextSpanStyle } | null {
  const spans = layer.content.spans;
  const base = spans[0]?.style;
  if (!base || spans.length < 2) return null;
  let pos = 0;
  for (const s of spans) {
    const differs = s.style.fontFamily !== base.fontFamily || s.style.fontStyle !== base.fontStyle
      || s.style.fontWeight !== base.fontWeight || s.style.color.some((v, i) => v !== base.color[i]);
    if (differs && s.text.trim() !== '') {
      const raw = spans.map((x) => x.text).join('');
      const idx = wordRanges(raw).findIndex((w) => pos + s.text.search(/\S/) >= w.start && pos + s.text.search(/\S/) < w.end);
      return idx >= 0 ? { wordIndex: idx, style: s.style } : null;
    }
    pos += s.text.length;
  }
  return null;
}

export function TextAccentRow({ layer }: { layer: TextLayer }) {
  const styleTextWord = useEditorStore((s) => s.styleTextWord);
  const clearTextStyles = useEditorStore((s) => s.clearTextStyles);
  const raw = layer.content.spans.map((s) => s.text).join('');
  const words = wordRanges(raw);
  const accent = currentAccent(layer);
  const base = layer.content.spans[0]?.style;
  if (!base || words.length < 2) return null;

  const family = accent?.style.fontFamily ?? DEFAULT_ACCENT_FAMILY;
  const italic = accent ? accent.style.fontStyle === 'italic' : true;
  const color = accent?.style.color ?? base.color;
  const apply = (wordIndex: number, patch: { fontFamily?: string; fontStyle?: 'normal' | 'italic'; color?: Vec4 }) =>
    styleTextWord(layer.id, wordIndex, { fontFamily: family, fontStyle: italic ? 'italic' : 'normal', color, ...patch }, true);

  return (
    <div className="flex flex-col gap-1" title="Set one word in its own font / colour">
      <div className="flex items-center gap-1">
        <label className="text-caption text-slate-500 w-14 flex-shrink-0">Accent</label>
        <select
          value={accent ? String(accent.wordIndex) : ''}
          onChange={(e) => (e.target.value === '' ? clearTextStyles(layer.id) : apply(Number(e.target.value), {}))}
          className="flex-1 min-w-0 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
        >
          <option value="">No accent word</option>
          {words.map((w, i) => (<option key={`${i}-${w.word}`} value={i}>{w.word}</option>))}
        </select>
      </div>
      {accent && (
        <div className="flex items-center gap-1 pl-[3.75rem]">
          <select
            value={family}
            onChange={(e) => apply(accent.wordIndex, { fontFamily: e.target.value })}
            className="flex-1 min-w-0 bg-surface-3 text-caption text-slate-300 px-1 py-0.5 rounded border border-hairline outline-none"
          >
            {FAMILIES.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
          <button
            onClick={() => apply(accent.wordIndex, { fontStyle: italic ? 'normal' : 'italic' })}
            className={`px-1.5 py-0.5 text-[9px] rounded italic ${italic ? 'bg-accent-wash text-accent' : 'bg-surface-3 text-slate-500 hover:text-slate-300'}`}
          >
            I
          </button>
          <input
            type="color"
            value={toHex(color)}
            onChange={(e) => apply(accent.wordIndex, { color: fromHex(e.target.value, color[3] ?? 1) })}
            className="h-5 w-6 cursor-pointer rounded border border-hairline bg-transparent"
          />
        </div>
      )}
    </div>
  );
}
