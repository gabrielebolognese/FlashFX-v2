import {
  ZoomIn, ZoomOut, Maximize, Grid3x3, Magnet, Plus, Square, Circle, Type, Folder,
  Clipboard, Copy, Scissors, Trash2, Pencil, MoveVertical, ArrowUp, ArrowDown,
  ChevronsUp, ChevronsDown, RotateCcw, Sparkles, Layers, Film, Image, Music,
  Volume2, VolumeX, Upload, FolderPlus, LayoutGrid, List, Clock, SortAsc,
  RefreshCcw, Play, Pause, SkipForward, SkipBack, Star, Hexagon, Repeat,
  Eye, EyeOff, Move, Maximize2, Minimize2, Crosshair, Ruler, AlignCenter,
  FastForward, Rewind, Tag, Palette, Settings, Wand2, ScanLine, AudioLines,
  Waves, Activity, Gauge, Sliders, Ungroup, Group, MousePointer, Columns3, Rows3,
  Zap, ArrowLeftToLine, ArrowRightToLine, ArrowUpDown, Container,
} from 'lucide-react';
import type { MenuEntry } from './types';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useGridStore } from '../../store/grid';
import { useViewportNavStore } from '../../store/viewportNav';

// Helper: creates a disabled placeholder item
function disabled(id: string, label: string, icon?: any, shortcut?: string): MenuEntry {
  return { type: 'item', id, label, icon, shortcut, enabled: false };
}

function item(id: string, label: string, action: () => void, icon?: any, shortcut?: string): MenuEntry {
  return { type: 'item', id, label, icon, shortcut, enabled: true, action };
}

// ─── CANVAS CONTEXT MENU ────────────────────────────────────────────────────

export function buildCanvasMenu(): MenuEntry[] {
  const nav = useViewportNavStore.getState();
  const grid = useGridStore.getState();
  const editor = useEditorStore.getState();

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
          checked: grid.gridVisible,
          action: () => grid.setGridVisible(!grid.gridVisible),
          enabled: true,
        },
        disabled('snap-grid', 'Snap to Grid', Magnet),
        {
          type: 'item', id: 'toggle-guides', label: 'Show Guides',
          icon: Ruler,
          checked: grid.guidesVisible,
          action: () => grid.setGuidesVisible(!grid.guidesVisible),
          enabled: true,
        },
        disabled('snap-guides', 'Snap to Guides', Magnet),
        disabled('add-h-guide', 'Add Horizontal Guide', Ruler),
        disabled('add-v-guide', 'Add Vertical Guide', Ruler),
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
        disabled('new-group', 'New Group', Folder),
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
            disabled('quality-full', 'Full'),
            disabled('quality-half', 'Half'),
            disabled('quality-quarter', 'Quarter'),
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
        disabled('compact-tracks', 'Compact Tracks', Minimize2),
        disabled('expanded-tracks', 'Expanded Tracks', Maximize2),
        disabled('show-waveforms', 'Show Waveforms', Waves),
        disabled('show-thumbnails', 'Show Thumbnails', Image),
      ],
    },
  ];
}

// ─── TIMELINE CLIP CONTEXT MENU ─────────────────────────────────────────────

