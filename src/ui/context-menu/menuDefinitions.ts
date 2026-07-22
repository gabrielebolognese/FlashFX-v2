import {
  ZoomIn, ZoomOut, Maximize, Grid3x3, Magnet, Plus, Square, Circle, Type, Folder,
  Clipboard, Copy, Scissors, Trash2, Pencil, MoveVertical, ArrowUp, ArrowDown,
  ChevronsUp, ChevronsDown, RotateCcw, Sparkles, Layers, Film, Image, Music,
  Volume2, VolumeX, Upload, FolderPlus, LayoutGrid, List, Clock, SortAsc,
  RefreshCcw, Play, Pause, SkipForward, SkipBack, Star, Hexagon,
  Eye, EyeOff, Move, Maximize2, Minimize2, Crosshair, Ruler, AlignCenter,
  FastForward, Rewind, Tag, Palette, Settings, Wand2, ScanLine, AudioLines,
  Waves, Activity, Gauge, Ungroup, Group, MousePointer, Columns3, Rows3,
  Zap, ArrowLeftToLine, ArrowRightToLine, Container, Download,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MenuEntry } from './types';
import type { Vec2, InterpolationType } from '../../core/types';
import { useEditorStore, DEFAULT_PROXY_SCALE, type KeyframeTarget } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useGridStore } from '../../store/grid';
import { useViewportNavStore } from '../../store/viewportNav';
import { usePreviewStore } from '../../store/preview';
import { useMediaPoolStore } from '../../store/mediaPool';
import { useSettingsStore, getSettingValue } from '../../settings/store';
import { useCaptionStore } from '../../store/captions';
import { useSilenceStore } from '../../store/silenceStripper';
import { videoDecoderPool } from '../../engine/video/videoDecoderPool';
import { generateThumbnailSheet } from '../../engine/video/thumbnailSheet';
import { useAiImageStore } from '../../store/aiImage';
import { getSelectionRect } from '../../core/snap/bbox';
import { mediaAssetManager } from '../../engine/media/assetManager';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';

// Helper: creates a disabled placeholder item
function disabled(id: string, label: string, icon?: LucideIcon, shortcut?: string): MenuEntry {
  return { type: 'item', id, label, icon, shortcut, enabled: false };
}

function item(id: string, label: string, action: () => void, icon?: LucideIcon, shortcut?: string): MenuEntry {
  return { type: 'item', id, label, icon, shortcut, enabled: true, action };
}

// Checkable (radio/toggle) item — shows a ✓ when `checked`.
function check(id: string, label: string, checked: boolean, action: () => void, icon?: LucideIcon, shortcut?: string): MenuEntry {
  return { type: 'item', id, label, icon, shortcut, enabled: true, checked, action };
}

// Selected keyframes resolved to (layer, property path, frame) — supplied by
// KeyframeTimeline so the keyframe menu can act on the real selection.
export interface KeyframeMenuContext {
  layerId: string;
  targets: KeyframeTarget[];
}

// Bezier handles for the easing presets ([handleIn, handleOut]); mirrors
// core/animationPresets.EASING so the menu produces the same curves as the graph.
const EASE_IN: [Vec2, Vec2] = [[1, 1], [0.42, 0.001]];
const EASE_OUT: [Vec2, Vec2] = [[0.58, 1], [0.001, 0.001]];
const EASE_IO: [Vec2, Vec2] = [[0.58, 1], [0.42, 0.001]];

// Relink/replace: pick a file and re-import it under the same asset id (layers that
// reference the asset auto-repair, since they key off assetId).
function pickReplacement(assetId: string): void {
  const pid = useProjectStore.getState().activeProjectId;
  if (!pid) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void mediaAssetManager.reimportMissingAsset(assetId, f, pid);
  };
  input.click();
}

// ─── CANVAS CONTEXT MENU ────────────────────────────────────────────────────

