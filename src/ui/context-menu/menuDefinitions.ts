import {
  ZoomIn, ZoomOut, Maximize, Grid3x3, Magnet, Plus, Square, Circle, Type, Folder,
  Clipboard, Copy, Scissors, Trash2, Pencil, MoveVertical, ArrowUp, ArrowDown,
  ChevronsUp, ChevronsDown, RotateCcw, Sparkles, Layers, Film, Image, Music,
  Volume2, VolumeX, Upload, FolderPlus, LayoutGrid, List, Clock, SortAsc,
  RefreshCcw, Play, Pause, SkipForward, SkipBack, Star, Hexagon,
  Eye, EyeOff, Move, Maximize2, Minimize2, Crosshair, Ruler, AlignCenter,
  FastForward, Rewind, Tag, Palette, Settings, Wand2, ScanLine, AudioLines,
  Waves, Activity, Gauge, Ungroup, Group, MousePointer, Columns3, Rows3,
  Zap, ArrowLeftToLine, ArrowRightToLine, Container,
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
import { useSettingsStore } from '../../settings/store';
import { useCaptionStore } from '../../store/captions';
import { useSilenceStore } from '../../store/silenceStripper';
import { videoDecoderPool } from '../../engine/video/videoDecoderPool';

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
        disabled('fill-viewport', 'Fill Viewport', Maximize2),
        item('reset-view', 'Reset View', () => nav.resetView(), Crosshair),
        disabled('frame-selected', 'Frame Selected Layer', MousePointer),
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
        disabled('snap-grid', 'Snap to Grid', Magnet),
        {
          type: 'item', id: 'toggle-guides', label: 'Show Guides',
          icon: Ruler,
          checked: grid.guides.visible,
          action: () => grid.setGuidesVisible(!grid.guides.visible),
          enabled: true,
        },
        disabled('snap-guides', 'Snap to Guides', Magnet),
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
        disabled('paste-place', 'Paste in Place', Clipboard, 'Ctrl+Shift+V'),
        item('duplicate', 'Duplicate Selection', () => editor.duplicateSelection(), Copy, 'Ctrl+D'),
      ],
    },
    {
      type: 'submenu',
      id: 'view-sub',
      label: 'View',
      icon: Eye,
      items: [
        disabled('safe-areas', 'Show Safe Areas', Eye),
        disabled('bounding-boxes', 'Show Bounding Boxes', Square),
        disabled('layer-controls', 'Show Layer Controls', Layers),
        disabled('motion-paths', 'Show Motion Paths', Move),
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
        disabled('gpu-rendering', 'GPU Rendering', Activity),
        disabled('disable-effects', 'Disable Effects Preview', EyeOff),
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
        disabled('new-audio-track', 'New Audio Track', Music),
        disabled('new-group-track', 'New Group Track', Folder),
      ],
    },
    {
      type: 'group',
      label: 'Navigation',
      items: [
        item('tl-zoom-in', 'Zoom In', () => timeline.zoomAtCursor(300, 1.3), ZoomIn),
        item('tl-zoom-out', 'Zoom Out', () => timeline.zoomAtCursor(300, 0.7), ZoomOut),
        disabled('tl-zoom-fit', 'Zoom to Fit', Maximize),
        disabled('tl-show-all', 'Show Entire Timeline', Maximize2),
        disabled('tl-jump-playhead', 'Jump to Playhead', Crosshair),
      ],
    },
    {
      type: 'group',
      label: 'Markers',
      items: [
        disabled('add-marker', 'Add Marker', Tag),
        disabled('add-section', 'Add Section Marker', Tag),
        disabled('clear-markers', 'Clear Markers', Trash2),
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
        disabled('show-waveforms', 'Show Waveforms', Waves),
        disabled('show-thumbnails', 'Show Thumbnails', Image),
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
        disabled('clip-freeze', 'Freeze Frame', Film),
        disabled('clip-reverse', 'Reverse', Rewind),
        disabled('clip-speed', 'Speed / Duration', FastForward),
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
        disabled('add-fade-in', 'Add Fade In', Sparkles),
        disabled('add-fade-out', 'Add Fade Out', Sparkles),
        disabled('add-compound', 'Add Compound Animation', Layers),
        disabled('bake-anim', 'Bake Animation', Activity),
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
        disabled('label-red', 'Red', Palette),
        disabled('label-blue', 'Blue', Palette),
        disabled('label-green', 'Green', Palette),
        disabled('label-yellow', 'Yellow', Palette),
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

function buildAudioClipSection(_layerId: string): MenuEntry[] {
  return [
    {
      type: 'group',
      label: 'Audio',
      items: [
        disabled('vol-up-1', 'Volume +1 dB', Volume2),
        disabled('vol-up-3', 'Volume +3 dB', Volume2),
        disabled('vol-down-1', 'Volume -1 dB', VolumeX),
        disabled('vol-down-3', 'Volume -3 dB', VolumeX),
        disabled('normalize', 'Normalize', AudioLines),
      ],
    },
    {
      type: 'group',
      label: 'Fades',
      items: [
        disabled('audio-fade-in', 'Add Fade In', Sparkles),
        disabled('audio-fade-out', 'Add Fade Out', Sparkles),
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
        disabled('freeze-frame-vid', 'Create Freeze Frame', Image),
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
        disabled('import-media', 'Import Media', Upload, 'Ctrl+I'),
        disabled('import-folder', 'Import Folder', FolderPlus),
        disabled('import-audio', 'Import Audio', Music),
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
        disabled('view-grid', 'Grid View', LayoutGrid),
        disabled('view-list', 'List View', List),
        disabled('large-thumbs', 'Large Thumbnails', Maximize2),
        disabled('small-thumbs', 'Small Thumbnails', Minimize2),
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
        disabled('remove-unused', 'Remove Unused Media', Trash2),
        disabled('refresh-media', 'Refresh Media', RefreshCcw),
      ],
    },
  ];
}

// ─── MEDIA ASSET CONTEXT MENUS ──────────────────────────────────────────────

export function buildMediaAssetMenu(assetType: 'image' | 'video' | 'audio', assetId: string): MenuEntry[] {
  const ed = useEditorStore.getState();
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
        disabled('preview-asset', 'Preview', Play),
        disabled('rename-asset', 'Rename', Pencil),
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
        disabled('show-metadata', 'Show Metadata', Settings),
        disabled('reveal-file', 'Reveal File', FolderPlus),
        disabled('relink-file', 'Relink File', RefreshCcw),
        disabled('replace-media', 'Replace Media', Upload),
      ],
    },
  ];

  if (assetType === 'image') {
    base.push({
      type: 'group',
      label: 'Image',
      items: [
        disabled('set-bg', 'Set as Background', Image),
        disabled('convert-shape', 'Convert to Shape', Square),
        disabled('crop-img', 'Crop', Scissors),
        disabled('auto-fit', 'Auto Fit Canvas', Maximize),
      ],
    });
    base.push({
      type: 'submenu',
      id: 'ai-image',
      label: 'AI',
      icon: Wand2,
      items: [
        disabled('remove-bg', 'Remove Background', Wand2),
        disabled('upscale', 'Upscale', ZoomIn),
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
        disabled('vid-thumb-sheet', 'Generate Thumbnail Sheet', LayoutGrid),
        item('vid-extract-audio', 'Extract Audio', () => ed.addAudioFromAsset(assetId), Music),
        disabled('vid-freeze', 'Create Freeze Frame', Image),
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
        disabled('detect-loudness', 'Detect Loudness', Gauge),
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
  const layerId = ctx?.layerId ?? null;
  const targets = ctx?.targets ?? [];
  const active = layerId !== null && targets.length > 0;

  // Enabled item only when there's a resolved keyframe selection; otherwise grey.
  const kf = (id: string, label: string, action: () => void, icon?: LucideIcon, shortcut?: string): MenuEntry =>
    active ? item(id, label, action, icon, shortcut) : disabled(id, label, icon, shortcut);
  const setInterp = (interpolation: InterpolationType, handleIn?: Vec2, handleOut?: Vec2) => () => {
    if (layerId) ed.setKeyframeInterpolation(layerId, targets, interpolation, handleIn, handleOut);
  };

  const base: MenuEntry[] = [
    {
      type: 'group',
      label: 'Edit',
      items: [
        disabled('kf-copy', 'Copy', Copy, 'Ctrl+C'),
        disabled('kf-paste', 'Paste', Clipboard, 'Ctrl+V'),
        disabled('kf-duplicate', 'Duplicate', Copy, 'Ctrl+D'),
        kf('kf-delete', 'Delete', () => { if (layerId) ed.deleteKeyframes(layerId, targets); }, Trash2, 'Del'),
      ],
    },
    {
      type: 'group',
      label: 'Timing',
      items: [
        disabled('kf-move-playhead', 'Move to Playhead', Crosshair),
        disabled('kf-align-prev', 'Align to Previous', AlignCenter),
        disabled('kf-align-next', 'Align to Next', AlignCenter),
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
        disabled('bez-auto', 'Auto Bezier', Activity),
        disabled('bez-continuous', 'Continuous', Activity),
        disabled('bez-broken', 'Broken Tangents', Activity),
      ],
    },
    {
      type: 'group',
      label: 'Utilities',
      items: [
        disabled('kf-reverse', 'Reverse Keyframes', Rewind),
        disabled('kf-mirror', 'Mirror Keyframes', Copy),
        disabled('kf-bake', 'Bake Keyframes', Activity),
      ],
    },
  ];

  if (!isSingle) {
    base.push({
      type: 'group',
      label: 'Distribution',
      items: [
        disabled('kf-even-space', 'Evenly Space', AlignCenter),
        disabled('kf-compress', 'Compress', Minimize2),
        disabled('kf-expand', 'Expand', Maximize2),
      ],
    });
    base.push({
      type: 'group',
      label: 'Multi-Keyframe',
      items: [
        kf('kf-ease-all', 'Ease All', setInterp('bezier', EASE_IO[0], EASE_IO[1]), Sparkles),
        kf('kf-linearize', 'Linearize All', setInterp('linear'), MoveVertical),
        disabled('kf-smooth', 'Smooth All', Waves),
        disabled('kf-reverse-time', 'Reverse Timing', Rewind),
        disabled('kf-scale-time', 'Scale Timing', FastForward),
        disabled('kf-offset-time', 'Offset Timing', Clock),
      ],
    });
  }

  return base;
}
