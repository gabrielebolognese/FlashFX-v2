/**
 * CodeEditorSettingsTab
 *
 * Settings panel tab — Tab 2 of 6 planned settings tabs.
 * Future tabs (Tab 3–6) should be added as sibling components
 * and registered in EditorSettingsModal.tsx alongside this one.
 *
 * Controls typography, syntax colors, editor chrome colors, and behavior
 * for both the element JSON editor and the project JSON editor.
 *
 * Persistence: CodeEditorDefaultsService → localStorage key `flashfx_codeeditor_defaults`.
 * All changes are saved and applied immediately via CSS custom properties.
 */

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import {
  codeEditorDefaultsService,
  CODE_EDITOR_FACTORY_DEFAULTS,
  CodeEditorSettings,
} from '../../services/CodeEditorDefaultsService';
import { tokenizeJson } from './JsonEditorModal';

// ─── Sub-components ────────────────────────────────────────────────────────────

const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${value ? 'bg-yellow-400' : 'bg-gray-600'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const ToggleRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: () => void;
}) => (
  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border border-gray-700/50">
    <div>
      <div className="text-xs font-medium text-white">{label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>
    </div>
    <Toggle value={value} onChange={onChange} />
  </div>
);

const NumericInput = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
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
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
      />
      {unit && <span className="text-[11px] text-gray-500 flex-shrink-0">{unit}</span>}
    </div>
  </div>
);

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) => {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-gray-500">{label}</label>
        <span className="text-[11px] text-gray-400 font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 appearance-none cursor-pointer"
      />
    </div>
  );
};

const ColorPickerRow = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-gray-500 flex-1 min-w-0">{label}</span>
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-8 h-6 cursor-pointer border border-gray-700/50 bg-transparent flex-shrink-0"
    />
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const v = e.target.value.trim();
        if (/^#[0-9a-fA-F]{0,8}$/.test(v)) onChange(v);
      }}
      className="w-20 px-2 py-1 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 font-mono flex-shrink-0"
    />
  </div>
);

const SelectRow = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

// ─── Collapsible Section ───────────────────────────────────────────────────────

const Section = ({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/80 hover:bg-gray-700/60 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{title}</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>
      {open && <div className="p-3 space-y-3 bg-gray-900/40">{children}</div>}
    </div>
  );
};

// ─── Live Preview ──────────────────────────────────────────────────────────────

const PREVIEW_JSON = `{
  "name": "FlashFX Layer",
  "opacity": 0.85,
  "visible": true,
  "mask": null,
  "children": [
    { "id": "abc123" }
  ]
}`;