export function buildCanvasMenu(): MenuEntry[] {
  const nav = useViewportNavStore.getState();
  const grid = useGridStore.getState();
  const editor = useEditorStore.getState();
  const preview = usePreviewStore.getState();
  const { width: compW, height: compH } = editor.composition.settings;

  return [
    {
      type: 'group',
      label: 'Navigation',
      items: [
        item('zoom-in', 'Zoom In', () => nav.setZoom(nav.zoom * 1.25), ZoomIn, '+'),
        item('zoom-out', 'Zoom Out', () => nav.setZoom(nav.zoom * 0.8), ZoomOut, '-'),
        item('zoom-100', 'Zoom to 100%', () => nav.setZoom(1), Maximize2, 'Ctrl+0'),
        item('fit-canvas', 'Fit Canvas', () => nav.fitToCanvas(), Maximize, 'Ctrl+1'),
        item('fill-viewport', 'Fill Viewport', () => nav.fillViewport(compW, compH), Maximize2),
        item('reset-view', 'Reset View', () => nav.resetView(), Crosshair),
        item('frame-selected', 'Frame Selected Layer', () => {
          const frame = useTimelineStore.getState().currentFrame;
          const rect = getSelectionRect(editor.selection.selectedIds, editor.composition.layers, frame);
          if (rect) nav.frameRect(rect.x, rect.y, rect.w, rect.h, compW, compH);
        }, MousePointer),
      ],
    },
    {
      type: 'group',
      label: 'Grid & Guides',
      items: [
        {
          type: 'item', id: 'toggle-grid', label: 'Show Grid',
          icon: Grid3x3,
          checked: grid.grid.visible,
          action: () => grid.setGridVisible(!grid.grid.visible),
          enabled: true,
        },
        check('snap-grid', 'Snap to Grid', getSettingValue<boolean>('editor.snapToGrid') ?? true,
          () => useSettingsStore.getState().setValue('editor.snapToGrid', !(getSettingValue<boolean>('editor.snapToGrid') ?? true)), Magnet),
        {
          type: 'item', id: 'toggle-guides', label: 'Show Guides',
          icon: Ruler,
          checked: grid.guides.visible,
          action: () => grid.setGuidesVisible(!grid.guides.visible),
          enabled: true,
        },
        check('snap-guides', 'Snap to Guides', getSettingValue<boolean>('editor.snapToGuides') ?? true,
          () => useSettingsStore.getState().setValue('editor.snapToGuides', !(getSettingValue<boolean>('editor.snapToGuides') ?? true)), Magnet),
        item('add-h-guide', 'Add Horizontal Guide', () => grid.addGuideline('horizontal', Math.round(compH / 2)), Ruler),
        item('add-v-guide', 'Add Vertical Guide', () => grid.addGuideline('vertical', Math.round(compW / 2)), Ruler),
        item('clear-guides', 'Clear Guides', () => grid.clearGuidelines(), Trash2),
      ],
    },
    {
      type: 'group',
      label: 'Create',
      items: [
        item('new-rect', 'New Rectangle', () => editor.addRectangle(), Square),
        item('new-circle', 'New Circle', () => editor.addCircle(), Circle),
        item('new-star', 'New Star', () => editor.addStar(), Star),
        item('new-polygon', 'New Polygon', () => editor.addPolygon(), Hexagon),
        item('new-text', 'New Text', () => editor.addText(), Type),
        item('new-hbox', 'New HBox Layout', () => editor.addLayoutObject('hbox'), Columns3),
        item('new-vbox', 'New VBox Layout', () => editor.addLayoutObject('vbox'), Rows3),
        item('new-grid', 'New Grid Layout', () => editor.addLayoutObject('grid'), LayoutGrid),
        item('new-container', 'New Layout Container', () => editor.addLayoutContainer(), Container),
        item('new-group', 'New Group', () => editor.createGroup(), Folder),
        disabled('new-compound', 'New Compound Animation', Sparkles),
      ],
    },
    {
      type: 'group',
      label: 'Clipboard',
      items: [
        item('paste', 'Paste', () => editor.pasteClipboard(), Clipboard, 'Ctrl+V'),
        item('paste-place', 'Paste in Place', () => editor.pasteClipboard(true), Clipboard, 'Ctrl+Shift+V'),
        item('duplicate', 'Duplicate Selection', () => editor.duplicateSelection(), Copy, 'Ctrl+D'),
      ],
    },
    {
      type: 'submenu',
      id: 'view-sub',
      label: 'View',
      icon: Eye,
      items: [
        check('safe-areas', 'Show Safe Areas', nav.showSafeAreas, () => nav.toggleSafeAreas(), Eye),
        check('bounding-boxes', 'Show Bounding Boxes', nav.showBoundingBoxes, () => nav.toggleBoundingBoxes(), Square),
        check('layer-controls', 'Show Layer Controls', nav.showLayerControls, () => nav.toggleLayerControls(), Layers),
        check('motion-paths', 'Show Motion Paths', nav.showMotionPaths, () => nav.toggleMotionPaths(), Move),
      ],
    },
    {
      type: 'submenu',
      id: 'performance-sub',
      label: 'Performance',
      icon: Gauge,
      items: [
        {
          type: 'submenu', id: 'preview-quality', label: 'Preview Quality', icon: ScanLine,
          items: [
            check('quality-full', 'Full', preview.quality === 'full', () => preview.setQuality('full')),
            check('quality-half', 'Half', preview.quality === 'half', () => preview.setQuality('half')),
            check('quality-quarter', 'Quarter', preview.quality === 'quarter', () => preview.setQuality('quarter')),
          ],
        },
        item('gpu-rendering', 'GPU Rendering: On', () => window.alert('Rendering runs entirely on the GPU (WebGPU). There is no CPU fallback to toggle.'), Activity),
        check('disable-effects', 'Disable Effects Preview', preview.disableEffects, () => preview.toggleDisableEffects(), EyeOff),
      ],
    },
  ];
}

// ─── TIMELINE EMPTY SPACE CONTEXT MENU ──────────────────────────────────────

