import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store/editor';
import { useHistoryStore } from '../../store/history';
import { useTimelineStore } from '../../store/timeline';
import { usePanelStore } from '../../store/panels';
import { useGridStore } from '../../store/grid';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { useRecoveryStore } from '../../store/recovery';
import { useSettingsStore } from '../../settings/store';
import { useShapeDefaultsStore } from '../../store/shapeDefaults';
import { ExportModal } from './ExportModal';
import { GridSettingsPanel } from './GridSettingsPanel';
import { BackgroundRemovalPanel } from './background-removal';
import {
  FilePlus, FolderOpen, Save, Download, Upload,
  Cog, MonitorPlay, FileCode, SlidersHorizontal,
  Square, Paintbrush, Grid3x3, Sparkles, Shuffle, Settings2, Scissors,
} from 'lucide-react';
import { useInspectorStore, type InspectorTab } from '../../store/inspector';
import { IconLibraryModal } from '../../components/icons/IconLibraryModal';
import { rasterizeIconToFile } from '../../components/icons/rasterizeIcon';
import type { IconData } from '../../components/icons/types';
import { BrandColorPicker } from '../components/BrandColorPicker';

interface MenuItem {
  label: string;
  shortcut?: string;
  divider?: boolean;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export function Toolbar() {
  const composition = useEditorStore((s) => s.composition);
  const setCompositionSetting = useEditorStore((s) => s.setCompositionSetting);
  const selection = useEditorStore((s) => s.selection);
  const deselectAll = useEditorStore((s) => s.deselectAll);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const removeLayers = useEditorStore((s) => s.removeLayers);
  const createGroup = useEditorStore((s) => s.createGroup);
  const ungroupSelection = useEditorStore((s) => s.ungroupSelection);
  const precomposeSelection = useEditorStore((s) => s.precomposeSelection);
  const reorderLayers = useEditorStore((s) => s.reorderLayers);
  const addImage = useEditorStore((s) => s.addImage);
  const copySelection = useEditorStore((s) => s.copySelection);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);
  const clipboard = useEditorStore((s) => s.clipboard);
  const randomizeColors = useEditorStore((s) => s.randomizeColors);
  const toggleRandomizeColors = useEditorStore((s) => s.toggleRandomizeColors);
  const enableLayerEffect = useEditorStore((s) => s.enableLayerEffect);

  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel);

  const panels = usePanelStore((s) => s.panels);
  const toggleVisible = usePanelStore((s) => s.toggleVisible);
  const setVisible = usePanelStore((s) => s.setVisible);

  const saveCurrentProject = useProjectStore((s) => s.saveCurrentProject);
  const closeProject = useProjectStore((s) => s.closeProject);
  const currentProjectId = useProjectStore((s) => s.activeProjectId);
  const exportProject = useProjectStore((s) => s.exportProject);
  const importProject = useProjectStore((s) => s.importProject);
  const openProject = useProjectStore((s) => s.openProject);

  const openResetDialog = useRecoveryStore((s) => s.openResetDialog);

  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [showBgRemoval, setShowBgRemoval] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const gridVisible = useGridStore((s) => s.grid.visible);
  const setGridVisible = useGridStore((s) => s.setGridVisible);
  const guidesVisible = useGridStore((s) => s.guides.visible);
  const setGuidesVisible = useGridStore((s) => s.setGuidesVisible);

  const hasSelection = selection.selectedIds.length > 0;
  const hasMultiSelection = selection.selectedIds.length > 1;
  const activeLayer = composition.layers.find((l) => l.id === selection.activeId);
  const isImageSel = activeLayer?.type === 'image';

  // Cut = copy then delete the selection.
  const handleCut = useCallback(() => {
    if (selection.selectedIds.length === 0) return;
    copySelection();
    removeLayers(selection.selectedIds);
  }, [selection.selectedIds, copySelection, removeLayers]);

  // Reveal the Inspector on a given tab (used by the Effects menu). Ensures the
  // Properties panel is visible, then asks the Inspector to switch tabs.
  const revealInspectorTab = useCallback((tab: InspectorTab) => {
    setVisible('properties', true);
    useInspectorStore.getState().requestTab(tab);
  }, [setVisible]);

  // Enable a layer effect on the active selection and reveal the Effects tab.
  const applyEffect = useCallback((kind: 'shadow' | 'glow' | 'blur') => {
    const id = selection.activeId ?? selection.selectedIds[0];
    if (!id) return;
    enableLayerEffect(id, kind);
    revealInspectorTab('effects');
  }, [selection.activeId, selection.selectedIds, enableLayerEffect, revealInspectorTab]);

  const handleSave = useCallback(() => {
    if (currentProjectId) {
      saveCurrentProject();
    }
  }, [currentProjectId, saveCurrentProject]);

  const ffxInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadProject = useCallback(() => {
    if (!currentProjectId) return;
    saveCurrentProject();
    exportProject(currentProjectId, composition).catch((err) =>
      alert(err instanceof Error ? err.message : 'Failed to download project')
    );
  }, [currentProjectId, saveCurrentProject, composition, exportProject]);

  const handleImportProject = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (ffxInputRef.current) ffxInputRef.current.value = '';
      if (!file) return;
      try {
        const metadata = await importProject(file);
        await openProject(metadata.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to import project');
      }
    },
    [importProject, openProject]
  );

  const handleSelectAll = useCallback(() => {
    composition.layers.forEach((l) => selectLayer(l.id, true));
  }, [composition.layers, selectLayer]);

  const handleDuplicate = useCallback(() => {
    if (hasSelection) duplicateSelection();
  }, [hasSelection, duplicateSelection]);

  const handleDelete = useCallback(() => {
    const ids = selection.selectedIds.length > 0
      ? selection.selectedIds
      : selection.activeId ? [selection.activeId] : [];
    if (ids.length > 0) removeLayers(ids);
  }, [selection.selectedIds, selection.activeId, removeLayers]);

  const handleBringToFront = useCallback(() => {
    if (selection.selectedIds.length > 0) {
      reorderLayers(selection.selectedIds, 0);
    }
  }, [selection.selectedIds, reorderLayers]);

  const handleBringForward = useCallback(() => {
    if (!selection.activeId) return;
    const idx = composition.layers.findIndex((l) => l.id === selection.activeId);
    if (idx > 0) reorderLayers([selection.activeId], idx - 1);
  }, [selection.activeId, composition.layers, reorderLayers]);

  const handleSendBackward = useCallback(() => {
    if (!selection.activeId) return;
    const idx = composition.layers.findIndex((l) => l.id === selection.activeId);
    if (idx < composition.layers.length - 1) reorderLayers([selection.activeId], idx + 2);
  }, [selection.activeId, composition.layers, reorderLayers]);

  const handleSendToBack = useCallback(() => {
    if (selection.selectedIds.length > 0) {
      reorderLayers(selection.selectedIds, composition.layers.length);
    }
  }, [selection.selectedIds, composition.layers.length, reorderLayers]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel(Math.min(zoomLevel * 1.3, 10));
  }, [zoomLevel, setZoomLevel]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(Math.max(zoomLevel / 1.3, 0.2));
  }, [zoomLevel, setZoomLevel]);

  const handleFitToWindow = useCallback(() => {
    setZoomLevel(1);
  }, [setZoomLevel]);

  const handleFullScreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleNewProject = useCallback(() => {
    if (closeProject) closeProject();
  }, [closeProject]);

  const handleInsertIcon = useCallback(
    async (icon: IconData, color: string) => {
      if (!currentProjectId) return;
      try {
        const file = await rasterizeIconToFile(icon, { color, size: 256 });
        await addImage(file, currentProjectId);
      } catch (err) {
        console.error('Failed to insert icon', err);
      }
    },
    [currentProjectId, addImage]
  );

  const menus: MenuGroup[] = [
    {
      label: 'File',
      items: [
        { label: 'New Project', shortcut: 'Ctrl+N', action: handleNewProject },
        { label: 'Open...', shortcut: 'Ctrl+O', action: handleNewProject },
        { label: 'Open Recent', disabled: true },
        { label: '', divider: true },
        { label: 'Save', shortcut: 'Ctrl+S', action: handleSave, disabled: !currentProjectId },
        { label: 'Save As...', shortcut: 'Ctrl+Shift+S', disabled: true },
        { label: '', divider: true },
        { label: 'Import Project (.ffx)', shortcut: 'Ctrl+I', action: () => ffxInputRef.current?.click() },
        { label: 'Download Project (.ffx)', action: handleDownloadProject, disabled: !currentProjectId },
        { label: 'Export Video...', shortcut: 'Ctrl+E', action: () => setShowExport(true) },
        { label: '', divider: true },
        { label: 'Project Settings...', action: () => setShowSettings(true) },
        { label: 'Close', shortcut: 'Ctrl+Q', action: handleNewProject },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: undo },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: redo },
        { label: '', divider: true },
        { label: 'Cut', shortcut: 'Ctrl+X', action: handleCut, disabled: !hasSelection },
        { label: 'Copy', shortcut: 'Ctrl+C', action: copySelection, disabled: !hasSelection },
        { label: 'Paste', shortcut: 'Ctrl+V', action: pasteClipboard, disabled: !clipboard },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: handleDuplicate, disabled: !hasSelection },
        { label: 'Delete', shortcut: 'Del', action: handleDelete, disabled: !hasSelection },
        { label: '', divider: true },
        { label: 'Select All', shortcut: 'Ctrl+A', action: handleSelectAll },
        { label: 'Deselect All', shortcut: 'Ctrl+Shift+A', action: deselectAll },
        { label: '', divider: true },
        { label: 'Preferences...', action: () => useSettingsStore.getState().openSettings() },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: 'Ctrl+=', action: handleZoomIn },
        { label: 'Zoom Out', shortcut: 'Ctrl+-', action: handleZoomOut },
        { label: 'Fit to Window', shortcut: 'Ctrl+0', action: handleFitToWindow },
        { label: '100%', shortcut: 'Ctrl+1', action: () => setZoomLevel(1) },
        { label: '', divider: true },
        { label: `${gridVisible ? '\u2713' : '  '} Show Grid`, shortcut: 'Ctrl+\'', action: () => setGridVisible(!gridVisible) },
        { label: `${guidesVisible ? '\u2713' : '  '} Show Guides`, shortcut: 'Ctrl+;', action: () => setGuidesVisible(!guidesVisible) },
        { label: '', divider: true },
        { label: `${panels.layers.visible ? '\u2713' : '  '} Layers`, action: () => toggleVisible('layers') },
        { label: `${panels.properties.visible ? '\u2713' : '  '} Properties`, action: () => toggleVisible('properties') },
        { label: `${panels.timeline.visible ? '\u2713' : '  '} Timeline`, action: () => toggleVisible('timeline') },
        { label: '', divider: true },
        { label: 'Full Screen', shortcut: 'F11', action: handleFullScreen },
      ],
    },
    {
      label: 'Object',
      items: [
        { label: 'Group', shortcut: 'Ctrl+G', action: createGroup, disabled: !hasMultiSelection },
        { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', action: ungroupSelection, disabled: !hasSelection },
        { label: 'Precompose', shortcut: 'Ctrl+Shift+C', action: precomposeSelection, disabled: !hasSelection },
        { label: '', divider: true },
        { label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', action: handleBringToFront, disabled: !hasSelection },
        { label: 'Bring Forward', shortcut: 'Ctrl+]', action: handleBringForward, disabled: !hasSelection },
        { label: 'Send Backward', shortcut: 'Ctrl+[', action: handleSendBackward, disabled: !hasSelection },
        { label: 'Send to Back', shortcut: 'Ctrl+Shift+[', action: handleSendToBack, disabled: !hasSelection },
        { label: '', divider: true },
        { label: 'Transform...', disabled: true },
        { label: 'Align...', disabled: true },
      ],
    },
    {
      label: 'Path',
      items: [
        { label: 'Object to Path', shortcut: 'Ctrl+Shift+C', disabled: true },
        { label: 'Stroke to Path', shortcut: 'Ctrl+Alt+C', disabled: true },
        { label: '', divider: true },
        { label: 'Union', shortcut: 'Ctrl+Shift+U', disabled: true },
        { label: 'Intersection', disabled: true },
        { label: 'Difference', disabled: true },
        { label: 'Exclusion', disabled: true },
        { label: '', divider: true },
        { label: 'Simplify', shortcut: 'Ctrl+L', disabled: true },
        { label: 'Reverse', disabled: true },
      ],
    },
    {
      label: 'Scene',
      items: [
        { label: 'New Scene', disabled: true },
        { label: 'Duplicate Scene', disabled: true },
        { label: 'Delete Scene', disabled: true },
        { label: '', divider: true },
        { label: 'Scene Settings...', disabled: true },
        { label: 'Composition Settings...', shortcut: 'Ctrl+K', action: () => setShowSettings(true) },
      ],
    },
    {
      label: 'Effects',
      items: [
        { label: 'Remove Background...', action: () => setShowBgRemoval(true) },
        { label: '', divider: true },
        { label: 'Blur...', action: () => applyEffect('blur'), disabled: !hasSelection },
        { label: 'Shadow...', action: () => applyEffect('shadow'), disabled: !hasSelection },
        { label: 'Glow...', action: () => applyEffect('glow'), disabled: !hasSelection },
        { label: '', divider: true },
        { label: 'Color Correction...', action: () => revealInspectorTab('colorCorrection'), disabled: !isImageSel },
        { label: 'Distort...', disabled: true },
        { label: '', divider: true },
        { label: 'Add Expression...', action: () => revealInspectorTab('code'), disabled: !hasSelection },
        { label: 'Manage Effects...', disabled: true },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation', shortcut: 'F1', action: () => alert('In-app documentation is coming soon. For now, see Help → Keyboard Shortcuts for the controls reference.') },
        { label: 'Keyboard Shortcuts...', action: () => setShowShortcuts(true) },
        { label: '', divider: true },
        { label: 'Reset Editor...', action: openResetDialog },
        { label: '', divider: true },
        { label: 'Check for Updates...', action: () => alert('FlashFX runs in your browser and is always up to date — there is nothing to install or update.') },
        { label: 'About FlashFX', action: () => alert('FlashFX - Motion Graphics Editor\nVersion 1.0.0') },
      ],
    },
  ];

  return (
    <>
      {/* Row 1: Menu bar */}
      <div className="h-[22px] bg-transparent flex items-center px-1 relative z-50">
        {menus.map((menu) => (
          <MenuDropdown
            key={menu.label}
            label={menu.label}
            items={menu.items}
            isOpen={openMenu === menu.label}
            onOpen={() => setOpenMenu(menu.label)}
            onClose={() => setOpenMenu(null)}
            onHover={() => { if (openMenu) setOpenMenu(menu.label); }}
          />
        ))}
      </div>

      {/* Row 2: Toolbar with action buttons */}
      <div className="h-[28px] bg-[#0a1628]/60 border-t border-[#1a2a42]/50 flex items-center px-2 gap-0.5 relative z-40">
        <ToolbarButton icon={FilePlus} label="New" onClick={handleNewProject} />
        <ToolbarButton icon={FolderOpen} label="Open" onClick={handleNewProject} />
        <ToolbarButton icon={Save} label="Save" onClick={handleSave} />
        <ToolbarSep />
        <ToolbarButton icon={Upload} label="Import" onClick={() => ffxInputRef.current?.click()} />
        <ToolbarButton icon={Download} label="Download" onClick={handleDownloadProject} />
        <ToolbarSep />
        <ToolbarButton icon={Cog} label="Render" onClick={() => setShowExport(true)} />
        <ToolbarButton icon={MonitorPlay} label="Preview" onClick={() => { const t = useTimelineStore.getState(); if (t.isPlaying) t.pause(); else t.play(); }} />
        <ToolbarButton icon={FileCode} label="Export" onClick={() => setShowExport(true)} />
        <ToolbarSep />
        <ToolbarButton icon={SlidersHorizontal} label="Settings" onClick={() => setShowSettings(!showSettings)} />
        <ToolbarButton icon={Settings2} label="Preferences" onClick={() => useSettingsStore.getState().openSettings()} />
        <ToolbarButton icon={Grid3x3} label="Grid" onClick={() => setShowGrid(!showGrid)} />
        <ToolbarButton icon={Sparkles} label="Icons" onClick={() => setShowIconLibrary(true)} />
        <ToolbarButton icon={Scissors} label="BG Remove" onClick={() => setShowBgRemoval(true)} />
        <ToolbarSep />
        <button
          onClick={toggleRandomizeColors}
          title="Randomize fill color on copy / paste / duplicate"
          className={`flex items-center gap-1 px-1.5 h-[22px] text-[10px] rounded transition-colors ${
            randomizeColors
              ? 'bg-[#f7b500]/10 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
              : 'text-slate-400 hover:text-slate-100 hover:bg-[#1a2a42]'
          }`}
        >
          <Shuffle size={12} strokeWidth={1.5} />
          <span>Randomize Colors</span>
        </button>

        <div className="flex-1" />

        {/* Right side: Fill / Stroke / Background controls */}
        <div className="flex items-center gap-2">
          <ToolbarColorControl type="fill" />
          <ToolbarColorControl type="stroke" />
          <ToolbarColorControl type="background" />
        </div>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />
          <div className="absolute top-[52px] left-[320px] z-50 bg-[#0e1c32] border border-[#1a2a42] rounded-lg p-3 shadow-xl w-56">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">Composition</div>
            <div className="space-y-2">
              <SettingRow label="Width" value={composition.settings.width} onChange={(v) => setCompositionSetting('width', v)} />
              <SettingRow label="Height" value={composition.settings.height} onChange={(v) => setCompositionSetting('height', v)} />
              <SettingRow label="FPS" value={composition.settings.frameRate} onChange={(v) => setCompositionSetting('frameRate', v)} />
              <SettingRow
                label="Min Duration"
                value={composition.settings.minimumDurationFrames ?? composition.settings.durationFrames}
                onChange={(v) => setCompositionSetting('minimumDurationFrames', v)}
                suffix="frames"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                <span>Actual</span>
                <span className="font-mono tabular-nums">{composition.settings.durationFrames} frames</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showGrid && <GridSettingsPanel onClose={() => setShowGrid(false)} />}
      {showBgRemoval && <BackgroundRemovalPanel onClose={() => setShowBgRemoval(false)} />}
      <IconLibraryModal
        isOpen={showIconLibrary}
        onClose={() => setShowIconLibrary(false)}
        onInsert={handleInsertIcon}
      />
      <input
        ref={ffxInputRef}
        type="file"
        accept=".ffx"
        className="hidden"
        onChange={handleImportProject}
      />
    </>
  );
}

