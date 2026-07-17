// Settings panel complete — all six tabs implemented.
// Tab 6 of 6: Animation Defaults
// Follows the exact same subtab-sidebar pattern established by DefaultShapesSettings.
// All values persist via AnimationDefaultsService and are read by FXShortcutsTab at apply-time.

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { EasingType, EASING_CONFIGS } from '../../animation-engine/types';
import {
  animationDefaultsService,
  ANIMATION_TIMING_FACTORY_DEFAULTS,
  TEXT_ANIMATOR_FACTORY_DEFAULTS,
  AnimationTimingDefaults,
  TextAnimatorLayerDefaults,
} from '../../services/AnimationDefaultsService';

// ── Animation category catalogue (mirrors FXShortcutsTab exactly) ─────────────

interface AnimEntry {
  id: string;
  name: string;
  description: string;
}
interface AnimCat {
  id: string;
  name: string;
  items: AnimEntry[];
}

const ANIM_CATS: AnimCat[] = [
  {
    id: 'scale', name: 'Scale / Visibility',
    items: [
      { id: 'collapse',      name: 'Collapse',       description: 'Scale to 0' },
      { id: 'expand',        name: 'Expand',         description: 'Scale from 0 to normal' },
      { id: 'pop-in',        name: 'Pop In',         description: '0.7 → 1.05 → 1.0' },
      { id: 'pop-out',       name: 'Pop Out',        description: '1.0 → 1.1 → 0' },
      { id: 'pulse',         name: 'Pulse',          description: '1.0 → 1.08 → 1.0' },
      { id: 'breath',        name: 'Breath',         description: '0.95 ↔ 1.0 loop' },
    ],
  },
  {
    id: 'position', name: 'Position / Movement',
    items: [
      { id: 'slide-in-left',    name: 'Slide In Left',    description: 'From left offscreen' },
      { id: 'slide-in-right',   name: 'Slide In Right',   description: 'From right offscreen' },
      { id: 'slide-in-top',     name: 'Slide In Top',     description: 'From top offscreen' },
      { id: 'slide-in-bottom',  name: 'Slide In Bottom',  description: 'From bottom offscreen' },
      { id: 'slide-out-left',   name: 'Slide Out Left',   description: 'Exit to left' },
      { id: 'slide-out-right',  name: 'Slide Out Right',  description: 'Exit to right' },
      { id: 'slide-out-top',    name: 'Slide Out Top',    description: 'Exit to top' },
      { id: 'slide-out-bottom', name: 'Slide Out Bottom', description: 'Exit to bottom' },
      { id: 'nudge-left',       name: 'Nudge Left',       description: 'Small move left and back' },
      { id: 'nudge-right',      name: 'Nudge Right',      description: 'Small move right and back' },
      { id: 'nudge-up',         name: 'Nudge Up',         description: 'Small move up and back' },
      { id: 'nudge-down',       name: 'Nudge Down',       description: 'Small move down and back' },
      { id: 'snap-back',        name: 'Snap Back',        description: 'Return to original position' },
    ],
  },
  {
    id: 'opacity', name: 'Opacity',
    items: [
      { id: 'fade-in',  name: 'Fade In',  description: 'Opacity 0 → 1' },
      { id: 'fade-out', name: 'Fade Out', description: 'Opacity → 0' },
      { id: 'flash',    name: 'Flash',    description: '1 → 0 → 1' },
      { id: 'blink',    name: 'Blink',    description: '1 ↔ 0 loop' },
    ],
  },
  {
    id: 'rotation', name: 'Rotation',
    items: [
      { id: 'twist-in',  name: 'Twist In',  description: '-15° → 0°' },
      { id: 'twist-out', name: 'Twist Out', description: '→ +15°' },
      { id: 'spin-in',   name: 'Spin In',   description: '-180° → 0°' },
      { id: 'spin-out',  name: 'Spin Out',  description: '→ +180°' },
      { id: 'wobble',    name: 'Wobble',    description: '-6° → +6° → -4° → 0°' },
    ],
  },
  {
    id: 'overshoot', name: 'Overshoot / Energy',
    items: [
      { id: 'bounce-in',       name: 'Bounce In',       description: 'Overshoot → settle' },
      { id: 'bounce-out',      name: 'Bounce Out',      description: 'Forward → exit' },
      { id: 'overshoot-scale', name: 'Overshoot Scale', description: '0.9 → 1.1 → 1.0' },
      { id: 'snap',            name: 'Snap',            description: 'Quick easing change' },
    ],
  },
  {
    id: 'attention', name: 'Attention / Shake',
    items: [
      { id: 'point-left',  name: 'Point Left',  description: 'Move left and return' },
      { id: 'point-right', name: 'Point Right', description: 'Move right and return' },
      { id: 'point-up',    name: 'Point Up',    description: 'Move up and return' },
      { id: 'point-down',  name: 'Point Down',  description: 'Move down and return' },
      { id: 'shake-x',     name: 'Shake X',     description: 'Horizontal shake' },
      { id: 'shake-y',     name: 'Shake Y',     description: 'Vertical shake' },
    ],
  },
  {
    id: 'shape-specific', name: 'Shape-Specific',
    items: [
      { id: 'grow-width',    name: 'Grow Width',    description: 'Width 0 → full' },
      { id: 'grow-height',   name: 'Grow Height',   description: 'Height 0 → full' },
      { id: 'center-expand', name: 'Center Expand', description: 'Expand from center' },
      { id: 'edge-expand',   name: 'Edge Expand',   description: 'Expand from edge' },
    ],
  },
  {
    id: 'camera', name: 'Camera / Global',
    items: [
      { id: 'zoom-focus', name: 'Zoom Focus', description: 'Scale up + shift' },
      { id: 'zoom-out',   name: 'Zoom Out',   description: 'Scale down + fade' },
    ],
  },
  {
    id: 'timing', name: 'Timing Macros',
    items: [
      { id: 'fast-in',         name: 'Fast In',         description: 'Quick ease-in' },
      { id: 'fast-out',        name: 'Fast Out',        description: 'Quick ease-out' },
      { id: 'smooth-in-out',   name: 'Smooth In Out',   description: 'Smooth easing' },
      { id: 'aggressive-snap', name: 'Aggressive Snap', description: 'Very short + strong ease' },
    ],
  },
  {
    id: 'combined', name: 'Killer Buttons',
    items: [
      { id: 'appear',    name: 'Appear',    description: 'Fade + scale in' },
      { id: 'disappear', name: 'Disappear', description: 'Fade + scale out' },
      { id: 'enter',     name: 'Enter',     description: 'Slide + fade in' },
      { id: 'exit',      name: 'Exit',      description: 'Slide + fade out' },
      { id: 'emphasize', name: 'Emphasize', description: 'Scale pulse with overshoot' },
    ],
  },
];