export function buildTimelineEmptyMenu(): MenuEntry[] {
  const editor = useEditorStore.getState();
  const timeline = useTimelineStore.getState();

  return [
    {
      type: 'group',
      label: 'Add',
      items: [
        item('new-shape-layer', 'New Shape Layer', () => editor.addRectangle(), Square),
        item('new-text-layer', 'New Text Layer', () => editor.addText(), Type),
        item('new-audio-track', 'New Audio Track', () => editor.addTrack('audio'), Music),
        item('new-group-track', 'New Group Track', () => editor.addTrack('group'), Folder),
      ],
    },
    {
      type: 'group',
      label: 'Navigation',
      items: [
        item('tl-zoom-in', 'Zoom In', () => timeline.zoomAtCursor(300, 1.3), ZoomIn),
        item('tl-zoom-out', 'Zoom Out', () => timeline.zoomAtCursor(300, 0.7), ZoomOut),
        item('tl-zoom-fit', 'Zoom to Fit', () => timeline.fitTimeline(editor.composition.settings.durationFrames), Maximize),
        item('tl-show-all', 'Show Entire Timeline', () => timeline.fitTimeline(editor.composition.settings.durationFrames), Maximize2),
        item('tl-jump-playhead', 'Jump to Playhead', () => timeline.jumpToPlayhead(), Crosshair),
      ],
    },
    {
      type: 'group',
      label: 'Markers',
      items: [
        item('add-marker', 'Add Marker', () => editor.addMarker(timeline.currentFrame), Tag),
        item('add-section', 'Add Section Marker', () => editor.addMarker(timeline.currentFrame, {
          endFrame: timeline.currentFrame + Math.round(editor.composition.settings.frameRate),
          name: 'Section',
        }), Tag),
        item('clear-markers', 'Clear Markers', () => editor.clearMarkers(), Trash2),
      ],
    },
    {
      type: 'group',
      label: 'View',
      items: [
        item('compact-tracks', 'Compact Tracks', () => {
          const s = useSettingsStore.getState();
          s.setValue('timeline.trackHeight', 16);
          s.setValue('timeline.videoTrackHeight', 28);
        }, Minimize2),
        item('expanded-tracks', 'Expanded Tracks', () => {
          const s = useSettingsStore.getState();
          s.setValue('timeline.trackHeight', 40);
          s.setValue('timeline.videoTrackHeight', 64);
        }, Maximize2),
        check('show-waveforms', 'Show Waveforms', timeline.showWaveforms, () => timeline.toggleWaveforms(), Waves),
        check('show-thumbnails', 'Show Thumbnails', timeline.showThumbnails, () => timeline.toggleThumbnails(), Image),
      ],
    },
  ];
}

// ─── TIMELINE CLIP CONTEXT MENU ─────────────────────────────────────────────

