import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import type { TextLayer, TextAnimator, TextAnimatorDelta, TextSplitMode, TextDecode, TextPathBinding, Vec2 } from '../../core/types';
import type { SelectorShape } from '../../text/rangeSelector';
import { createProperty, createKeyframe } from '../../core/factory';
import { TEXT_ANIMATOR_PRESETS, createTextDecode } from '../../core/textAnimatorPresets';
import { useEditorStore } from '../../store/editor';

// Full per-character text-animator editor: split mode, the transform deltas each unit animates by,
// the range selector (shape/window/ease/amount/randomize), and reveal timing (which keyframes the
// selector offset). Writes the whole `animators` array back through the undoable updateLayerProperty.

const SPLITS: { id: TextSplitMode; label: string }[] = [
  { id: 'character', label: 'Char' },
  { id: 'word', label: 'Word' },
  { id: 'line', label: 'Line' },
];

const SHAPES: { id: SelectorShape; label: string }[] = [
  { id: 'rampUp', label: 'Ramp up' },
  { id: 'rampDown', label: 'Ramp down' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'round', label: 'Round' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'square', label: 'Square' },
];

export function TextAnimatorsSection({ layer, updateLayerProperty }: {
  layer: TextLayer;
  updateLayerProperty: (layerId: string, path: string, value: unknown) => void;
}) {
  const animators = layer.animators ?? [];
  const [open, setOpen] = useState<number | null>(animators.length ? 0 : null);
  const write = (next: TextAnimator[]) => updateLayerProperty(layer.id, 'animators', next);

  const addPreset = (build: (s?: number, d?: number) => TextAnimator) => {
    write([...animators, build(0, 30)]);
    setOpen(animators.length);
  };
  const update = (i: number, a: TextAnimator) => write(animators.map((x, j) => (j === i ? a : x)));
  const remove = (i: number) => { write(animators.filter((_, j) => j !== i)); setOpen(null); };

  return (
    <div className="border-t border-hairline px-3 py-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Animators</div>
      {animators.length === 0 && (
        <p className="mb-2 text-[10.5px] leading-snug text-slate-600">Per-character animation (single-line text).</p>
      )}

      <div className="space-y-1.5">
        {animators.map((a, i) => (
          <div key={i} className="overflow-hidden rounded-md border border-hairline bg-surface-1">
            <div className="flex items-center gap-2 px-2 py-1">
              <button
                type="button"
                title="Enable / disable"
                onClick={() => update(i, { ...a, enabled: !a.enabled })}
                className={`h-3 w-3 flex-shrink-0 rounded-sm border ${a.enabled ? 'border-accent bg-accent' : 'border-hairline'}`}
              />
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex flex-1 items-center gap-1 text-left text-[11px] text-slate-300">
                {open === i ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Animator {i + 1} · {a.splitMode}
              </button>
              <button type="button" title="Remove" onClick={() => remove(i)} className="text-[12px] leading-none text-slate-500 hover:text-danger">✕</button>
            </div>
            {open === i && <Editor animator={a} onChange={(next) => update(i, next)} />}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEXT_ANIMATOR_PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => addPreset(p.build)} className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-[10.5px] text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100">
            <Plus size={11} /> {p.label}
          </button>
        ))}
      </div>

      <DecodeSection layer={layer} updateLayerProperty={updateLayerProperty} />
      <TextPathSection layer={layer} updateLayerProperty={updateLayerProperty} />
    </div>
  );
}

