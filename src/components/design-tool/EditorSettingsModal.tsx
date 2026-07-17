import React, { useState, useEffect } from 'react';
import { X, Settings, Grid2x2 as Grid, Keyboard, FileDown, Save, Zap, Monitor, Film, Globe, Magnet, Palette, Shapes, AlertCircle, Code2, Spline, SlidersHorizontal, Paintbrush } from 'lucide-react';
import { GridSettings } from '../../hooks/useGridSystem';
import DefaultShapesSettings from './DefaultShapesSettings';
import CodeEditorSettingsTab from './CodeEditorSettingsTab';
import KeyframeSettingsTab from './KeyframeSettingsTab';
import KeyboardShortcutsSettingsTab from './KeyboardShortcutsSettingsTab';
import AnimationSettingsTab from './AnimationSettingsTab';
import OthersSettingsTab from './OthersSettingsTab';
import AppearanceSettingsTab from './AppearanceSettingsTab';
import { useAnimation } from '../../animation-engine';

interface EditorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  gridSettings: GridSettings;
  updateGridSettings: (updates: Partial<GridSettings>) => void;
  shapeSnapEnabled?: boolean;
  onToggleShapeSnap?: () => void;
  canvasSize: { width: number; height: number };
  onCanvasSizeChange?: (size: { width: number; height: number }) => void;
  autoBackupInterval?: number;
  onAutoBackupIntervalChange?: (interval: number) => void;
}

type SettingsTab = 'project' | 'grid' | 'appearance' | 'shapes' | 'codeeditor' | 'keyframes' | 'shortcuts' | 'animations' | 'others' | 'export' | 'backup' | 'performance';