export function buildClipMenu(layerId: string): MenuEntry[] {
  const editor = useEditorStore.getState();
  const layer = editor.composition.layers.find((l) => l.id === layerId);
  const isAudio = layer?.type === 'audio';
  const isVideo = layer?.type === 'video';
  const isPrecomp = layer?.type === 'precomp';
  const precompId = isPrecomp ? (layer as { compositionId?: string }).compositionId : undefined;

  // Label color applies to the whole selection when the clicked clip is part
  // of it, otherwise just to this clip.
  const applyLabel = (color: string | null) => {
    const ed = useEditorStore.getState();
    const sel = ed.selection.selectedIds;
    ed.setLayerLabelColor(sel.includes(layerId) ? sel : [layerId], color);
  };

  return [
    {
      type: 'group',
      label: 'Edit',
      items: [
        item('clip-copy', 'Copy', () => editor.copySelection(), Copy, 'Ctrl+C'),
        item('clip-duplicate', 'Duplicate', () => editor.duplicateSelection(), Copy, 'Ctrl+D'),
        item('clip-delete', 'Delete', () => editor.removeLayer(layerId), Trash2, 'Del'),
        item('clip-rename', 'Rename', () => editor.startRenameLayer(layerId), Pencil, 'F2'),
      ],
    },
    {
      type: 'group',
      label: 'Clip Operations',
      items: [
        item('clip-split', 'Split at Playhead', () => editor.trimSplit(layerId), Scissors, 'Ctrl+Shift+S'),
        item('clip-trim-left', 'Trim Start to Playhead', () => editor.trimLeft(layerId), SkipForward),
        item('clip-trim-right', 'Trim End to Playhead', () => editor.trimRight(layerId), SkipBack),
        ...(isVideo
          ? [
              item('clip-freeze', 'Freeze Frame', () => editor.freezeVideoOnPlayhead(layerId), Film),
              item('clip-reverse', 'Reverse', () => editor.reverseVideoClip(layerId), Rewind),
            ]
          : []),
        isVideo
          ? item('clip-speed', 'Speed / Duration…', () => {
              const s = window.prompt('Playback speed (1 = normal, 2 = faster, 0.5 = slower):', '1');
              const f = s ? parseFloat(s) : NaN;
              if (Number.isFinite(f) && f > 0) editor.updateLayerProperty(layerId, 'video.playbackRate', f);
            }, FastForward)
          : item('clip-speed', 'Speed / Duration…', () => {
              const s = window.prompt('Animation speed (1 = normal, 2 = faster, 0.5 = slower):', '1');
              const f = s ? parseFloat(s) : NaN;
              if (Number.isFinite(f) && f > 0) editor.setNonVideoClipSpeed(layerId, f);
            }, FastForward),
      ],
    },
    {
      type: 'group',
      label: 'Layering',
      items: [
        // Layer array index 0 = front (matches Toolbar arrange handlers). The +2
        // on send-backward accounts for reorderLayers removing the source first.
        item('bring-forward', 'Bring Forward', () => {
          const ed = useEditorStore.getState();
          const idx = ed.composition.layers.findIndex((l) => l.id === layerId);
          if (idx > 0) ed.reorderLayers([layerId], idx - 1);
        }, ArrowUp, 'Ctrl+]'),
        item('send-backward', 'Send Backward', () => {
          const ed = useEditorStore.getState();
          const idx = ed.composition.layers.findIndex((l) => l.id === layerId);
          if (idx < ed.composition.layers.length - 1) ed.reorderLayers([layerId], idx + 2);
        }, ArrowDown, 'Ctrl+['),
        item('bring-front', 'Bring to Front', () => editor.reorderLayers([layerId], 0), ChevronsUp, 'Ctrl+Shift+]'),
        item('send-back', 'Send to Back', () => editor.reorderLayers([layerId], useEditorStore.getState().composition.layers.length), ChevronsDown, 'Ctrl+Shift+['),
      ],
    },
    {
      type: 'group',
      label: 'Transform',
      items: [
        item('reset-pos', 'Reset Position', () => editor.resetTransformPosition(layerId), Move),
        item('reset-scale', 'Reset Scale', () => editor.resetTransformScale(layerId), Maximize2),
        item('reset-rotation', 'Reset Rotation', () => editor.resetTransformRotation(layerId), RotateCcw),
        item('reset-all', 'Reset All Transforms', () => editor.resetTransformAll(layerId), RefreshCcw),
      ],
    },
    {
      type: 'submenu',
      id: 'animation-sub',
      label: 'Animation',
      icon: Sparkles,
      items: [
        item('add-fade-in', 'Add Fade In', () => editor.addFade(layerId, 'transform.opacity', 'in'), Sparkles),
        item('add-fade-out', 'Add Fade Out', () => editor.addFade(layerId, 'transform.opacity', 'out'), Sparkles),
        item('bake-anim', 'Bake Animation', () => editor.bakeLayerAnimation(layerId), Activity),
      ],
    },
    {
      type: 'group',
      label: 'Grouping',
      items: [
        item('group-sel', 'Group', () => editor.createGroup(), Group, 'Ctrl+G'),
        item('ungroup-sel', 'Ungroup', () => editor.ungroupSelection(), Ungroup, 'Ctrl+Shift+G'),
        item('precompose-sel', 'Precompose', () => editor.precomposeSelection(), Layers, 'Ctrl+Shift+C'),
        ...(isPrecomp && precompId
          ? [item('open-precomp', 'Open Precomposition', () => editor.enterPrecomp(precompId), Folder)]
          : []),
      ],
    },
    ...(isAudio ? buildAudioClipSection(layerId) : []),
    ...(isVideo ? buildVideoClipSection(layerId, (layer as { video: { assetId: string } }).video.assetId) : []),
    {
      type: 'submenu',
      id: 'label-colors',
      label: 'Label Color',
      icon: Palette,
      items: [
        item('label-red', 'Red', () => applyLabel('#ef4444'), Palette),
        item('label-blue', 'Blue', () => applyLabel('#3b82f6'), Palette),
        item('label-green', 'Green', () => applyLabel('#22c55e'), Palette),
        item('label-yellow', 'Yellow', () => applyLabel('#eab308'), Palette),
        item('label-none', 'None', () => applyLabel(null), Palette),
      ],
    },
    {
      type: 'group',
      items: [
        item('open-props', 'Properties', () => editor.selectLayer(layerId), Settings),
      ],
    },
  ];
}

// ─── MULTI-SELECTION TIMELINE CONTEXT MENU ─────────────────────────────────