export function buildClipMenu(layerId: string): MenuEntry[] {
  const editor = useEditorStore.getState();
  const timeline = useTimelineStore.getState();
  const layer = editor.composition.layers.find((l) => l.id === layerId);
  const isAudio = layer?.type === 'audio';
  const isVideo = layer?.type === 'video';

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
        item('clip-split', 'Split at Playhead', () => editor.trimSplit(layerId, timeline.currentFrame), Scissors, 'Ctrl+Shift+S'),
        item('clip-trim-left', 'Trim Start to Playhead', () => editor.trimLeft(layerId, timeline.currentFrame), SkipForward),
        item('clip-trim-right', 'Trim End to Playhead', () => editor.trimRight(layerId, timeline.currentFrame), SkipBack),
        disabled('clip-freeze', 'Freeze Frame', Film),
        disabled('clip-reverse', 'Reverse', Rewind),
        disabled('clip-speed', 'Speed / Duration', FastForward),
      ],
    },
    {
      type: 'group',
      label: 'Layering',
      items: [
        disabled('bring-forward', 'Bring Forward', ArrowUp, 'Ctrl+]'),
        disabled('send-backward', 'Send Backward', ArrowDown, 'Ctrl+['),
        disabled('bring-front', 'Bring to Front', ChevronsUp, 'Ctrl+Shift+]'),
        disabled('send-back', 'Send to Back', ChevronsDown, 'Ctrl+Shift+['),
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
      ],
    },
    ...(isAudio ? buildAudioClipSection(layerId) : []),
    ...(isVideo ? buildVideoClipSection() : []),
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
        disabled('open-props', 'Properties', Settings),
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

function buildVideoClipSection(): MenuEntry[] {
  return [
    {
      type: 'submenu',
      id: 'video-ops',
      label: 'Video',
      icon: Film,
      items: [
        disabled('create-proxy', 'Create Proxy', Film),
        disabled('extract-audio', 'Extract Audio', Music),
        disabled('freeze-frame-vid', 'Create Freeze Frame', Image),
      ],
    },
  ];
}

// ─── MEDIA POOL EMPTY SPACE CONTEXT MENU ────────────────────────────────────

export function buildMediaPoolEmptyMenu(): MenuEntry[] {
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
        disabled('sort-name', 'Name', SortAsc),
        disabled('sort-date', 'Date', Clock),
        disabled('sort-duration', 'Duration', Clock),
        disabled('sort-type', 'Type', Layers),
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

export function buildMediaAssetMenu(assetType: 'image' | 'video' | 'audio'): MenuEntry[] {
  const base: MenuEntry[] = [
    {
      type: 'group',
      label: 'Basic',
      items: [
        disabled('add-timeline', 'Add to Timeline', Plus),
        disabled('add-new-layer', 'Add to New Layer', Layers),
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
        disabled('vid-proxy', 'Create Proxy', Film),
        disabled('vid-thumb-sheet', 'Generate Thumbnail Sheet', LayoutGrid),
        disabled('vid-extract-audio', 'Extract Audio', Music),
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
        disabled('auto-captions', 'Auto Captions', Type),
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
        disabled('audio-silence', 'Remove Silence', VolumeX),
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

export function buildKeyframeMenu(isSingle: boolean): MenuEntry[] {
  const base: MenuEntry[] = [
    {
      type: 'group',
      label: 'Edit',
      items: [
        disabled('kf-copy', 'Copy', Copy, 'Ctrl+C'),
        disabled('kf-paste', 'Paste', Clipboard, 'Ctrl+V'),
        disabled('kf-duplicate', 'Duplicate', Copy, 'Ctrl+D'),
        disabled('kf-delete', 'Delete', Trash2, 'Del'),
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
        disabled('interp-linear', 'Linear', MoveVertical),
        disabled('interp-ease-in', 'Ease In', Sparkles),
        disabled('interp-ease-out', 'Ease Out', Sparkles),
        disabled('interp-ease-io', 'Ease In Out', Sparkles),
        disabled('interp-hold', 'Hold', Pause),
      ],
    },
    {
      type: 'group',
      label: 'Bezier',
      items: [
        disabled('bez-bezier', 'Bezier', Activity),
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
        disabled('kf-ease-all', 'Ease All', Sparkles),
        disabled('kf-linearize', 'Linearize All', MoveVertical),
        disabled('kf-smooth', 'Smooth All', Waves),
        disabled('kf-reverse-time', 'Reverse Timing', Rewind),
        disabled('kf-scale-time', 'Scale Timing', FastForward),
        disabled('kf-offset-time', 'Offset Timing', Clock),
      ],
    });
  }

  return base;
}
