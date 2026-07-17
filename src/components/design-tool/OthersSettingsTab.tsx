// Final tab of the editor settings panel.
// Manages: default starting tab, default background, and default sequence settings.
// Part of the editor settings panel — see OthersSettings for the complete tab list.

import React, { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { LayoutMode } from '../../hooks/useLayoutMode';
import {
  BackgroundConfig,
  createDefaultBackground,
  createDefaultGradientLayer,
  generateBackgroundStyle,
} from '../../types/background';
import { othersSettingsService } from '../../services/OthersSettingsService';
import BackgroundSettingsPanel from '../layout/BackgroundSettingsPanel';
import { FRAME_RATE_PRESETS } from '../../types/sequence';

// ── Shared sub-components (same patterns as all previous tabs) ─────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${value ? 'bg-yellow-400' : 'bg-gray-600'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const ToggleRow = ({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: () => void;
}) => (
  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border border-gray-700/50">
    <div>
      <div className="text-xs font-medium text-white">{label}</div>
      {description && <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>}
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

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

const NumericInput = ({ label, value, onChange, min, max, step = 1, unit }: {
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

// ── Background mini-preview ────────────────────────────────────────────────────

const BackgroundPreview: React.FC<{ config: BackgroundConfig; enabled: boolean }> = ({ config, enabled }) => {
  const style = useMemo(() => {
    if (!enabled) return { backgroundColor: 'transparent' };
    return generateBackgroundStyle(config);
  }, [config, enabled]);

  return (
    <div className="space-y-1">
      <span className="text-[11px] text-gray-500">Preview</span>
      <div
        className="border border-gray-600/50"
        style={{
          width: 120,
          height: 68,
          ...style,
          backgroundImage: enabled ? (style as React.CSSProperties).backgroundImage : undefined,
        }}
      >
        {!enabled && (
          <div className="w-full h-full flex items-center justify-center bg-gray-800/40">
            <span className="text-[10px] text-gray-600">No background</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── RESOLUTION PRESETS ────────────────────────────────────────────────────────

const RESOLUTION_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'FHD',      w: 1920, h: 1080 },
  { label: '4K',       w: 3840, h: 2160 },
  { label: 'HD',       w: 1280, h: 720  },
  { label: '1:1',      w: 1080, h: 1080 },
  { label: '9:16',     w: 1080, h: 1920 },
  { label: 'QHD',      w: 2560, h: 1440 },
];

// ── Main component ─────────────────────────────────────────────────────────────

const OthersSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState(() => othersSettingsService.get());

  // ── Starting Tab ────────────────────────────────────────────────────────────
  const handleStartingTabChange = useCallback((tab: LayoutMode) => {
    othersSettingsService.setStartingTab(tab);
    setSettings(s => ({ ...s, startingTab: tab }));
  }, []);

  // ── Background ──────────────────────────────────────────────────────────────
  const handleBgEnabledToggle = useCallback(() => {
    const next = !settings.background.enabled;
    const nextCfg = next && settings.background.config.layers.length === 0
      ? { ...settings.background.config, enabled: true, layers: [createDefaultGradientLayer()] }
      : settings.background.config;
    othersSettingsService.setBackground({ enabled: next, config: nextCfg });
    setSettings(s => ({ ...s, background: { enabled: next, config: nextCfg } }));
  }, [settings.background]);

  const handleBgConfigUpdate = useCallback((config: BackgroundConfig) => {
    othersSettingsService.setBackground({ enabled: settings.background.enabled, config });
    setSettings(s => ({ ...s, background: { ...s.background, config } }));
  }, [settings.background.enabled]);

  // ── Sequence ────────────────────────────────────────────────────────────────
  const handleSeqUpdate = useCallback(<K extends keyof typeof settings.sequence>(
    key: K,
    value: typeof settings.sequence[K]
  ) => {
    othersSettingsService.setSequence({ [key]: value });
    setSettings(s => ({ ...s, sequence: { ...s.sequence, [key]: value } }));
  }, []);

  // ── Reset All ───────────────────────────────────────────────────────────────
  const handleResetAll = () => {
    if (!window.confirm('Reset all Others settings to factory defaults? This cannot be undone.')) return;
    othersSettingsService.resetAll();
    setSettings(othersSettingsService.get());
  };

  const { startingTab, background, sequence } = settings;

  const MODE_TABS: { value: LayoutMode; label: string }[] = [
    { value: 'design',   label: 'Design'  },
    { value: 'edit',     label: 'Edit'    },
    { value: 'advanced', label: 'Animate' },
  ];

  return (
    <div className="space-y-4">

      {/* ── Section 1: Default Starting Tab ─────────────────────────────────── */}
      <Section title="Default Starting Tab">
        <div>
          <label className="text-[11px] text-gray-500 block mb-1.5">Default Starting Tab</label>
          <div className="flex">
            {MODE_TABS.map((tab, i) => (
              <button
                key={tab.value}
                onClick={() => handleStartingTabChange(tab.value)}
                className={`flex-1 px-3 py-2 text-xs font-medium border-t border-b transition-colors
                  ${i === 0 ? 'border-l' : ''}
                  ${i === MODE_TABS.length - 1 ? 'border-r' : ''}
                  ${startingTab === tab.value
                    ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
                    : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 mt-1.5">
            Sets the tab that is active when opening any project.
          </p>
        </div>
      </Section>

      {/* ── Section 2: Default Background ────────────────────────────────────── */}
      <Section title="Default Background">
        <ToggleRow
          label="Background Enabled"
          description="Apply a default background to every new project"
          value={background.enabled}
          onChange={handleBgEnabledToggle}
        />

        <div className={background.enabled ? '' : 'opacity-40 pointer-events-none select-none'}>
          <BackgroundPreview config={background.config} enabled={background.enabled} />

          <div className="mt-3">
            <label className="text-[11px] text-gray-500 block mb-1">Background Layers</label>
            <div className="border border-gray-700/50 bg-gray-800/30" style={{ minHeight: 80 }}>
              <BackgroundSettingsPanel
                background={background.config}
                onUpdate={handleBgConfigUpdate}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section 3: Default Sequence ──────────────────────────────────────── */}
      <Section title="Default Sequence">
        <ToggleRow
          label="Default Sequence Enabled"
          description="Use configured defaults when creating new sequences"
          value={sequence.enabled}
          onChange={() => handleSeqUpdate('enabled', !sequence.enabled)}
        />

        <p className="text-[11px] text-gray-600 -mt-1">
          Applied automatically when entering Edit or Animate mode.
        </p>

        <div className={sequence.enabled ? '' : 'opacity-40 pointer-events-none select-none'}>
          <NumericInput
            label="Default Duration (s)"
            value={sequence.duration}
            onChange={v => handleSeqUpdate('duration', v)}
            min={0.1}
            max={3600}
            step={0.1}
            unit="s"
          />

          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Default Frame Rate</label>
            <select
              value={sequence.frameRate}
              onChange={e => handleSeqUpdate('frameRate', Number(e.target.value))}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
            >
              {FRAME_RATE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value={23.976}>23.976 fps (Cinema)</option>
              <option value={25}>25 fps (PAL)</option>
              <option value={29.97}>29.97 fps (NTSC)</option>
              <option value={50}>50 fps</option>
              <option value={59.94}>59.94 fps</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-gray-500 block mb-1.5">Preset Resolutions</label>
            <div className="grid grid-cols-3 gap-1">
              {RESOLUTION_PRESETS.map(r => (
                <button
                  key={r.label}
                  className="px-2 py-1.5 bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 text-[11px] transition-colors"
                  onClick={() => {}}
                  title={`${r.w} × ${r.h}`}
                >
                  {r.label}
                  <span className="block text-[10px] text-gray-600">{r.w}×{r.h}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Default Background Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={sequence.backgroundColor}
                onChange={e => handleSeqUpdate('backgroundColor', e.target.value)}
                className="w-8 h-8 cursor-pointer border border-gray-700/50 bg-transparent flex-shrink-0"
              />
              <input
                type="text"
                value={sequence.backgroundColor}
                onChange={e => handleSeqUpdate('backgroundColor', e.target.value)}
                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 font-mono"
              />
            </div>
          </div>

          <ToggleRow
            label="Auto-Create Sequence on Edit Mode"
            description="When off, configured defaults are shown as suggestions in the creation dialog"
            value={sequence.autoCreate}
            onChange={() => handleSeqUpdate('autoCreate', !sequence.autoCreate)}
          />
        </div>
      </Section>

      {/* ── Reset All ─────────────────────────────────────────────────────────── */}
      <div className="pt-2 border-t border-gray-700/40">
        <button
          onClick={handleResetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 hover:text-red-300 text-xs transition-colors"
        >
          <AlertTriangle className="w-3 h-3" />
          Reset Others Settings to Default
        </button>
      </div>
    </div>
  );
};

export default OthersSettingsTab;