export function buildMultiClipMenu(): MenuEntry[] {
  const editor = useEditorStore.getState();

  return [
    {
      type: 'group',
      label: 'Stagger',
      items: [
        item('fast-stagger', 'Fast Stagger', () => {
          const { composition, selection } = useEditorStore.getState();
          const ids = selection.selectedIds;
          if (ids.length < 2) return;
          const offsets = new Map<string, number>();
          const layers = composition.layers.filter((l) => ids.includes(l.id));
          const sorted = [...layers].sort((a, b) => a.inPoint - b.inPoint);
          const gap = 5;
          sorted.forEach((layer, i) => {
            offsets.set(layer.id, i * gap);
          });
          editor.applyStaggerOffsets(`fast_stagger_${Date.now()}`, offsets);
        }, Zap),
      ],
    },
    {
      type: 'group',
      label: 'Extend',
      items: [
        item('extend-left', 'Extend to Max Left', () => editor.extendToMaxLeft(), ArrowLeftToLine),
        item('extend-right', 'Extend to Max Right', () => editor.extendToMaxRight(), ArrowRightToLine),
      ],
    },
    {
      type: 'group',
      label: 'Order',
      items: [
        item('order-ascending', 'Order Ascending', () => editor.orderClipsAscending(), ArrowUp),
        item('order-descending', 'Order Descending', () => editor.orderClipsDescending(), ArrowDown),
      ],
    },
    {
      type: 'group',
      label: 'Edit',
      items: [
        item('multi-copy', 'Copy', () => editor.copySelection(), Copy, 'Ctrl+C'),
        item('multi-duplicate', 'Duplicate', () => editor.duplicateSelection(), Copy, 'Ctrl+D'),
        item('multi-delete', 'Delete', () => editor.removeLayers(useEditorStore.getState().selection.selectedIds), Trash2, 'Del'),
      ],
    },
    {
      type: 'group',
      label: 'Grouping',
      items: [
        item('multi-group', 'Group', () => editor.createGroup(), Group, 'Ctrl+G'),
        item('multi-precompose', 'Precompose', () => editor.precomposeSelection(), Layers, 'Ctrl+Shift+C'),
      ],
    },
  ];
}

function buildAudioClipSection(layerId: string): MenuEntry[] {
  const ed = useEditorStore.getState();
  return [
    {
      type: 'group',
      label: 'Audio',
      items: [
        item('vol-up-1', 'Volume +1 dB', () => ed.adjustAudioVolumeDb(layerId, 1), Volume2),
        item('vol-up-3', 'Volume +3 dB', () => ed.adjustAudioVolumeDb(layerId, 3), Volume2),
        item('vol-down-1', 'Volume -1 dB', () => ed.adjustAudioVolumeDb(layerId, -1), VolumeX),
        item('vol-down-3', 'Volume -3 dB', () => ed.adjustAudioVolumeDb(layerId, -3), VolumeX),
        item('normalize', 'Normalize', () => ed.normalizeAudioVolume(layerId), AudioLines),
      ],
    },
    {
      type: 'group',
      label: 'Fades',
      items: [
        item('audio-fade-in', 'Add Fade In', () => ed.addFade(layerId, 'audio.volume', 'in'), Sparkles),
        item('audio-fade-out', 'Add Fade Out', () => ed.addFade(layerId, 'audio.volume', 'out'), Sparkles),
        disabled('audio-crossfade', 'Crossfade', Waves),
      ],
    },
  ];
}

function buildVideoClipSection(layerId: string, assetId: string): MenuEntry[] {
  const ed = useEditorStore.getState();
  return [
    {
      type: 'submenu',
      id: 'video-ops',
      label: 'Video',
      icon: Film,
      items: [
        item('create-proxy', 'Create Proxy', () => {
          ed.updateLayerProperty(layerId, 'video.playbackMode', 'proxy');
          videoDecoderPool.setProxyMode(assetId, DEFAULT_PROXY_SCALE);
        }, Film),
        // Build an audio layer from the video's already-extracted audio buffer.
        item('extract-audio', 'Extract Audio', () => ed.addAudioFromAsset(assetId), Music),
        item('freeze-frame-vid', 'Freeze on Playhead', () => ed.freezeVideoOnPlayhead(layerId), Image),
      ],
    },
  ];
}

// ─── MEDIA POOL EMPTY SPACE CONTEXT MENU ────────────────────────────────────