interface TextAnimEntry {
  id: string;
  name: string;
  layerCount: number;
  layerLabels: string[];
}

const TEXT_ANIM_ENTRIES: TextAnimEntry[] = [
  { id: 'typewriter',    name: 'Typewriter',    layerCount: 1, layerLabels: ['Opacity (characters)'] },
  { id: 'slide-up',     name: 'Slide Up',      layerCount: 2, layerLabels: ['Position Y (characters)', 'Opacity (characters)'] },
  { id: 'line-reveal',  name: 'Line Reveal',   layerCount: 1, layerLabels: ['Mask Height (lines)'] },
  { id: 'fade-in-words',name: 'Fade In Words', layerCount: 1, layerLabels: ['Opacity (words)'] },
  { id: 'scale-in',     name: 'Scale In',      layerCount: 2, layerLabels: ['Scale (characters)', 'Opacity (characters)'] },
  { id: 'blur-in',      name: 'Blur In',       layerCount: 2, layerLabels: ['Blur (words)', 'Opacity (words)'] },
];

// ── Sub-components (same style as DefaultShapesSettings) ─────────────────────

const NumericInput = ({
  label, value, onChange, min, max, step = 0.1, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            const clamped = min !== undefined && max !== undefined
              ? Math.min(max, Math.max(min, v)) : v;
            onChange(clamped);
          }
        }}
        className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
      />
      {unit && <span className="text-[11px] text-gray-500 flex-shrink-0">{unit}</span>}
    </div>
  </div>
);

