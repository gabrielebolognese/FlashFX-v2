// Settings Tab 5 of 6 — Keyboard Shortcuts
// Full AE-style visual keyboard editor with command list, key detail panel,
// preset system, conflict detection, and bidirectional selection sync.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Copy, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import {
  shortcutRegistry,
  ALL_COMMANDS,
  ShortcutBinding,
  ShortcutCommand,
  formatBinding,
} from '../../services/ShortcutRegistry';
import {
  QWERTY_MAIN,
  KeyDef,
  KeyRow,
  keyToCode,
} from './keyboardLayout';

// ── Color constants matching AE screenshot ────────────────────────────────────
const COL_APP      = '#7c3aed';
const COL_PANEL    = '#0d9488';
const COL_SEL      = '#2563eb';
const COL_EMPTY    = '#1f2937';
const COL_CONFLICT = '#b91c1c';

const KEY_GAP = 3;
const ROW_GAP = 3;

// ── Fluid keyboard sizing ─────────────────────────────────────────────────────
// QWERTY_MAIN number row: 13 × 1.0 + 1 × 2.0 = 15.0 units (widest row)
// 14 gaps between 15 keys
const WIDEST_ROW_UNITS = 15;
const WIDEST_ROW_GAPS  = 14;

function calcBaseUnit(availableWidth: number): number {
  const totalGapPx = WIDEST_ROW_GAPS * KEY_GAP;
  const unit = (availableWidth - totalGapPx) / WIDEST_ROW_UNITS;
  return Math.max(14, Math.min(36, unit));
}

// ── Modifier combo definitions for the key-detail panel ──────────────────────
interface ModifierCombo {
  label: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}