export function buildMediaPoolEmptyMenu(): MenuEntry[] {
  const pool = useMediaPoolStore.getState();
  return [
    {
      type: 'group',
      label: 'Import',
      items: [
        item('import-media', 'Import Media', () => pool.onImport?.(), Upload, 'Ctrl+I'),
        item('import-folder', 'Import Folder', () => pool.onImport?.({ directory: true }), FolderPlus),
        item('import-audio', 'Import Audio', () => pool.onImport?.({ accept: 'audio/*' }), Music),
        disabled('import-sequence', 'Import Image Sequence', Image),
      ],
    },
    {
      type: 'group',
      label: 'Organization',
      items: [
        disabled('new-folder', 'New Folder', FolderPlus),
        disabled('new-smart-folder', 'New Smart Folder', Folder),
      ],
    },
    {
      type: 'group',
      label: 'View',
      items: [
        check('view-grid', 'Grid View', pool.viewMode === 'grid', () => pool.setViewMode('grid'), LayoutGrid),
        check('view-list', 'List View', pool.viewMode === 'list', () => pool.setViewMode('list'), List),
        check('large-thumbs', 'Large Thumbnails', pool.thumbSize === 'large', () => pool.setThumbSize('large'), Maximize2),
        check('small-thumbs', 'Small Thumbnails', pool.thumbSize === 'small', () => pool.setThumbSize('small'), Minimize2),
      ],
    },
    {
      type: 'submenu',
      id: 'sort-sub',
      label: 'Sort By',
      icon: SortAsc,
      items: [
        check('sort-name', 'Name', pool.sortMode === 'name', () => pool.setSortMode('name'), SortAsc),
        check('sort-date', 'Date', pool.sortMode === 'date', () => pool.setSortMode('date'), Clock),
        check('sort-duration', 'Duration', pool.sortMode === 'duration', () => pool.setSortMode('duration'), Clock),
        check('sort-type', 'Type', pool.sortMode === 'type', () => pool.setSortMode('type'), Layers),
      ],
    },
    {
      type: 'group',
      label: 'Maintenance',
      items: [
        item('remove-unused', 'Remove Unused Media', () => {
          const ed = useEditorStore.getState();
          const used = new Set<string>();
          for (const l of ed.composition.layers) {
            const a = l as { video?: { assetId?: string }; image?: { assetId?: string }; audio?: { assetId?: string } };
            const id = a.video?.assetId ?? a.image?.assetId ?? a.audio?.assetId;
            if (id) used.add(id);
          }
          const unused = mediaAssetManager.getAllAssets().filter((asset) => !used.has(asset.id));
          if (unused.length === 0) { window.alert('No unused media to remove.'); return; }
          if (!window.confirm(`Remove ${unused.length} unused asset(s) from this project?`)) return;
          for (const asset of unused) void mediaAssetManager.removeAsset(asset.id);
        }, Trash2),
        item('refresh-media', 'Refresh Media', () => pool.onRefresh?.(), RefreshCcw),
      ],
    },
  ];
}

// ─── MEDIA ASSET CONTEXT MENUS ──────────────────────────────────────────────