const EasingSelect = ({
  label, value, onChange,
}: {
  label: string; value: EasingType; onChange: (v: EasingType) => void;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value as EasingType)}
      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
    >
      {EASING_CONFIGS.map(ec => (
        <option key={ec.type} value={ec.type}>{ec.label}</option>
      ))}
    </select>
  </div>
);

const DirectionSelect = ({
  label, value, onChange,
}: {
  label: string;
  value: 'forward' | 'reverse' | 'center' | 'random';
  onChange: (v: 'forward' | 'reverse' | 'center' | 'random') => void;
}) => {
  const options: { value: 'forward' | 'reverse' | 'center' | 'random'; label: string }[] = [
    { value: 'forward', label: 'Forward' },
    { value: 'reverse', label: 'Reverse' },
    { value: 'center',  label: 'Center' },
    { value: 'random',  label: 'Random' },
  ];
  return (
    <div>
      <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
      <div className="flex">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium border-t border-b transition-colors ${i === 0 ? 'border-l' : ''} ${i === options.length - 1 ? 'border-r' : ''} ${
              value === opt.value
                ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
                : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/60 hover:bg-gray-700/50 transition-colors"
      >
        <span className="text-xs font-semibold text-white">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="p-3 space-y-3 bg-gray-900/30">{children}</div>}
    </div>
  );
};

const ResetButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 hover:text-red-300 text-xs transition-colors"
  >
    <AlertTriangle className="w-3 h-3" />
    {label}
  </button>
);

// ── Element animation defaults panel ─────────────────────────────────────────

interface AnimTimingPanelProps {
  anim: AnimEntry;
}

const AnimTimingPanel: React.FC<AnimTimingPanelProps> = ({ anim }) => {
  const [vals, setVals] = useState<AnimationTimingDefaults>(
    () => animationDefaultsService.getTiming(anim.id)
  );

  const update = useCallback((updates: Partial<AnimationTimingDefaults>) => {
    const next = { ...vals, ...updates };
    setVals(next);
    animationDefaultsService.setTiming(anim.id, next);
  }, [anim.id, vals]);

  const handleReset = () => {
    animationDefaultsService.resetTiming(anim.id);
    setVals(animationDefaultsService.getTiming(anim.id));
  };

  const factory = ANIMATION_TIMING_FACTORY_DEFAULTS[anim.id];
  const isModified = factory && (vals.duration !== factory.duration || vals.easing !== factory.easing);

  return (
    <div className="space-y-3">
      <div className="px-0 py-1">
        <p className="text-[11px] text-gray-500">{anim.description}</p>
      </div>

      <Section title="Timing">
        <NumericInput
          label="Default Duration (s)"
          value={vals.duration}
          onChange={v => update({ duration: v })}
          min={0.05}
          max={10}
          step={0.1}
          unit="s"
        />
        <EasingSelect
          label="Default Easing"
          value={vals.easing}
          onChange={v => update({ easing: v })}
        />
      </Section>

      <div className="flex items-center justify-between pt-1">
        <ResetButton
          label="Reset to Default"
          onClick={handleReset}
        />
        {isModified && (
          <span className="text-[11px] text-yellow-400/70">Modified</span>
        )}
      </div>
    </div>
  );
};

// ── Text animator preset defaults panel ───────────────────────────────────────

interface TextAnimPanelProps {
  entry: TextAnimEntry;
}