const EditorSettingsModal: React.FC<EditorSettingsModalProps> = ({
  isOpen,
  onClose,
  projectName,
  onProjectNameChange,
  gridSettings,
  updateGridSettings,
  shapeSnapEnabled = true,
  onToggleShapeSnap,
  canvasSize,
  onCanvasSizeChange,
  autoBackupInterval = 60000,
  onAutoBackupIntervalChange
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('project');

  const [localProjectName, setLocalProjectName] = useState(projectName);
  const [localResolution, setLocalResolution] = useState<'4k' | '2k' | '1080p' | '720p'>('4k');
  const [language, setLanguage] = useState<'English' | 'Italian' | 'Spanish' | 'French'>('English');

  const [localGridSettings, setLocalGridSettings] = useState(gridSettings);
  const [localShapeSnapEnabled, setLocalShapeSnapEnabled] = useState(shapeSnapEnabled);

  const [exportFormat, setExportFormat] = useState<'WebM'>('WebM');
  const [renderEngine, setRenderEngine] = useState<'Software'>('Software');
  const [sampleRate, setSampleRate] = useState<44100 | 48000>(48000);
  const [bitrate, setBitrate] = useState<128 | 192 | 256 | 320>(256);
  const [channels, setChannels] = useState<'Mono' | 'Stereo'>('Stereo');

  const [localAutoSaveInterval, setLocalAutoSaveInterval] = useState<1 | 5 | 10>(
    Math.round(autoBackupInterval / 60000) as 1 | 5 | 10
  );
  const [crashRecovery, setCrashRecovery] = useState(true);

  const [gpuAcceleration, setGpuAcceleration] = useState(true);
  const [cacheSize, setCacheSize] = useState<512 | 1024 | 2048 | 4096>(2048);
  const [playbackQuality, setPlaybackQuality] = useState<'Full' | 'Half' | 'Quarter'>('Quarter');
  const [backgroundRendering, setBackgroundRendering] = useState(true);

  const animation = useAnimation();

  useEffect(() => { setLocalProjectName(projectName); }, [projectName]);
  useEffect(() => { setLocalGridSettings(gridSettings); }, [gridSettings]);
  useEffect(() => { setLocalShapeSnapEnabled(shapeSnapEnabled); }, [shapeSnapEnabled]);

  useEffect(() => {
    if (canvasSize.width === 3840) setLocalResolution('4k');
    else if (canvasSize.width === 2560) setLocalResolution('2k');
    else if (canvasSize.width === 1920) setLocalResolution('1080p');
    else if (canvasSize.width === 1280) setLocalResolution('720p');
  }, [canvasSize]);

  useEffect(() => {
    setLocalAutoSaveInterval(Math.round(autoBackupInterval / 60000) as 1 | 5 | 10);
  }, [autoBackupInterval]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'project' as SettingsTab, label: 'Project', icon: Settings },
    { id: 'appearance' as SettingsTab, label: 'Appearance', icon: Paintbrush },
    { id: 'grid' as SettingsTab, label: 'Grid', icon: Grid },
    { id: 'shapes' as SettingsTab, label: 'Default Shapes', icon: Shapes },
    { id: 'animations' as SettingsTab, label: 'Animations', icon: Zap },
    { id: 'keyframes' as SettingsTab, label: 'Keyframes', icon: Spline },
    { id: 'codeeditor' as SettingsTab, label: 'Code Editor', icon: Code2 },
    { id: 'shortcuts' as SettingsTab, label: 'Shortcuts', icon: Keyboard },
    { id: 'performance' as SettingsTab, label: 'Performance', icon: Zap },
    { id: 'export' as SettingsTab, label: 'Export', icon: FileDown },
    { id: 'backup' as SettingsTab, label: 'Backup', icon: Save },
    { id: 'others' as SettingsTab, label: 'Others', icon: SlidersHorizontal },
  ];

  const resolutionMap = {
    '4k': { width: 3840, height: 2160, label: '4K (3840 × 2160)' },
    '2k': { width: 2560, height: 1440, label: '2K (2560 × 1440)' },
    '1080p': { width: 1920, height: 1080, label: '1080p (1920 × 1080)' },
    '720p': { width: 1280, height: 720, label: '720p (1280 × 720)' }
  };

  const handleApplyProjectSettings = () => {
    onProjectNameChange(localProjectName);
    if (onCanvasSizeChange) {
      const newSize = resolutionMap[localResolution];
      onCanvasSizeChange({ width: newSize.width, height: newSize.height });
    }
  };

  const handleCancelProjectSettings = () => {
    setLocalProjectName(projectName);
    if (canvasSize.width === 3840) setLocalResolution('4k');
    else if (canvasSize.width === 2560) setLocalResolution('2k');
    else if (canvasSize.width === 1920) setLocalResolution('1080p');
    else if (canvasSize.width === 1280) setLocalResolution('720p');
  };

  const handleApplyGridSettings = () => {
    updateGridSettings(localGridSettings);
    if (onToggleShapeSnap && localShapeSnapEnabled !== shapeSnapEnabled) onToggleShapeSnap();
  };

  const handleCancelGridSettings = () => {
    setLocalGridSettings(gridSettings);
    setLocalShapeSnapEnabled(shapeSnapEnabled);
  };

  const handleApplyBackupSettings = () => {
    if (onAutoBackupIntervalChange) onAutoBackupIntervalChange(localAutoSaveInterval * 60000);
  };

  const handleCancelBackupSettings = () => {
    setLocalAutoSaveInterval(Math.round(autoBackupInterval / 60000) as 1 | 5 | 10);
    setCrashRecovery(true);
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${value ? 'bg-yellow-400' : 'bg-gray-600'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );

  const ToggleRow = ({ label, description, value, onChange }: { label: React.ReactNode; description: string; value: boolean; onChange: () => void }) => (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800/60 border border-gray-700/50">
      <div>
        <div className="text-xs font-medium text-white">{label}</div>
        <div className="text-[11px] text-gray-500 mt-0.5">{description}</div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );

  const BtnGroup = ({ options, value, onChange, disabled }: { options: { label: string; value: string; sub?: string; disabledKey?: boolean }[]; value: string; onChange: (v: string) => void; disabled?: (v: string) => boolean }) => (
    <div className="flex">
      {options.map((opt, i) => {
        const isDisabled = disabled ? disabled(opt.value) : false;
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(opt.value)}
            className={`flex-1 px-3 py-2 text-xs font-medium border-t border-b transition-colors ${i === 0 ? 'border-l' : ''} ${i === options.length - 1 ? 'border-r' : ''} ${
              isActive
                ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
                : isDisabled
                ? 'bg-gray-800/40 border-gray-700/40 text-gray-600 cursor-not-allowed'
                : 'bg-gray-800/40 border-gray-700/40 text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
            }`}
          >
            <div>{opt.label}</div>
            {opt.sub && <div className="text-[10px] opacity-60 mt-0.5">{opt.sub}</div>}
          </button>
        );
      })}
    </div>
  );

  const InfoBox = ({ text }: { text: string }) => (
    <div className="flex items-start gap-2 px-3 py-2 bg-blue-500/8 border border-blue-500/20">
      <AlertCircle className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
      <p className="text-[11px] text-blue-400/90">{text}</p>
    </div>
  );

  const ActionBar = ({ onCancel, onApply, applyLabel = 'Apply', cancelLabel = 'Cancel' }: { onCancel?: () => void; onApply?: () => void; applyLabel?: string; cancelLabel?: string }) => (
    <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-700/50">
      {onCancel && (
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 border border-gray-600/50 text-gray-300 hover:text-white transition-colors text-xs font-medium">
          {cancelLabel}
        </button>
      )}
      {onApply && (
        <button onClick={onApply} className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-gray-900 transition-colors text-xs font-semibold">
          {applyLabel}
        </button>
      )}
    </div>
  );

  const renderProjectSettings = () => {
    const activeSequence = animation.getActiveSequence();
    const hasSequence = !!activeSequence;

    return (
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1">Project Name</label>
          <input
            type="text"
            value={localProjectName}
            onChange={(e) => setLocalProjectName(e.target.value)}
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60 transition-colors"
            placeholder="Enter project name"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5 flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" /> Canvas Resolution
          </label>
          <BtnGroup
            options={Object.entries(resolutionMap).map(([k, v]) => ({ label: k.toUpperCase(), value: k, sub: `${v.width}×${v.height}` }))}
            value={localResolution}
            onChange={(v) => setLocalResolution(v as typeof localResolution)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5" /> Frame Rate (FPS)
          </label>
          {!hasSequence ? (
            <InfoBox text="Create a sequence to modify FPS settings. FPS is tied to sequences in this project." />
          ) : (
            <div className="px-3 py-2 bg-gray-800/60 border border-gray-700/50">
              <div className="text-xs text-gray-300"><span className="font-medium">Active Sequence:</span> {activeSequence.name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">FPS: {activeSequence.frameRate} fps — modify via sequence settings</div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Language
          </label>
          <BtnGroup
            options={['English', 'Italian', 'Spanish', 'French'].map(l => ({ label: l, value: l }))}
            value={language}
            onChange={(v) => setLanguage(v as typeof language)}
          />
        </div>

        <ActionBar onCancel={handleCancelProjectSettings} onApply={handleApplyProjectSettings} applyLabel="Apply Changes" />
      </div>
    );
  };

  const renderGridSettings = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" /> Grid Dimensions
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Columns</label>
            <input
              type="number" min="2" max="50"
              value={localGridSettings.columns}
              onChange={(e) => setLocalGridSettings({ ...localGridSettings, columns: Number(e.target.value) })}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Rows</label>
            <input
              type="number" min="2" max="50"
              value={localGridSettings.rows}
              onChange={(e) => setLocalGridSettings({ ...localGridSettings, rows: Number(e.target.value) })}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5" /> Appearance
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="color" value={localGridSettings.color}
            onChange={(e) => setLocalGridSettings({ ...localGridSettings, color: e.target.value })}
            className="w-8 h-8 cursor-pointer border border-gray-700/50 bg-transparent"
          />
          <input
            type="text" value={localGridSettings.color}
            onChange={(e) => setLocalGridSettings({ ...localGridSettings, color: e.target.value })}
            className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 block mb-1">Opacity: {Math.round(localGridSettings.opacity * 100)}%</label>
          <input
            type="range" min="0.1" max="1" step="0.1"
            value={localGridSettings.opacity}
            onChange={(e) => setLocalGridSettings({ ...localGridSettings, opacity: Number(e.target.value) })}
            className="w-full h-1.5 bg-gray-700 appearance-none cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-1">
        <ToggleRow label="Show Grid" description="Display grid lines on canvas" value={localGridSettings.enabled} onChange={() => setLocalGridSettings({ ...localGridSettings, enabled: !localGridSettings.enabled })} />
        <ToggleRow label="Snap to Grid" description="Align shapes to grid intersections" value={localGridSettings.snapEnabled} onChange={() => setLocalGridSettings({ ...localGridSettings, snapEnabled: !localGridSettings.snapEnabled })} />
        {onToggleShapeSnap && (
          <ToggleRow label={<span className="flex items-center gap-1"><Magnet className="w-3 h-3" />Shape Snapping</span>} description="Enable snapping between shapes" value={localShapeSnapEnabled} onChange={() => setLocalShapeSnapEnabled(!localShapeSnapEnabled)} />
        )}
        <ToggleRow label="Show Center Point" description="Display the canvas center marker" value={localGridSettings.showCenterPoint} onChange={() => setLocalGridSettings({ ...localGridSettings, showCenterPoint: !localGridSettings.showCenterPoint })} />
      </div>

      <div className="px-3 py-2 bg-gray-800/50 border border-gray-700/40">
        <div className="text-[11px] text-gray-500 space-y-0.5">
          <div><span className="text-gray-400">Cell size:</span> {Math.round(3840 / localGridSettings.columns)}px × {Math.round(2160 / localGridSettings.rows)}px</div>
          <div><span className="text-gray-400">Total cells:</span> {localGridSettings.columns * localGridSettings.rows}</div>
        </div>
      </div>

      <ActionBar onCancel={handleCancelGridSettings} onApply={handleApplyGridSettings} applyLabel="Apply Changes" />
    </div>
  );

  const renderShortcuts = () => {
    const categories = [
      { title: 'Shape Creation', shortcuts: [{ key: 'Q', d: 'Rectangle' }, { key: 'W', d: 'Circle' }, { key: 'E', d: 'Text' }, { key: 'R', d: 'Button' }, { key: 'T', d: 'Chat Bubble' }, { key: 'Y', d: 'Chat Frame' }, { key: 'U', d: 'Line' }] },
      { title: 'View', shortcuts: [{ key: '+', d: 'Zoom In (5%)' }, { key: '-', d: 'Zoom Out (5%)' }, { key: 'G', d: 'Toggle Grid' }] },
      { title: 'Edit', shortcuts: [{ key: 'Ctrl+Z', d: 'Undo' }, { key: 'Ctrl+Shift+Z', d: 'Redo' }, { key: 'Ctrl+D', d: 'Duplicate' }, { key: 'Del', d: 'Delete Selected' }] },
      { title: 'Selection', shortcuts: [{ key: 'Ctrl+A', d: 'Select All' }, { key: 'Esc', d: 'Deselect All' }, { key: 'Ctrl+G', d: 'Group' }, { key: 'Ctrl+Shift+G', d: 'Ungroup' }] },
      { title: 'Navigation', shortcuts: [{ key: '←↑↓→', d: 'Nudge 1px' }, { key: 'Shift+←↑↓→', d: 'Nudge 10px' }] },
      { title: 'Advanced', shortcuts: [{ key: 'Ctrl+E', d: 'Export' }, { key: 'Ctrl+;', d: 'Toggle Snapping' }] },
    ];

    return (
      <div className="space-y-4">
        <InfoBox text="Shape shortcuts are disabled when typing in text fields. Press the key directly without modifiers." />
        {categories.map((cat, i) => (
          <div key={i}>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{cat.title}</div>
            <div className="border border-gray-700/40 divide-y divide-gray-700/40">
              {cat.shortcuts.map((s, j) => (
                <div key={j} className="flex items-center justify-between px-3 py-1.5 bg-gray-800/30 hover:bg-gray-800/60 transition-colors">
                  <span className="text-xs text-gray-300">{s.d}</span>
                  <kbd className="px-2 py-0.5 bg-gray-900 border border-gray-600/50 text-[11px] font-mono text-yellow-400">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderExportSettings = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5">Default Export Format</label>
        <BtnGroup
          options={[
            { label: 'WebM', value: 'WebM' },
            { label: 'MP4', value: 'MP4', sub: 'Soon' },
            { label: 'MOV', value: 'MOV', sub: 'Soon' },
            { label: 'GIF', value: 'GIF', sub: 'Soon' },
          ]}
          value={exportFormat}
          onChange={(v) => { if (v === 'WebM') setExportFormat('WebM'); }}
          disabled={(v) => v !== 'WebM'}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5">Render Engine</label>
        <BtnGroup
          options={[{ label: 'Software', value: 'Software' }, { label: 'GPU', value: 'GPU', sub: 'Soon' }, { label: 'Hybrid', value: 'Hybrid', sub: 'Soon' }]}
          value={renderEngine}
          onChange={(v) => { if (v === 'Software') setRenderEngine('Software'); }}
          disabled={(v) => v !== 'Software'}
        />
        <div className="mt-1.5">
          <InfoBox text="GPU and Hybrid rendering engines will be added in future updates." />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5">Audio Settings</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Sample Rate</label>
            <select value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value) as typeof sampleRate)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60">
              <option value={44100}>44.1 kHz</option>
              <option value={48000}>48 kHz</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">Bitrate</label>
            <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value) as typeof bitrate)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700/50 text-white text-xs focus:outline-none focus:border-yellow-400/60">
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={256}>256 kbps</option>
              <option value={320}>320 kbps</option>
            </select>
          </div>
        </div>
        <BtnGroup
          options={['Mono', 'Stereo'].map(c => ({ label: c, value: c }))}
          value={channels}
          onChange={(v) => setChannels(v as typeof channels)}
        />
      </div>

      <ActionBar onApply={() => { setExportFormat('WebM'); setRenderEngine('Software'); setSampleRate(48000); setBitrate(256); setChannels('Stereo'); }} applyLabel="Reset to Defaults" />
    </div>
  );

  const renderBackupSettings = () => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-400 block mb-1.5">Auto-Save Interval</label>
        <BtnGroup
          options={[1, 5, 10].map(n => ({ label: `${n} min`, value: String(n) }))}
          value={String(localAutoSaveInterval)}
          onChange={(v) => setLocalAutoSaveInterval(Number(v) as typeof localAutoSaveInterval)}
        />
        <div className="mt-1.5">
          <InfoBox text="Changing the auto-save interval updates the automatic backup frequency for your project." />
        </div>
      </div>

      <div className="space-y-1">
        <ToggleRow label="Crash Recovery" description="Enable automatic session restore" value={crashRecovery} onChange={() => setCrashRecovery(!crashRecovery)} />
      </div>

      <div className="space-y-1">
        <button className="w-full px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 text-white transition-colors text-left">
          <div className="text-xs font-medium">Manual Backup</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Export project backup</div>
        </button>
        <button className="w-full px-3 py-2 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 text-white transition-colors text-left">
          <div className="text-xs font-medium">Backup Restore</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Load from backup history</div>
        </button>
      </div>

      <ActionBar onCancel={handleCancelBackupSettings} onApply={handleApplyBackupSettings} applyLabel="Apply Changes" />
    </div>
  );

  const renderPerformanceSettings = () => {
    const is4K = canvasSize.width === 3840 && canvasSize.height === 2160;

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <ToggleRow label="GPU Acceleration" description="Use hardware acceleration for rendering" value={gpuAcceleration} onChange={() => setGpuAcceleration(!gpuAcceleration)} />
          <ToggleRow label="Background Rendering" description="Render while working on other tasks" value={backgroundRendering} onChange={() => setBackgroundRendering(!backgroundRendering)} />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5">Cache Size (MB)</label>
          <BtnGroup
            options={[512, 1024, 2048, 4096].map(s => ({ label: String(s), value: String(s) }))}
            value={String(cacheSize)}
            onChange={(v) => setCacheSize(Number(v) as typeof cacheSize)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1.5">Playback Quality</label>
          <BtnGroup
            options={['Full', 'Half', 'Quarter'].map(q => ({ label: q, value: q, sub: is4K && q === 'Full' ? 'Disabled' : undefined }))}
            value={playbackQuality}
            onChange={(v) => setPlaybackQuality(v as typeof playbackQuality)}
            disabled={(v) => is4K && v === 'Full'}
          />
          {is4K && (
            <div className="mt-1.5">
              <InfoBox text="Full quality playback is disabled for 4K canvases to ensure smooth performance." />
            </div>
          )}
        </div>

        <ActionBar onApply={() => { setGpuAcceleration(true); setCacheSize(2048); setPlaybackQuality('Quarter'); setBackgroundRendering(true); }} applyLabel="Reset to Defaults" />
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'project': return renderProjectSettings();
      case 'appearance': return <AppearanceSettingsTab />;
      case 'grid': return renderGridSettings();
      case 'shapes': return <DefaultShapesSettings />;
      case 'codeeditor': return <CodeEditorSettingsTab />;
      case 'keyframes': return <KeyframeSettingsTab />;
      case 'shortcuts': return <KeyboardShortcutsSettingsTab />;
      case 'animations': return <AnimationSettingsTab />;
      case 'others': return <OthersSettingsTab />;
      case 'export': return renderExportSettings();
      case 'backup': return renderBackupSettings();
      case 'performance': return renderPerformanceSettings();
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700/60 shadow-2xl w-full flex overflow-hidden max-w-4xl h-[680px]">
        {/* Sidebar */}
        <div className="w-48 bg-gray-800/60 border-r border-gray-700/50 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-700/50 flex-shrink-0">
            <h2 className="text-sm font-bold text-white tracking-wide">Editor Settings</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Configure your workspace</p>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 transition-colors text-left ${
                    activeTab === tab.id
                      ? 'bg-yellow-400/15 text-yellow-400 border-l-2 border-yellow-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-l-2 border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {tabs.find(t => t.id === activeTab)?.label}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {activeTab === 'project' && 'Configure project properties'}
                {activeTab === 'appearance' && 'Canvas, timeline, layers, media, and UI appearance'}
                {activeTab === 'grid' && 'Customize grid system'}
                {activeTab === 'shapes' && 'Set default properties for new shapes'}
                {activeTab === 'codeeditor' && 'Customize the JSON code editor appearance and behavior'}
                {activeTab === 'keyframes' && 'Customize keyframe curve colors, handle shapes, and editor appearance'}
                {activeTab === 'shortcuts' && 'Visual keyboard layout and command binding editor'}
                {activeTab === 'animations' && 'Default timing and easing for every animation preset'}
                {activeTab === 'others' && 'Starting tab, default background, and default sequence settings'}
                {activeTab === 'export' && 'Configure export and rendering'}
                {activeTab === 'backup' && 'Manage backups and recovery'}
                {activeTab === 'performance' && 'Optimize performance settings'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700/50 transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className={`flex-1 min-h-0 ${activeTab === 'shapes' || activeTab === 'shortcuts' || activeTab === 'animations' || activeTab === 'appearance' ? 'overflow-hidden' : 'overflow-y-auto p-4'}`}>
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorSettingsModal;