const LivePreview = ({ settings }: { settings: CodeEditorSettings }) => {
  const LINE_H = settings.lineHeight;
  const fontFamily = `'${settings.fontFamily}', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`;
  const lines = PREVIEW_JSON.split('\n');

  const tokenColorMap: Record<string, string> = {
    key:         settings.tokenKeyColor,
    string:      settings.tokenStringColor,
    number:      settings.tokenNumberColor,
    boolean:     settings.tokenNumberColor,
    null:        settings.tokenNullColor,
    bracket:     settings.tokenBracketColor,
    punctuation: settings.tokenPunctuationColor,
  };

  return (
    <div className="border border-gray-700/50">
      <div
        className="px-3 py-1.5 bg-gray-800/80 border-b border-gray-700/50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
      >
        Live Preview
      </div>
      <div
        style={{
          background: settings.editorBg,
          display: 'flex',
          fontFamily,
          fontSize: settings.fontSize,
          lineHeight: `${LINE_H}px`,
          letterSpacing: `${settings.letterSpacing}px`,
          overflow: 'hidden',
        }}
      >
        {settings.showLineNumbers && (
          <div
            style={{
              width: 36,
              flexShrink: 0,
              background: settings.gutterBg,
              borderRight: `1px solid ${settings.gutterBorderColor}`,
              userSelect: 'none',
            }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                style={{
                  height: LINE_H,
                  lineHeight: `${LINE_H}px`,
                  textAlign: 'right',
                  paddingRight: 8,
                  fontSize: 11,
                  color: settings.lineNumberColor,
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <div style={{ flexGrow: 1, padding: '0 12px', overflow: 'hidden' }}>
          {lines.map((line, i) => {
            const tokens = tokenizeJson(line);
            return (
              <div
                key={i}
                style={{
                  height: LINE_H,
                  lineHeight: `${LINE_H}px`,
                  whiteSpace: settings.wordWrap ? 'pre-wrap' : 'pre',
                  color: settings.tokenDefaultColor,
                }}
              >
                {settings.syntaxHighlighting
                  ? tokens.map((tok, j) => {
                      const color = tokenColorMap[tok.type];
                      return color
                        ? <span key={j} style={{ color }}>{tok.value}</span>
                        : <React.Fragment key={j}>{tok.value}</React.Fragment>;
                    })
                  : line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Font options from the existing MONO constant ──────────────────────────────
const FONT_OPTIONS = [
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Fira Code',      value: 'Fira Code' },
  { label: 'Cascadia Code',  value: 'Cascadia Code' },
  { label: 'System Monospace', value: 'monospace' },
];

// ─── Main Component ────────────────────────────────────────────────────────────

const CodeEditorSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<CodeEditorSettings>(() =>
    codeEditorDefaultsService.getDefaults()
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const update = useCallback(<K extends keyof CodeEditorSettings>(key: K, value: CodeEditorSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      codeEditorDefaultsService.update(next);
      return next;
    });
  }, []);

  const handleReset = () => {
    codeEditorDefaultsService.resetToFactory();
    setSettings({ ...CODE_EDITOR_FACTORY_DEFAULTS });
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-3 pb-4">
      {/* Section 1 — Typography */}
      <Section title="Typography">
        <div className="grid grid-cols-2 gap-3">
          <NumericInput
            label="Font Size (px)"
            value={settings.fontSize}
            onChange={(v) => update('fontSize', v)}
            min={8}
            max={24}
            step={1}
          />
          <SliderRow
            label="Line Height"
            value={settings.lineHeight}
            min={14}
            max={32}
            step={1}
            onChange={(v) => update('lineHeight', v)}
            format={(v) => `${v}px`}
          />
        </div>
        <SelectRow
          label="Font Family"
          value={settings.fontFamily}
          options={FONT_OPTIONS}
          onChange={(v) => update('fontFamily', v)}
        />
        <SliderRow
          label="Letter Spacing"
          value={settings.letterSpacing}
          min={-1}
          max={3}
          step={0.1}
          onChange={(v) => update('letterSpacing', Math.round(v * 10) / 10)}
          format={(v) => `${v.toFixed(1)}px`}
        />
      </Section>

      {/* Section 2 — Syntax Colors */}
      <Section title="Syntax Colors">
        <ColorPickerRow
          label="Keys"
          value={settings.tokenKeyColor}
          onChange={(v) => update('tokenKeyColor', v)}
        />
        <ColorPickerRow
          label="String Values"
          value={settings.tokenStringColor}
          onChange={(v) => update('tokenStringColor', v)}
        />
        <ColorPickerRow
          label="Numbers & Booleans"
          value={settings.tokenNumberColor}
          onChange={(v) => update('tokenNumberColor', v)}
        />
        <ColorPickerRow
          label="Null"
          value={settings.tokenNullColor}
          onChange={(v) => update('tokenNullColor', v)}
        />
        <ColorPickerRow
          label="Brackets & Braces"
          value={settings.tokenBracketColor}
          onChange={(v) => update('tokenBracketColor', v)}
        />
        <ColorPickerRow
          label="Colons & Commas"
          value={settings.tokenPunctuationColor}
          onChange={(v) => update('tokenPunctuationColor', v)}
        />
        <ColorPickerRow
          label="Default Text"
          value={settings.tokenDefaultColor}
          onChange={(v) => update('tokenDefaultColor', v)}
        />
      </Section>

      {/* Section 3 — Editor Chrome Colors */}
      <Section title="Editor Chrome">
        <ColorPickerRow
          label="Editor Background"
          value={settings.editorBg}
          onChange={(v) => update('editorBg', v)}
        />
        <ColorPickerRow
          label="Line Number Gutter"
          value={settings.gutterBg}
          onChange={(v) => update('gutterBg', v)}
        />
        <ColorPickerRow
          label="Line Numbers"
          value={settings.lineNumberColor}
          onChange={(v) => update('lineNumberColor', v)}
        />
        <ColorPickerRow
          label="Active Line"
          value={settings.activeLineBg}
          onChange={(v) => update('activeLineBg', v)}
        />
        <ColorPickerRow
          label="Gutter Border"
          value={settings.gutterBorderColor}
          onChange={(v) => update('gutterBorderColor', v)}
        />
        <ColorPickerRow
          label="Text Selection"
          value={settings.selectionBg}
          onChange={(v) => update('selectionBg', v)}
        />
        <ColorPickerRow
          label="Error Line"
          value={settings.errorColor}
          onChange={(v) => update('errorColor', v)}
        />
      </Section>

      {/* Section 4 — Behavior */}
      <Section title="Behavior">
        <ToggleRow
          label="Show Line Numbers"
          description="Display the line number gutter on the left"
          value={settings.showLineNumbers}
          onChange={() => update('showLineNumbers', !settings.showLineNumbers)}
        />
        <ToggleRow
          label="Word Wrap"
          description="Wrap long lines within the editor width"
          value={settings.wordWrap}
          onChange={() => update('wordWrap', !settings.wordWrap)}
        />
        <ToggleRow
          label="Highlight Active Line"
          description="Show a subtle background on the focused line"
          value={settings.highlightActiveLine}
          onChange={() => update('highlightActiveLine', !settings.highlightActiveLine)}
        />
        <ToggleRow
          label="Syntax Highlighting"
          description="Color-code token types — keys, strings, numbers, etc."
          value={settings.syntaxHighlighting}
          onChange={() => update('syntaxHighlighting', !settings.syntaxHighlighting)}
        />
      </Section>

      {/* Live Preview */}
      <LivePreview settings={settings} />

      {/* Reset */}
      <div className="pt-1">
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full px-3 py-2 text-xs font-medium text-red-400 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50 transition-colors"
          >
            Reset Code Editor Settings to Default
          </button>
        ) : (
          <div className="border border-red-500/40 bg-red-500/8 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-300">
                Reset all code editor settings to defaults? This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeEditorSettingsTab;