const MODIFIER_COMBOS: ModifierCombo[] = [
  { label: 'None',          ctrl: false, shift: false, alt: false },
  { label: 'Ctrl',          ctrl: true,  shift: false, alt: false },
  { label: 'Alt',           ctrl: false, shift: false, alt: true  },
  { label: 'Shift',         ctrl: false, shift: true,  alt: false },
  { label: 'Ctrl+Alt',      ctrl: true,  shift: false, alt: true  },
  { label: 'Ctrl+Shift',    ctrl: true,  shift: true,  alt: false },
  { label: 'Alt+Shift',     ctrl: false, shift: true,  alt: true  },
  { label: 'Ctrl+Alt+Shift',ctrl: true,  shift: true,  alt: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normKey(k: string): string {
  return k.toLowerCase();
}

function bindingsMatchKey(b: ShortcutBinding, code: string, combo: ModifierCombo): boolean {
  const bCode = keyToCode(b.key);
  return (
    (bCode === code || normKey(b.key) === normKey(code)) &&
    b.ctrl  === combo.ctrl  &&
    b.shift === combo.shift &&
    b.alt   === combo.alt
  );
}

// Build a lookup: code → { commandId, binding }[]
function buildKeyLookup(
  bindings: Record<string, ShortcutBinding | null>
): Record<string, { commandId: string; binding: ShortcutBinding }[]> {
  const map: Record<string, { commandId: string; binding: ShortcutBinding }[]> = {};
  for (const [cmdId, b] of Object.entries(bindings)) {
    if (!b) continue;
    const code = keyToCode(b.key) ?? b.key;
    if (!map[code]) map[code] = [];
    map[code].push({ commandId: cmdId, binding: b });
  }
  return map;
}

function getCommandLabel(commandId: string): string {
  return ALL_COMMANDS.find(c => c.id === commandId)?.label ?? commandId;
}

function getCommandType(commandId: string): ShortcutCommandType {
  return ALL_COMMANDS.find(c => c.id === commandId)?.type ?? 'application';
}

type ShortcutCommandType = 'application' | 'panel';

// ── Key button color ──────────────────────────────────────────────────────────
function keyColor(
  code: string,
  keyLookup: Record<string, { commandId: string; binding: ShortcutBinding }[]>,
  selectedCode: string | null,
  activeMods: { ctrl: boolean; alt: boolean; shift: boolean },
  conflictCode: string | null
): string {
  if (conflictCode === code) return COL_CONFLICT;
  if (selectedCode === code) return COL_SEL;
  if (code === 'ControlLeft' || code === 'ControlRight') {
    if (activeMods.ctrl) return COL_SEL;
  }
  if (code === 'AltLeft' || code === 'AltRight') {
    if (activeMods.alt) return COL_SEL;
  }
  if (code === 'ShiftLeft' || code === 'ShiftRight') {
    if (activeMods.shift) return COL_SEL;
  }

  const entries = keyLookup[code] ?? [];
  if (entries.length === 0) return COL_EMPTY;

  // Filter by active modifiers if any modifier is held
  const anyMod = activeMods.ctrl || activeMods.alt || activeMods.shift;
  if (anyMod) {
    const filtered = entries.filter(e =>
      e.binding.ctrl  === activeMods.ctrl &&
      e.binding.alt   === activeMods.alt  &&
      e.binding.shift === activeMods.shift
    );
    if (filtered.length === 0) return COL_EMPTY;
    const type = getCommandType(filtered[0].commandId);
    return type === 'panel' ? COL_PANEL : COL_APP;
  }

  // Show dominant color (prefer application)
  const hasApp   = entries.some(e => getCommandType(e.commandId) === 'application');
  const hasPanel = entries.some(e => getCommandType(e.commandId) === 'panel');
  if (hasApp && hasPanel) return COL_APP;
  if (hasApp) return COL_APP;
  return COL_PANEL;
}

function keyCommandLabel(
  code: string,
  keyLookup: Record<string, { commandId: string; binding: ShortcutBinding }[]>,
  activeMods: { ctrl: boolean; alt: boolean; shift: boolean }
): string {
  const entries = keyLookup[code] ?? [];
  const anyMod = activeMods.ctrl || activeMods.alt || activeMods.shift;
  if (anyMod) {
    const filtered = entries.filter(e =>
      e.binding.ctrl  === activeMods.ctrl &&
      e.binding.alt   === activeMods.alt  &&
      e.binding.shift === activeMods.shift
    );
    if (filtered.length === 0) return '';
    return getCommandLabel(filtered[0].commandId);
  }
  if (entries.length === 0) return '';
  // Show no-modifier first if available
  const noMod = entries.find(e => !e.binding.ctrl && !e.binding.alt && !e.binding.shift);
  if (noMod) return getCommandLabel(noMod.commandId);
  return getCommandLabel(entries[0].commandId);
}

// ── Single key button ─────────────────────────────────────────────────────────
interface KeyButtonProps {
  keyDef: KeyDef;
  color: string;
  commandLabel: string;
  isSelected: boolean;
  onPress: (code: string) => void;
  baseUnit: number;
}

const KeyButton: React.FC<KeyButtonProps> = ({ keyDef, color, commandLabel, isSelected, onPress, baseUnit }) => {
  const [hovered, setHovered] = useState(false);
  if (keyDef.code === '__gap__') {
    return <div style={{ width: (keyDef.w ?? 1) * baseUnit + ((keyDef.w ?? 1) - 1) * KEY_GAP, flexShrink: 0 }} />;
  }

  const w = (keyDef.w ?? 1) * baseUnit + ((keyDef.w ?? 1) - 1) * KEY_GAP;
  const h = (keyDef.h ?? 1) * baseUnit + ((keyDef.h ?? 1) - 1) * ROW_GAP;
  const labelFs = Math.max(7, Math.min(11, baseUnit * 0.28));
  const cmdFs   = Math.max(6, Math.min(9,  baseUnit * 0.22));

  const bg = hovered
    ? isSelected
      ? '#3b82f6'
      : color === COL_EMPTY ? '#374151' : color + 'cc'
    : color;

  return (
    <button
      title={commandLabel || (keyDef.isModifier ? keyDef.label : 'Unassigned')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPress(keyDef.code)}
      style={{
        width: w,
        height: h,
        background: bg,
        border: `1px solid ${isSelected ? '#60a5fa' : '#374151'}`,
        flexShrink: 0,
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.1s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '2px 3px',
        borderRadius: 0,
      }}
    >
      {commandLabel && (
        <span style={{
          fontSize: cmdFs,
          color: '#fff',
          lineHeight: 1.1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
          maxWidth: '100%',
        }}>
          {commandLabel}
        </span>
      )}
      <span style={{
        fontSize: labelFs,
        color: commandLabel ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)',
        lineHeight: 1,
        alignSelf: 'flex-end',
        userSelect: 'none',
      }}>
        {keyDef.label}
      </span>
    </button>
  );
};

// ── Keyboard cluster renderer ─────────────────────────────────────────────────
interface KeyboardClusterProps {
  rows: KeyRow[];
  keyLookup: Record<string, { commandId: string; binding: ShortcutBinding }[]>;
  selectedCode: string | null;
  activeMods: { ctrl: boolean; alt: boolean; shift: boolean };
  conflictCode: string | null;
  onKeyPress: (code: string) => void;
  baseUnit: number;
}

const KeyboardCluster: React.FC<KeyboardClusterProps> = ({
  rows, keyLookup, selectedCode, activeMods, conflictCode, onKeyPress, baseUnit
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
    {rows.map((row, ri) => (
      <div key={ri} style={{ display: 'flex', gap: KEY_GAP }}>
        {row.map((keyDef, ki) => (
          <KeyButton
            key={ki}
            keyDef={keyDef}
            color={keyColor(keyDef.code, keyLookup, selectedCode, activeMods, conflictCode)}
            commandLabel={keyCommandLabel(keyDef.code, keyLookup, activeMods)}
            isSelected={selectedCode === keyDef.code}
            onPress={onKeyPress}
            baseUnit={baseUnit}
          />
        ))}
      </div>
    ))}
  </div>
);

// ── Legend bar ────────────────────────────────────────────────────────────────
const Legend: React.FC = () => (
  <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
    {[
      { color: COL_APP,   label: 'Application shortcuts are active regardless of panel focus' },
      { color: COL_PANEL, label: 'Panel shortcuts override application shortcuts when the panel has focus' },
      { color: COL_SEL,   label: 'Modifier key pressed' },
    ].map(({ color, label }) => (
      <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 16, height: 16, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{label}</span>
      </div>
    ))}
  </div>
);

// ── Save as dialog ────────────────────────────────────────────────────────────
const SaveAsDialog: React.FC<{
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  return (
    <div className="absolute inset-0 bg-black/70 z-10 flex items-center justify-center">
      <div className="bg-gray-800 border border-gray-600 p-4 w-72" style={{ borderRadius: 0 }}>
        <div className="text-sm font-semibold text-white mb-3">Save Preset As</div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); if (e.key === 'Escape') onCancel(); }}
          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 text-white text-xs mb-3 focus:outline-none focus:border-yellow-400/60"
          placeholder="Preset name…"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 bg-gray-700 text-gray-300 hover:text-white text-xs transition-colors">
            Cancel
          </button>
          <button
            disabled={!name.trim()}
            onClick={() => name.trim() && onSave(name.trim())}
            className="px-3 py-1.5 bg-yellow-400 text-gray-900 text-xs font-semibold disabled:opacity-40 hover:bg-yellow-300 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const KeyboardShortcutsSettingsTab: React.FC = () => {
  const [bindings, setBindings] = useState<Record<string, ShortcutBinding | null>>(
    () => shortcutRegistry.getAllBindings()
  );
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [selectedModCombo, setSelectedModCombo] = useState<ModifierCombo>(MODIFIER_COMBOS[0]);
  const [activeMods, setActiveMods] = useState({ ctrl: false, alt: false, shift: false });
  const [conflictCode, setConflictCode] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [recordingCommandId, setRecordingCommandId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [presetName, setPresetName] = useState('Default');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [undoStack, setUndoStack] = useState<{ commandId: string; prev: ShortcutBinding | null }[]>([]);
  const [baseUnit, setBaseUnit] = useState(22);
  const listRef = useRef<HTMLDivElement>(null);
  const kbContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = kbContainerRef.current;
    if (!el) return;
    const measure = () => {
      const available = el.getBoundingClientRect().width - 24;
      setBaseUnit(calcBaseUnit(available));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const keyLookup = useMemo(() => buildKeyLookup(bindings), [bindings]);

  // ── Physical modifier tracking ─────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isCtrl  = e.ctrlKey  || e.metaKey;
      const isAlt   = e.altKey;
      const isShift = e.shiftKey;
      setActiveMods({ ctrl: isCtrl, alt: isAlt, shift: isShift });

      if (recordingCommandId) {
        const isOnlyMod = ['Control','Meta','Shift','Alt'].includes(e.key);
        if (isOnlyMod) return;
        e.preventDefault();
        e.stopPropagation();
        const newBinding: ShortcutBinding = {
          key: e.key === ' ' ? ' ' : e.key.toLowerCase(),
          ctrl: isCtrl,
          shift: isShift,
          alt: isAlt,
        };
        applyBinding(recordingCommandId, newBinding);
        setRecordingCommandId(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      setActiveMods({
        ctrl:  e.ctrlKey  || e.metaKey,
        alt:   e.altKey,
        shift: e.shiftKey,
      });
    };
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('keyup',   handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('keyup',   handleKeyUp, true);
    };
  }, [recordingCommandId]);

  // ── Apply a binding with conflict detection ───────────────────────────────
  const applyBinding = useCallback((commandId: string, binding: ShortcutBinding) => {
    const conflictId = shortcutRegistry.findConflict(binding, commandId);
    if (conflictId) {
      const code = keyToCode(binding.key) ?? binding.key;
      setConflictCode(code);
      setConflictMsg(`Conflicts with "${getCommandLabel(conflictId)}". Assign anyway?`);
      // Store pending action so user can confirm
      setPendingBinding({ commandId, binding, conflictId });
      return;
    }
    commitBinding(commandId, binding);
  }, []);

  const [pendingBinding, setPendingBinding] = useState<{
    commandId: string;
    binding: ShortcutBinding;
    conflictId: string;
  } | null>(null);

  const commitBinding = useCallback((commandId: string, binding: ShortcutBinding) => {
    const prev = bindings[commandId] ?? null;
    setUndoStack(s => [...s, { commandId, prev }]);
    shortcutRegistry.setBinding(commandId, binding);
    setBindings(shortcutRegistry.getAllBindings());
    setConflictCode(null);
    setConflictMsg(null);
    setPendingBinding(null);
  }, [bindings]);

  const acceptConflict = useCallback(() => {
    if (!pendingBinding) return;
    shortcutRegistry.clearBinding(pendingBinding.conflictId);
    commitBinding(pendingBinding.commandId, pendingBinding.binding);
  }, [pendingBinding, commitBinding]);

  const dismissConflict = useCallback(() => {
    setConflictCode(null);
    setConflictMsg(null);
    setPendingBinding(null);
    setRecordingCommandId(null);
  }, []);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const top = undoStack[undoStack.length - 1];
    if (!top) return;
    shortcutRegistry.setBinding(top.commandId, top.prev);
    setBindings(shortcutRegistry.getAllBindings());
    setUndoStack(s => s.slice(0, -1));
  }, [undoStack]);

  // ── Clear selected combo ──────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (!selectedCode) return;
    const entries = keyLookup[selectedCode] ?? [];
    const target = entries.find(e =>
      e.binding.ctrl  === selectedModCombo.ctrl &&
      e.binding.shift === selectedModCombo.shift &&
      e.binding.alt   === selectedModCombo.alt
    );
    if (!target) return;
    const prev = bindings[target.commandId] ?? null;
    setUndoStack(s => [...s, { commandId: target.commandId, prev }]);
    shortcutRegistry.clearBinding(target.commandId);
    setBindings(shortcutRegistry.getAllBindings());
  }, [selectedCode, selectedModCombo, keyLookup, bindings]);

  // ── Reset all ─────────────────────────────────────────────────────────────
  const handleResetAll = useCallback(() => {
    shortcutRegistry.resetToDefaults();
    setBindings(shortcutRegistry.getAllBindings());
    setUndoStack([]);
  }, []);

  // ── Key click on visual keyboard ──────────────────────────────────────────
  const handleKeyPress = useCallback((code: string) => {
    if (code === '__gap__') return;
    setSelectedCode(prev => prev === code ? null : code);
    setConflictCode(null);
    setConflictMsg(null);
    setRecordingCommandId(null);
  }, []);

  // ── Preset controls ───────────────────────────────────────────────────────
  const allPresets = shortcutRegistry.getPresets();
  const handleLoadPreset = (name: string) => {
    shortcutRegistry.loadPreset(name);
    setBindings(shortcutRegistry.getAllBindings());
    setPresetName(name);
    setUndoStack([]);
  };
  const handleSavePreset = (name: string) => {
    shortcutRegistry.savePreset(name);
    setPresetName(name);
    setShowSaveAs(false);
  };
  const handleDeletePreset = () => {
    if (presetName === 'Default') return;
    shortcutRegistry.deletePreset(presetName);
    setPresetName('Default');
    shortcutRegistry.loadPreset('Default');
    setBindings(shortcutRegistry.getAllBindings());
  };

  // ── Command list ──────────────────────────────────────────────────────────
  const categories = useMemo(
    () => [...new Set(ALL_COMMANDS.map(c => c.category))],
    []
  );

  const filteredCommands = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return null;
    return ALL_COMMANDS.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  }, [search]);

  const handleCommandClick = (cmd: ShortcutCommand) => {
    setSelectedCommandId(cmd.id);
    const b = bindings[cmd.id];
    if (b) {
      const code = keyToCode(b.key) ?? b.key;
      setSelectedCode(code);
    }
  };

  const handleShortcutCellClick = (cmd: ShortcutCommand, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecordingCommandId(cmd.id);
    setSelectedCommandId(cmd.id);
  };

  // ── Key detail panel ───────────────────────────────────────────────────────
  const keyDetailRows = useMemo(() => {
    if (!selectedCode) return [];
    const entries = keyLookup[selectedCode] ?? [];
    return MODIFIER_COMBOS.map(combo => {
      const match = entries.find(e =>
        e.binding.ctrl  === combo.ctrl &&
        e.binding.shift === combo.shift &&
        e.binding.alt   === combo.alt
      );
      return { combo, commandId: match?.commandId ?? null };
    });
  }, [selectedCode, keyLookup]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full bg-gray-900 overflow-hidden select-none">
      {showSaveAs && (
        <SaveAsDialog
          onSave={handleSavePreset}
          onCancel={() => setShowSaveAs(false)}
        />
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/60 bg-gray-800/60 flex-shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Preset:</span>
        <select
          value={presetName}
          onChange={e => handleLoadPreset(e.target.value)}
          className="px-2 py-1 bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          style={{ borderRadius: 0 }}
        >
          {allPresets.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <button onClick={() => setShowSaveAs(true)} className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors">
          Save As
        </button>
        <button
          onClick={handleDeletePreset}
          disabled={presetName === 'Default'}
          className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Delete
        </button>
        <button onClick={() => shortcutRegistry.copyToClipboard()} className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors flex items-center gap-1">
          <Copy className="w-3 h-3" /> Copy To Clipboard
        </button>
        <div className="flex-1" />
        <button
          onClick={handleResetAll}
          title="Reset all shortcuts to defaults"
          className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset All
        </button>
        <span className="text-xs text-gray-400 font-medium ml-2">Keyboard Layout:</span>
        <select
          className="px-2 py-1 bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          defaultValue="en"
          style={{ borderRadius: 0 }}
        >
          <option value="en">en</option>
          <option value="fr">fr</option>
          <option value="de">de</option>
        </select>
      </div>

      {/* ── Keyboard area (fluid, fills full width) ── */}
      <div ref={kbContainerRef} className="flex-shrink-0 px-3 pt-3 pb-2 bg-gray-900 w-full overflow-hidden">
        <KeyboardCluster
          rows={QWERTY_MAIN}
          keyLookup={keyLookup}
          selectedCode={selectedCode}
          activeMods={activeMods}
          conflictCode={conflictCode}
          onKeyPress={handleKeyPress}
          baseUnit={baseUnit}
        />
      </div>

      {/* ── Conflict warning ── */}
      {conflictMsg && (
        <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 bg-red-900/40 border-b border-red-700/60">
          <span className="text-xs text-red-300 flex-1">{conflictMsg}</span>
          <button onClick={acceptConflict} className="px-2 py-1 bg-red-700 text-white text-xs hover:bg-red-600 transition-colors">Override</button>
          <button onClick={dismissConflict} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs hover:text-white transition-colors">Cancel</button>
        </div>
      )}

      {/* ── Bottom split: command list + key detail ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: command list */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-700/50">
          <div className="px-3 py-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search commands…"
                className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-600 text-white text-xs focus:outline-none focus:border-yellow-400/60"
                style={{ borderRadius: 0 }}
              />
            </div>
          </div>

          <div className="flex items-center px-3 py-1 border-b border-gray-700/50 bg-gray-800/40 flex-shrink-0">
            <span className="text-[11px] font-semibold text-gray-400 w-48">Command</span>
            <span className="text-[11px] font-semibold text-gray-400">Shortcut</span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto">
            {(filteredCommands ?? []).length > 0 && filteredCommands ? (
              filteredCommands.map(cmd => (
                <CommandRow
                  key={cmd.id}
                  cmd={cmd}
                  binding={bindings[cmd.id] ?? null}
                  isSelected={selectedCommandId === cmd.id}
                  isRecording={recordingCommandId === cmd.id}
                  onClick={handleCommandClick}
                  onShortcutClick={handleShortcutCellClick}
                />
              ))
            ) : (
              categories.map(cat => {
                const cmds = ALL_COMMANDS.filter(c => c.category === cat);
                const collapsed = collapsedCats.has(cat);
                return (
                  <div key={cat}>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 hover:bg-gray-700/60 transition-colors border-b border-gray-700/40"
                      onClick={() => setCollapsedCats(s => {
                        const n = new Set(s);
                        if (n.has(cat)) n.delete(cat); else n.add(cat);
                        return n;
                      })}
                    >
                      {collapsed ? <ChevronRight className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                      <span className="text-[11px] font-semibold text-gray-300">{cat}</span>
                    </button>
                    {!collapsed && cmds.map(cmd => (
                      <CommandRow
                        key={cmd.id}
                        cmd={cmd}
                        binding={bindings[cmd.id] ?? null}
                        isSelected={selectedCommandId === cmd.id}
                        isRecording={recordingCommandId === cmd.id}
                        onClick={handleCommandClick}
                        onShortcutClick={handleShortcutCellClick}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-gray-700/40 bg-gray-800/30 flex-shrink-0">
            <p className="text-[11px] text-gray-500">
              Click in the Shortcut column and press a key to assign.
            </p>
          </div>
        </div>

        {/* Right: key detail panel */}
        <div className="flex flex-col w-64 flex-shrink-0 bg-gray-900/80">
          <div className="px-3 py-2 border-b border-gray-700/40 flex-shrink-0">
            <span className="text-xs font-semibold text-gray-300">
              Key: {selectedCode ? (selectedCode === 'Space' ? 'Space' : selectedCode.replace(/^(Key|Digit)/, '')) : '—'}
            </span>
          </div>

          <div className="flex items-center px-3 py-1 border-b border-gray-700/40 bg-gray-800/40 flex-shrink-0">
            <span className="text-[11px] font-semibold text-gray-400 w-28">Modifiers</span>
            <span className="text-[11px] font-semibold text-gray-400">Command</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {keyDetailRows.map(({ combo, commandId }) => (
              <button
                key={combo.label}
                onClick={() => setSelectedModCombo(combo)}
                className={`w-full flex items-center px-3 py-1.5 border-b border-gray-700/30 text-left transition-colors ${
                  selectedModCombo.label === combo.label
                    ? 'bg-blue-600/25 border-blue-500/30'
                    : 'hover:bg-gray-800/50'
                }`}
              >
                <span className="text-xs text-gray-300 w-28 flex-shrink-0">{combo.label}</span>
                <span className={`text-xs truncate ${commandId ? 'text-white' : 'text-gray-600'}`}>
                  {commandId ? getCommandLabel(commandId) : ''}
                </span>
              </button>
            ))}
            {keyDetailRows.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-gray-600">
                Click a key to see its assignments.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-gray-700/40 flex-shrink-0">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={handleClear}
              disabled={!selectedCode}
              className="px-2 py-1 bg-gray-700 border border-gray-600 text-gray-300 hover:text-white text-xs transition-colors disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Command row (extracted to avoid re-render of whole list) ──────────────────
interface CommandRowProps {
  cmd: ShortcutCommand;
  binding: ShortcutBinding | null;
  isSelected: boolean;
  isRecording: boolean;
  onClick: (cmd: ShortcutCommand) => void;
  onShortcutClick: (cmd: ShortcutCommand, e: React.MouseEvent) => void;
}

const CommandRow: React.FC<CommandRowProps> = React.memo(({
  cmd, binding, isSelected, isRecording, onClick, onShortcutClick
}) => (
  <div
    onClick={() => onClick(cmd)}
    className={`flex items-center px-3 py-1.5 cursor-pointer border-b border-gray-700/20 transition-colors ${
      isSelected ? 'bg-blue-600/20' : 'hover:bg-gray-800/50'
    }`}
  >
    <span className="text-xs text-gray-300 w-48 truncate flex-shrink-0">{cmd.label}</span>
    <button
      onClick={e => onShortcutClick(cmd, e)}
      className={`text-xs px-2 py-0.5 border transition-colors min-w-[60px] text-left ${
        isRecording
          ? 'border-yellow-400/80 bg-yellow-400/10 text-yellow-400 animate-pulse'
          : 'border-gray-600/50 bg-gray-800/50 text-yellow-400/80 hover:border-yellow-400/40 hover:text-yellow-400'
      }`}
      style={{ borderRadius: 0, fontFamily: 'monospace' }}
    >
      {isRecording ? 'Press key…' : (binding ? formatBinding(binding) : '')}
    </button>
  </div>
));
CommandRow.displayName = 'CommandRow';

export default KeyboardShortcutsSettingsTab;