function MenuDropdown({
  label, items, isOpen, onOpen, onClose, onHover,
}: {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onHover: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { if (isOpen) onClose(); else onOpen(); }}
        onMouseEnter={onHover}
        className={`px-2 h-[22px] text-[11px] font-medium transition-colors rounded-sm ${
          isOpen ? 'bg-white/[0.06] text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-0.5 z-50 bg-[#0e1c32] border border-[#1a2a42] rounded-md shadow-2xl shadow-black/50 py-1 min-w-[200px]">
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="h-px bg-[#1a2a42] my-1 mx-2" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.action) item.action();
                  onClose();
                }}
                disabled={item.disabled}
                className={`w-full flex items-center gap-3 px-3 py-1 text-[11px] transition-colors ${
                  item.disabled
                    ? 'text-slate-600 cursor-default'
                    : 'text-slate-300 hover:bg-white/[0.05] hover:text-slate-100 cursor-pointer'
                }`}
              >
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && (
                  <span className={`text-[10px] font-mono ${item.disabled ? 'text-slate-700' : 'text-slate-600'}`}>
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick }: { icon: typeof Save; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 h-[22px] text-[10px] text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] rounded transition-colors"
    >
      <Icon size={12} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  );
}

function ToolbarSep() {
  return <div className="w-px h-3.5 bg-[#1a2a42]/70 mx-1" />;
}

function rgbaToHex(c: [number, number, number, number]): string {
  const r = Math.round(c[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(c[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(c[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b, alpha];
}

function ToolbarColorControl({ type }: { type: 'fill' | 'stroke' | 'background' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fillColor = useShapeDefaultsStore((s) => s.fillColor);
  const strokeColor = useShapeDefaultsStore((s) => s.strokeColor);
  const setFillColor = useShapeDefaultsStore((s) => s.setFillColor);
  const setStrokeColor = useShapeDefaultsStore((s) => s.setStrokeColor);

  const composition = useEditorStore((s) => s.composition);
  const updateBackgroundLayer = useEditorStore((s) => s.updateBackgroundLayer);

  const bgLayer = composition.background.layers[0];
  const bgStop = bgLayer?.stops[0];
  const bgColor: [number, number, number, number] = bgStop
    ? [bgStop.color[0], bgStop.color[1], bgStop.color[2], bgStop.opacity]
    : [0.08, 0.09, 0.12, 1];

  const currentColor = type === 'fill' ? fillColor : type === 'stroke' ? strokeColor : bgColor;
  const hex = rgbaToHex(currentColor);

  const label = type === 'fill' ? 'Fill' : type === 'stroke' ? 'Stroke' : 'BG';
  const Icon = type === 'fill' ? Paintbrush : Square;
  const isOutline = type === 'stroke';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleColorChange = (newHex: string) => {
    const rgba = hexToRgba(newHex, currentColor[3]);
    if (type === 'fill') {
      setFillColor(rgba);
    } else if (type === 'stroke') {
      setStrokeColor(rgba);
    } else if (bgLayer) {
      const newStops = bgLayer.stops.map((s, i) =>
        i === 0 ? { ...s, color: [rgba[0], rgba[1], rgba[2]] as [number, number, number], opacity: rgba[3] } : s
      );
      updateBackgroundLayer(bgLayer.id, { stops: newStops });
    }
  };

  const handleBrandSelect = (rgba: [number, number, number, number]) => {
    if (type === 'fill') {
      setFillColor(rgba);
    } else if (type === 'stroke') {
      setStrokeColor(rgba);
    } else if (bgLayer) {
      const newStops = bgLayer.stops.map((s, i) =>
        i === 0 ? { ...s, color: [rgba[0], rgba[1], rgba[2]] as [number, number, number], opacity: rgba[3] } : s
      );
      updateBackgroundLayer(bgLayer.id, { stops: newStops });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 hover:bg-[#1a2a42]/60 px-1 py-0.5 rounded transition-colors"
      >
        <Icon size={11} strokeWidth={1.5} className="text-slate-500" />
        <div
          className="w-5 h-3 rounded-sm"
          style={{
            backgroundColor: isOutline ? 'transparent' : hex,
            border: isOutline ? `1.5px solid ${hex}` : '1px solid #1a2a42',
          }}
        />
        <span className="text-[9px] text-slate-500">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-[#0e1c32] border border-[#1a2a42] rounded-lg p-3 shadow-xl shadow-black/50 w-48">
          <div className="text-[10px] text-slate-400 font-medium mb-2">
            {type === 'fill' ? 'Default Fill Color' : type === 'stroke' ? 'Default Stroke Color' : 'Background Color'}
          </div>
          <input
            type="color"
            value={hex}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-full h-8 rounded cursor-pointer border border-[#1a2a42] bg-transparent"
          />
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] text-slate-500 font-mono">{hex.toUpperCase()}</span>
            <div className="flex-1" />
            <BrandColorPicker onSelect={handleBrandSelect} currentAlpha={currentColor[3]} />
          </div>
          {type !== 'background' && (
            <p className="text-[9px] text-slate-600 mt-2 leading-relaxed">
              New shapes will use this {type} color.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, value, onChange, suffix }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-slate-500 w-14">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 bg-[#122240] text-[11px] text-slate-300 px-1.5 py-0.5 rounded border border-[#1a2a42] focus:border-yellow-400/50 outline-none"
      />
      {suffix && <span className="text-[9px] text-slate-600">{suffix}</span>}
    </div>
  );
}

const SHORTCUTS_DATA = [
  { category: 'File', shortcuts: [
    { keys: 'Ctrl+N', desc: 'New Project' },
    { keys: 'Ctrl+S', desc: 'Save' },
    { keys: 'Ctrl+E', desc: 'Export' },
  ]},
  { category: 'Edit', shortcuts: [
    { keys: 'Ctrl+Z', desc: 'Undo' },
    { keys: 'Ctrl+Shift+Z', desc: 'Redo' },
    { keys: 'Ctrl+D', desc: 'Duplicate' },
    { keys: 'Delete', desc: 'Delete Layer' },
    { keys: 'Ctrl+A', desc: 'Select All' },
  ]},
  { category: 'View', shortcuts: [
    { keys: 'Ctrl+=', desc: 'Zoom In' },
    { keys: 'Ctrl+-', desc: 'Zoom Out' },
    { keys: 'Ctrl+0', desc: 'Reset Zoom' },
    { keys: 'F11', desc: 'Full Screen' },
  ]},
  { category: 'Object', shortcuts: [
    { keys: 'Ctrl+G', desc: 'Group' },
    { keys: 'Ctrl+Shift+G', desc: 'Ungroup' },
    { keys: 'Ctrl+]', desc: 'Bring Forward' },
    { keys: 'Ctrl+[', desc: 'Send Backward' },
  ]},
  { category: 'Timeline', shortcuts: [
    { keys: 'Space', desc: 'Play / Pause' },
    { keys: 'S', desc: 'Split at Playhead' },
    { keys: 'Q', desc: 'Trim Left' },
    { keys: 'W', desc: 'Trim Right' },
  ]},
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-[#0e1c32] border border-[#1c3155] rounded-xl shadow-2xl w-[520px] max-h-[70vh] overflow-hidden pointer-events-auto">
          <div className="px-5 py-3 border-b border-[#1c3155] flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-slate-200">Keyboard Shortcuts</h2>
            <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">ESC</button>
          </div>
          <div className="overflow-y-auto max-h-[55vh] p-5">
            <div className="grid grid-cols-2 gap-6">
              {SHORTCUTS_DATA.map((group) => (
                <div key={group.category}>
                  <h3 className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{group.category}</h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((s) => (
                      <div key={s.keys} className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{s.desc}</span>
                        <kbd className="text-[9px] text-slate-500 bg-[#122240] border border-[#1c3155] rounded px-1.5 py-0.5 font-mono">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