// Text on a path (B9b) — flow glyphs along a MotionPath (interpreted in the layer's local space).
// Single-line text; exact placement is browser-eyeballed like all text stamps.
function TextPathSection({ layer, updateLayerProperty }: {
  layer: TextLayer;
  updateLayerProperty: (layerId: string, path: string, value: unknown) => void;
}) {
  const composition = useEditorStore((s) => s.composition);
  const paths = composition.motionPaths ?? [];
  const bind = layer.textPath;
  const on = !!bind?.enabled;
  const set = (next: TextPathBinding) => updateLayerProperty(layer.id, 'textPath', next);
  const labelFor = (pid: string, layerId: string) => {
    const owner = composition.layers.find((l) => l.id === layerId);
    return owner ? `${owner.name} path` : `Path ${pid.slice(0, 4)}`;
  };
  const toggle = () => {
    if (bind) { set({ ...bind, enabled: !bind.enabled }); return; }
    set({ enabled: true, pathId: paths[0]?.id ?? '', align: true, margin: 0 });
  };

  return (
    <div className="mt-2 border-t border-hairline pt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Enable / disable text on a path"
          onClick={toggle}
          className={`h-3 w-3 flex-shrink-0 rounded-sm border ${on ? 'border-accent bg-accent' : 'border-hairline'}`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Text on path</span>
      </div>
      {on && bind && (
        <div className="mt-1.5 space-y-0.5">
          {paths.length === 0 ? (
            <p className="text-[9.5px] leading-snug text-slate-600">No motion paths yet — draw one with the motion-path tool, then pick it here.</p>
          ) : (
            <>
              <Field label="Path">
                <select
                  value={bind.pathId}
                  onChange={(e) => set({ ...bind, pathId: e.target.value })}
                  className="rounded border border-hairline bg-[#0e1726] px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none"
                >
                  {paths.map((p) => <option key={p.id} value={p.id}>{labelFor(p.id, p.layerId)}</option>)}
                </select>
              </Field>
              <Field label="Margin (px)"><Num value={bind.margin} onChange={(v) => set({ ...bind, margin: v })} /></Field>
              <Field label="Align to path">
                <button type="button" onClick={() => set({ ...bind, align: !bind.align })} className={`h-3 w-3 rounded-sm border ${bind.align ? 'border-accent bg-accent' : 'border-hairline'}`} />
              </Field>
              <p className="text-[9.5px] leading-snug text-slate-600">Glyphs flow along the path (layer-local); align rotates each to the tangent.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Text Decode / scramble (B9) — reveal timing keyframes `decode.progress` 0→1 (like the animator
// reveal), plus flicker speed + seed + scramble alphabet. Writes via the undoable updateLayerProperty.
function DecodeSection({ layer, updateLayerProperty }: {
  layer: TextLayer;
  updateLayerProperty: (layerId: string, path: string, value: unknown) => void;
}) {
  const decode = layer.decode;
  const on = !!decode?.enabled;
  const set = (next: TextDecode) => updateLayerProperty(layer.id, 'decode', next);
  const toggle = () => set(decode ? { ...decode, enabled: !decode.enabled } : createTextDecode(0, 30));

  const kfs = decode?.progress.keyframes ?? [];
  const startF = kfs[0]?.frame ?? 0;
  const endF = kfs[kfs.length - 1]?.frame ?? 30;
  const dur = Math.max(1, endF - startF);
  const setTiming = (s: number, len: number) => {
    if (!decode) return;
    const progress = createProperty('Decode Progress', 'number', 0);
    progress.keyframes = [createKeyframe(s, 0), createKeyframe(s + Math.max(1, len), 1)];
    set({ ...decode, progress });
  };

  return (
    <div className="mt-2 border-t border-hairline pt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Enable / disable decode"
          onClick={toggle}
          className={`h-3 w-3 flex-shrink-0 rounded-sm border ${on ? 'border-accent bg-accent' : 'border-hairline'}`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Decode (scramble)</span>
      </div>
      {on && decode && (
        <div className="mt-1.5 space-y-0.5">
          <Field label="Start (frame)"><Num value={startF} onChange={(v) => setTiming(Math.round(v), dur)} /></Field>
          <Field label="Duration (frames)"><Num value={dur} onChange={(v) => setTiming(startF, Math.round(v))} /></Field>
          <Field label="Flicker (frames)"><Num value={decode.scrambleHold} min={1} onChange={(v) => set({ ...decode, scrambleHold: Math.max(1, Math.round(v)) })} /></Field>
          <Field label="Seed">
            <Num value={decode.seed} onChange={(v) => set({ ...decode, seed: Math.round(v) })} width="w-16" />
            <button type="button" title="Reseed" onClick={() => set({ ...decode, seed: (decode.seed * 1664525 + 1013904223) >>> 0 })} className="text-slate-500 hover:text-slate-200"><RotateCcw size={11} /></button>
          </Field>
          <Field label="Charset">
            <input
              type="text"
              value={decode.charset}
              onChange={(e) => set({ ...decode, charset: e.target.value })}
              className="w-32 rounded border border-hairline bg-[#0e1726] px-1.5 py-0.5 text-[10px] text-slate-200 focus:border-accent focus:outline-none"
            />
          </Field>
          <p className="text-[9.5px] leading-snug text-slate-600">Glyphs flicker through the charset, locking left→right over the reveal. Single-line text.</p>
        </div>
      )}
    </div>
  );
}

function Editor({ animator, onChange }: { animator: TextAnimator; onChange: (a: TextAnimator) => void }) {
  const sel = animator.selector;
  const d = animator.delta;
  const pos: Vec2 = d.position ?? [0, 0];
  const scl: Vec2 = d.scale ?? [0, 0];

  const setSel = (patch: Partial<typeof sel>) => onChange({ ...animator, selector: { ...sel, ...patch } });
  const setDelta = (patch: TextAnimatorDelta) => onChange({ ...animator, delta: { ...d, ...patch } });

  // Reveal timing lives in the keyframed `offset`. Derive start/duration from its two keyframes.
  const kfs = animator.offset?.keyframes ?? [];
  const startF = kfs[0]?.frame ?? 0;
  const endF = kfs[kfs.length - 1]?.frame ?? 30;
  const dur = Math.max(1, endF - startF);
  const from = (kfs[0]?.value as number | undefined) ?? -0.2;
  const to = (kfs[kfs.length - 1]?.value as number | undefined) ?? 1;
  const setTiming = (s: number, len: number) => {
    const off = createProperty('Animator Offset', 'number', 0);
    off.keyframes = [createKeyframe(s, from), createKeyframe(s + Math.max(1, len), to)];
    onChange({ ...animator, offset: off });
  };

  return (
    <div className="space-y-2.5 border-t border-hairline bg-[#0b1320] px-2.5 py-2">
      <Group title="Split">
        <Seg options={SPLITS} value={animator.splitMode} onChange={(v) => onChange({ ...animator, splitMode: v })} />
      </Group>

      <Group title="Transform (at full selection)">
        <Field label="Position"><Num value={pos[0]} onChange={(v) => setDelta({ position: [v, pos[1]] })} suffix="x" /><Num value={pos[1]} onChange={(v) => setDelta({ position: [pos[0], v] })} suffix="y" /></Field>
        <Field label="Scale %"><Num value={scl[0] * 100} onChange={(v) => setDelta({ scale: [v / 100, scl[1]] })} suffix="x" /><Num value={scl[1] * 100} onChange={(v) => setDelta({ scale: [scl[0], v / 100] })} suffix="y" /></Field>
        <Field label="Rotation °"><Num value={d.rotation ?? 0} onChange={(v) => setDelta({ rotation: v })} /></Field>
        <Field label="Opacity %"><Num value={(d.opacity ?? 0) * 100} min={-100} max={100} onChange={(v) => setDelta({ opacity: v / 100 })} /></Field>
      </Group>

      <Group title="Range selector">
        <Field label="Shape"><Select options={SHAPES} value={sel.shape} onChange={(v) => setSel({ shape: v })} /></Field>
        <Field label="Start"><Slider value={sel.start} min={0} max={1} step={0.01} onChange={(v) => setSel({ start: v })} /></Field>
        <Field label="End"><Slider value={sel.end} min={0} max={1} step={0.01} onChange={(v) => setSel({ end: v })} /></Field>
        <Field label="Ease low"><Slider value={sel.easeLow} min={-1} max={1} step={0.05} onChange={(v) => setSel({ easeLow: v })} /></Field>
        <Field label="Ease high"><Slider value={sel.easeHigh} min={-1} max={1} step={0.05} onChange={(v) => setSel({ easeHigh: v })} /></Field>
        <Field label="Amount %"><Num value={sel.amount * 100} min={-100} max={100} onChange={(v) => setSel({ amount: v / 100 })} /></Field>
        <Field label="Randomize">
          <button type="button" onClick={() => setSel({ randomizeOrder: !sel.randomizeOrder })} className={`h-3 w-3 rounded-sm border ${sel.randomizeOrder ? 'border-accent bg-accent' : 'border-hairline'}`} />
          {sel.randomizeOrder && <Num value={sel.seed} onChange={(v) => setSel({ seed: Math.round(v) })} suffix="seed" width="w-16" />}
        </Field>
      </Group>

      <Group title="Reveal timing">
        <Field label="Start (frame)"><Num value={startF} onChange={(v) => setTiming(Math.round(v), dur)} /></Field>
        <Field label="Duration (frames)"><Num value={dur} onChange={(v) => setTiming(startF, Math.round(v))} /></Field>
        <p className="text-[9.5px] leading-snug text-slate-600">The selector sweeps {from} → {to} over these frames.</p>
      </Group>
    </div>
  );
}

// ── controls ──
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[2px]">
      <span className="text-[10.5px] text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Num({ value, onChange, min, max, suffix, width = 'w-14' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string; width?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        onChange={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) onChange(min != null || max != null ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)) : n); }}
        className={`${width} rounded border border-hairline bg-[#0e1726] px-1.5 py-0.5 text-right text-[11px] text-slate-200 focus:border-accent focus:outline-none`}
      />
      {suffix && <span className="text-[9px] text-slate-600">{suffix}</span>}
    </div>
  );
}

function Slider({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="h-1 w-20 cursor-pointer accent-[#f7b500]" />
      <span className="w-8 text-right text-[10px] tabular-nums text-slate-500">{Math.round(value * 100) / 100}</span>
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex w-full overflow-hidden rounded border border-hairline">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 px-2 py-1 text-[10.5px] transition-colors ${value === o.id ? 'bg-accent text-on-accent' : 'bg-surface-1 text-slate-400 hover:text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="rounded border border-hairline bg-[#0e1726] px-1.5 py-0.5 text-[11px] text-slate-200 focus:outline-none">
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