const TextAnimPanel: React.FC<TextAnimPanelProps> = ({ entry }) => {
  const [layerVals, setLayerVals] = useState<TextAnimatorLayerDefaults[]>(
    () => Array.from({ length: entry.layerCount }, (_, i) =>
      animationDefaultsService.getTextLayer(entry.id, i)
    )
  );

  const updateLayer = useCallback((idx: number, updates: Partial<TextAnimatorLayerDefaults>) => {
    setLayerVals(prev => {
      const next = prev.map((v, i) => i === idx ? { ...v, ...updates } : v);
      animationDefaultsService.setTextLayer(entry.id, idx, updates);
      return next;
    });
  }, [entry.id]);

  const handleReset = () => {
    animationDefaultsService.resetText(entry.id);
    setLayerVals(
      Array.from({ length: entry.layerCount }, (_, i) =>
        animationDefaultsService.getTextLayer(entry.id, i)
      )
    );
  };

  return (
    <div className="space-y-3">
      {layerVals.map((lv, idx) => (
        <Section
          key={idx}
          title={`Layer ${idx + 1} — ${entry.layerLabels[idx] ?? `Layer ${idx + 1}`}`}
        >
          <NumericInput
            label="Duration (s)"
            value={lv.duration}
            onChange={v => updateLayer(idx, { duration: v })}
            min={0.01}
            max={5}
            step={0.05}
            unit="s"
          />
          <NumericInput
            label="Stagger (s)"
            value={lv.stagger}
            onChange={v => updateLayer(idx, { stagger: v })}
            min={0}
            max={1}
            step={0.01}
            unit="s"
          />
          <EasingSelect
            label="Easing"
            value={lv.easing}
            onChange={v => updateLayer(idx, { easing: v })}
          />
          <DirectionSelect
            label="Direction"
            value={lv.direction}
            onChange={v => updateLayer(idx, { direction: v })}
          />
        </Section>
      ))}

      <div className="pt-1">
        <ResetButton label="Reset to Default" onClick={handleReset} />
      </div>
    </div>
  );
};

// ── Main tab ──────────────────────────────────────────────────────────────────

type Selection =
  | { kind: 'anim'; anim: AnimEntry }
  | { kind: 'text'; entry: TextAnimEntry };

const AnimationSettingsTab: React.FC = () => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const toggleCat = (id: string) =>
    setCollapsedCats(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleResetAll = () => {
    if (!window.confirm('Reset all animation defaults to factory values? This cannot be undone.')) return;
    animationDefaultsService.resetAll();
    setSelection(null);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-52 flex-shrink-0 flex flex-col border-r border-gray-700/50 bg-gray-800/40">
        <div className="px-3 py-2 border-b border-gray-700/50 flex-shrink-0">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Animations</span>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* Element animations */}
          {ANIM_CATS.map(cat => {
            const collapsed = collapsedCats.has(cat.id);
            return (
              <div key={cat.id}>
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-700/40 transition-colors"
                >
                  {collapsed
                    ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    : <ChevronUp className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  }
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{cat.name}</span>
                </button>

                {!collapsed && cat.items.map(anim => {
                  const sel = selection?.kind === 'anim' && selection.anim.id === anim.id;
                  return (
                    <button
                      key={anim.id}
                      onClick={() => setSelection({ kind: 'anim', anim })}
                      className={`w-full flex items-center px-6 py-1.5 text-left transition-colors border-l-2 ${
                        sel
                          ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/30 border-transparent'
                      }`}
                    >
                      <span className="text-xs">{anim.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Text animator presets */}
          <div>
            <button
              onClick={() => toggleCat('__text__')}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-gray-700/40 transition-colors"
            >
              {collapsedCats.has('__text__')
                ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
                : <ChevronUp className="w-3 h-3 text-gray-500 flex-shrink-0" />
              }
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Text Animator</span>
            </button>

            {!collapsedCats.has('__text__') && TEXT_ANIM_ENTRIES.map(entry => {
              const sel = selection?.kind === 'text' && selection.entry.id === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelection({ kind: 'text', entry })}
                  className={`w-full flex items-center px-6 py-1.5 text-left transition-colors border-l-2 ${
                    sel
                      ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/30 border-transparent'
                  }`}
                >
                  <span className="text-xs">{entry.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-3 py-2 border-t border-gray-700/50 flex-shrink-0">
          <button
            onClick={handleResetAll}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 hover:text-red-300 text-xs transition-colors"
          >
            <AlertTriangle className="w-3 h-3" />
            Reset All
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selection && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-gray-500">Select an animation to configure its defaults.</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Changes apply the next time the animation is added to an element.
            </p>
          </div>
        )}

        {selection?.kind === 'anim' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">{selection.anim.name}</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Default timing applied when this animation is added</p>
            </div>
            <AnimTimingPanel key={selection.anim.id} anim={selection.anim} />
          </div>
        )}

        {selection?.kind === 'text' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white">{selection.entry.name}</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">Default layer values applied when this text preset is used</p>
            </div>
            <TextAnimPanel key={selection.entry.id} entry={selection.entry} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimationSettingsTab;