export function buildMediaAssetMenu(assetType: 'image' | 'video' | 'audio', assetId: string): MenuEntry[] {
  const ed = useEditorStore.getState();
  const pool = useMediaPoolStore.getState();
  const cx = Math.round(ed.composition.settings.width / 2);
  const cy = Math.round(ed.composition.settings.height / 2);
  const addToTimeline = () => {
    if (assetType === 'image') ed.addImageFromAsset(assetId, cx, cy);
    else if (assetType === 'video') ed.addVideoFromAsset(assetId, cx, cy);
    else ed.addAudioFromAsset(assetId);
  };

  const base: MenuEntry[] = [
    {
      type: 'group',
      label: 'Basic',
      items: [
        item('add-timeline', 'Add to Timeline', addToTimeline, Plus),
        item('add-new-layer', 'Add to New Layer', addToTimeline, Layers),
        item('preview-asset', 'Preview', () => pool.setPreviewAsset(assetId), Play),
        item('rename-asset', 'Rename', () => {
          const cur = mediaAssetManager.getAsset(assetId)?.name ?? '';
          const n = window.prompt('Rename asset:', cur);
          if (n && n.trim()) { mediaAssetManager.renameAsset(assetId, n.trim()); pool.onRefresh?.(); }
        }, Pencil),
        disabled('duplicate-asset', 'Duplicate', Copy),
      ],
    },
    {
      type: 'group',
      label: 'Organization',
      items: [
        disabled('move-folder', 'Move to Folder', FolderPlus),
        disabled('create-subclip', 'Create Subclip', Scissors),
        disabled('add-tag', 'Add Tag', Tag),
        disabled('add-fav', 'Add Favorite', Star),
      ],
    },
    {
      type: 'group',
      label: 'Technical',
      items: [
        item('show-metadata', 'Show Metadata', () => {
          const lines: string[] = [`Type: ${assetType}`];
          if (assetType === 'video') {
            const m = mediaAssetManager.getMetadata(assetId);
            if (m) lines.push(`Resolution: ${m.width}×${m.height}`, `Duration: ${m.duration.toFixed(2)}s`, `Frame rate: ${m.frameRate.toFixed(2)} fps`, `Codec: ${m.codec}`, `Audio: ${m.hasAudio ? 'yes' : 'no'}`);
          } else if (assetType === 'image') {
            const m = mediaAssetManager.getImageMetadata(assetId);
            if (m) lines.push(`Resolution: ${m.width}×${m.height}`, `Format: ${m.format}`);
          } else {
            const m = mediaAssetManager.getAudioMetadata(assetId);
            if (m) lines.push(`Duration: ${m.duration.toFixed(2)}s`, `Sample rate: ${m.sampleRate} Hz`, `Channels: ${m.channels}`);
          }
          window.alert(lines.join('\n'));
        }, Settings),
        item('reveal-file', 'Download Original', () => {
          const url = mediaAssetManager.getObjectUrl(assetId);
          if (!url) return;
          const a = document.createElement('a');
          a.href = url;
          a.download = mediaAssetManager.getAsset(assetId)?.name ?? 'asset';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, Download),
        item('relink-file', 'Relink File', () => pickReplacement(assetId), RefreshCcw),
        item('replace-media', 'Replace Media', () => pickReplacement(assetId), Upload),
      ],
    },
  ];

  if (assetType === 'image') {
    base.push({
      type: 'group',
      label: 'Image',
      items: [
        item('set-bg', 'Set as Background', () => ed.addImageAsBackground(assetId), Image),
        disabled('convert-shape', 'Convert to Shape', Square),
        disabled('crop-img', 'Crop', Scissors),
        item('auto-fit', 'Auto Fit Canvas', () => ed.addImageFitCanvas(assetId), Maximize),
      ],
    });
    base.push({
      type: 'submenu',
      id: 'ai-image',
      label: 'AI',
      icon: Wand2,
      items: [
        item('remove-bg', 'Remove Background', () => useAiImageStore.getState().open(assetId, 'remove-bg'), Wand2),
        item('upscale', 'Upscale (2×)', () => useAiImageStore.getState().open(assetId, 'upscale'), ZoomIn),
        disabled('gen-variations', 'Generate Variations', Sparkles),
      ],
    });
  }

  if (assetType === 'video') {
    base.push({
      type: 'group',
      label: 'Video',
      items: [
        item('vid-proxy', 'Create Proxy', () => videoDecoderPool.setProxyMode(assetId, DEFAULT_PROXY_SCALE), Film),
        item('vid-thumb-sheet', 'Generate Thumbnail Sheet', () => {
          generateThumbnailSheet(assetId).catch(() => window.alert('Could not generate a thumbnail sheet. Add the clip to the timeline first so its decoder is active.'));
        }, LayoutGrid),
        item('vid-extract-audio', 'Extract Audio', () => ed.addAudioFromAsset(assetId), Music),
      ],
    });
    base.push({
      type: 'submenu',
      id: 'ai-video',
      label: 'AI',
      icon: Wand2,
      items: [
        disabled('scene-detect', 'Scene Detection', ScanLine),
        // Add the video to the timeline, then open the (fully-built) caption engine on it.
        item('auto-captions', 'Auto Captions', () => {
          ed.addVideoFromAsset(assetId, cx, cy);
          const st = useEditorStore.getState();
          const lid = st.selection.activeId;
          const layer = lid ? st.composition.layers.find((l) => l.id === lid) : null;
          if (lid && layer) {
            useCaptionStore.getState().open({ layerId: lid, assetId, clipStartFrame: layer.inPoint, name: layer.name });
          }
        }, Type),
        disabled('motion-track', 'Motion Tracking', Crosshair),
      ],
    });
  }

  if (assetType === 'audio') {
    base.push({
      type: 'group',
      label: 'Processing',
      items: [
        disabled('audio-normalize', 'Normalize', AudioLines),
        disabled('audio-amplify', 'Amplify', Volume2),
        disabled('audio-noise', 'Reduce Noise', Waves),
        // Add the audio to the timeline, then open the (fully-built) silence stripper on it.
        item('audio-silence', 'Remove Silence', () => {
          ed.addAudioFromAsset(assetId);
          const lid = useEditorStore.getState().selection.activeId;
          if (lid) useSilenceStore.getState().open(lid);
        }, VolumeX),
      ],
    });
    base.push({
      type: 'group',
      label: 'Analysis',
      items: [
        disabled('detect-bpm', 'Detect BPM', Activity),
        disabled('detect-beats', 'Detect Beats', AudioLines),
        disabled('detect-key', 'Detect Key', Music),
        item('detect-loudness', 'Detect Loudness', () => {
          const wf = mediaAssetManager.getWaveform(assetId);
          if (!wf || !wf.peaks || wf.peaks.length === 0) { window.alert('No waveform available for this asset.'); return; }
          let sumSq = 0;
          for (let i = 0; i < wf.peaks.length; i++) sumSq += wf.peaks[i] * wf.peaks[i];
          const rms = Math.sqrt(sumSq / wf.peaks.length);
          const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
          window.alert(`Approx. loudness: ${dbfs.toFixed(1)} dBFS (RMS)`);
        }, Gauge),
      ],
    });
    base.push({
      type: 'group',
      label: 'Conversion',
      items: [
        disabled('to-mono', 'Convert to Mono', AudioLines),
        disabled('to-stereo', 'Convert to Stereo', Waves),
      ],
    });
  }

  return base;
}

// ─── KEYFRAME CONTEXT MENU ──────────────────────────────────────────────────

export function buildKeyframeMenu(isSingle: boolean, ctx?: KeyframeMenuContext): MenuEntry[] {
  const ed = useEditorStore.getState();
  const currentFrame = useTimelineStore.getState().currentFrame;
  const layerId = ctx?.layerId ?? null;
  const targets = ctx?.targets ?? [];
  const active = layerId !== null && targets.length > 0;

  // Enabled item only when there's a resolved keyframe selection; otherwise grey.
  const kf = (id: string, label: string, action: () => void, icon?: LucideIcon, shortcut?: string): MenuEntry =>
    active ? item(id, label, action, icon, shortcut) : disabled(id, label, icon, shortcut);
  const setInterp = (interpolation: InterpolationType, handleIn?: Vec2, handleOut?: Vec2) => () => {
    if (layerId) ed.setKeyframeInterpolation(layerId, targets, interpolation, handleIn, handleOut);
  };
  const L = layerId ?? ''; // safe to capture; kf() gates every action on `active`

  const base: MenuEntry[] = [
    {
      type: 'group',
      label: 'Edit',
      items: [
        kf('kf-copy', 'Copy', () => ed.copyKeyframes(L, targets), Copy, 'Ctrl+C'),
        kf('kf-paste', 'Paste', () => ed.pasteKeyframes(L, currentFrame), Clipboard, 'Ctrl+V'),
        kf('kf-duplicate', 'Duplicate', () => ed.duplicateKeyframes(L, targets), Copy, 'Ctrl+D'),
        kf('kf-delete', 'Delete', () => ed.deleteKeyframes(L, targets), Trash2, 'Del'),
      ],
    },
    {
      type: 'group',
      label: 'Timing',
      items: [
        kf('kf-move-playhead', 'Move to Playhead', () => ed.moveKeyframesToFrame(L, targets, currentFrame), Crosshair),
        kf('kf-align-prev', 'Align to Previous', () => ed.alignKeyframes(L, targets, 'prev'), AlignCenter),
        kf('kf-align-next', 'Align to Next', () => ed.alignKeyframes(L, targets, 'next'), AlignCenter),
      ],
    },
    {
      type: 'group',
      label: 'Interpolation',
      items: [
        kf('interp-linear', 'Linear', setInterp('linear'), MoveVertical),
        kf('interp-ease-in', 'Ease In', setInterp('bezier', EASE_IN[0], EASE_IN[1]), Sparkles),
        kf('interp-ease-out', 'Ease Out', setInterp('bezier', EASE_OUT[0], EASE_OUT[1]), Sparkles),
        kf('interp-ease-io', 'Ease In Out', setInterp('bezier', EASE_IO[0], EASE_IO[1]), Sparkles),
        kf('interp-hold', 'Hold', setInterp('hold'), Pause),
      ],
    },
    {
      type: 'group',
      label: 'Bezier',
      items: [
        kf('bez-bezier', 'Bezier', setInterp('bezier'), Activity),
        kf('bez-auto', 'Auto Bezier', setInterp('bezier', EASE_IO[0], EASE_IO[1]), Activity),
        kf('bez-continuous', 'Continuous', () => ed.setKeyframeTangentMode(L, targets, 'continuous'), Activity),
        kf('bez-broken', 'Broken Tangents', () => ed.setKeyframeTangentMode(L, targets, 'broken'), Activity),
      ],
    },
    {
      type: 'group',
      label: 'Utilities',
      items: [
        kf('kf-reverse', 'Reverse Keyframes', () => ed.reverseKeyframeValues(L, targets), Rewind),
        kf('kf-mirror', 'Mirror Keyframes', () => ed.mirrorKeyframeTime(L, targets), Copy),
        kf('kf-bake', 'Bake Keyframes', () => ed.bakeKeyframes(L, targets), Activity),
      ],
    },
  ];

  if (!isSingle) {
    base.push({
      type: 'group',
      label: 'Distribution',
      items: [
        kf('kf-even-space', 'Evenly Space', () => ed.distributeKeyframes(L, targets), AlignCenter),
        kf('kf-compress', 'Compress', () => ed.scaleKeyframeTime(L, targets, 0.5), Minimize2),
        kf('kf-expand', 'Expand', () => ed.scaleKeyframeTime(L, targets, 2), Maximize2),
      ],
    });
    base.push({
      type: 'group',
      label: 'Multi-Keyframe',
      items: [
        kf('kf-ease-all', 'Ease All', setInterp('bezier', EASE_IO[0], EASE_IO[1]), Sparkles),
        kf('kf-linearize', 'Linearize All', setInterp('linear'), MoveVertical),
        kf('kf-smooth', 'Smooth All', setInterp('bezier', EASE_IO[0], EASE_IO[1]), Waves),
        // Reverse-time mirrors about the PLAYHEAD (distinct from Mirror, which uses the span center).
        kf('kf-reverse-time', 'Reverse Timing', () => ed.mirrorKeyframeTime(L, targets, currentFrame), Rewind),
        kf('kf-scale-time', 'Scale Timing…', () => {
          const s = window.prompt('Scale factor (2 = slower, 0.5 = faster):', '2');
          const f = s ? parseFloat(s) : NaN;
          if (Number.isFinite(f) && f > 0) ed.scaleKeyframeTime(L, targets, f);
        }, FastForward),
        kf('kf-offset-time', 'Offset Timing…', () => {
          const s = window.prompt('Offset in frames (+ later, − earlier):', '10');
          const d = s ? parseInt(s, 10) : NaN;
          if (Number.isFinite(d)) ed.offsetKeyframeTime(L, targets, d);
        }, Clock),
      ],
    });
  }

  return base;
}
