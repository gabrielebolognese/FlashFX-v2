import type { SettingTab } from './types';

export const SETTINGS_TABS: SettingTab[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'Settings',
    sections: [
      {
        id: 'project-defaults',
        title: 'Project Defaults',
        description: 'Default settings applied to new projects',
        controls: [
          { id: 'general.defaultFps', label: 'Default Frame Rate', type: 'dropdown', defaultValue: 30, options: [{ label: '24 fps', value: 24 }, { label: '25 fps', value: 25 }, { label: '30 fps', value: 30 }, { label: '60 fps', value: 60 }] },
          { id: 'general.defaultWidth', label: 'Default Width', type: 'number', defaultValue: 1920, min: 1, max: 7680, step: 1, unit: 'px' },
          { id: 'general.defaultHeight', label: 'Default Height', type: 'number', defaultValue: 1080, min: 1, max: 4320, step: 1, unit: 'px' },
          { id: 'general.defaultDuration', label: 'Default Duration', type: 'number', defaultValue: 5, min: 1, max: 300, step: 1, unit: 's' },
        ],
      },
      {
        id: 'autosave',
        title: 'Autosave',
        description: 'Automatic project saving behavior',
        controls: [
          { id: 'general.autosaveEnabled', label: 'Enable Autosave', type: 'toggle', defaultValue: true },
          { id: 'general.autosaveInterval', label: 'Save Interval', type: 'slider', defaultValue: 3000, min: 1000, max: 30000, step: 1000, unit: 'ms' },
          { id: 'general.autosaveNotify', label: 'Show Save Notification', type: 'toggle', defaultValue: false },
        ],
      },
      {
        id: 'startup',
        title: 'Startup',
        description: 'Application startup behavior',
        controls: [
          { id: 'general.startupView', label: 'Startup View', type: 'dropdown', defaultValue: 'dashboard', options: [{ label: 'Dashboard', value: 'dashboard' }, { label: 'Last Project', value: 'lastProject' }] },
          { id: 'general.showWelcome', label: 'Show Welcome Screen', type: 'toggle', defaultValue: true, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'language',
        title: 'Language',
        description: 'Interface language settings',
        controls: [
          { id: 'general.language', label: 'UI Language', type: 'dropdown', defaultValue: 'en', options: [{ label: 'English', value: 'en' }], disabled: true, disabledReason: 'Additional languages coming soon' },
        ],
      },
    ],
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: 'MousePointer',
    sections: [
      {
        id: 'canvas',
        title: 'Canvas Behavior',
        description: 'Viewport interaction settings',
        controls: [
          { id: 'editor.panInvert', label: 'Invert Pan Direction', type: 'toggle', defaultValue: false },
          { id: 'editor.zoomToMouse', label: 'Zoom to Mouse Cursor', type: 'toggle', defaultValue: true },
          { id: 'editor.showPixelGrid', label: 'Show Pixel Grid at High Zoom', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'selection',
        title: 'Selection Behavior',
        description: 'How selection works on the canvas',
        controls: [
          { id: 'editor.deepSelect', label: 'Double-click Deep Select', type: 'toggle', defaultValue: true },
          { id: 'editor.marqueeMode', label: 'Marquee Mode', type: 'dropdown', defaultValue: 'intersect', options: [{ label: 'Intersect', value: 'intersect' }, { label: 'Contain', value: 'contain' }] },
        ],
      },
      {
        id: 'drag',
        title: 'Drag Sensitivity',
        description: 'Controls how drag interactions respond',
        controls: [
          { id: 'editor.dragThreshold', label: 'Drag Threshold', type: 'slider', defaultValue: 3, min: 1, max: 10, step: 1, unit: 'px' },
          { id: 'editor.dragInputSensitivity', label: 'Value Scrub Sensitivity', type: 'slider', defaultValue: 1, min: 0.1, max: 3, step: 0.1 },
        ],
      },
      {
        id: 'snapping',
        title: 'Snapping',
        description: 'Snap behavior for canvas elements',
        controls: [
          { id: 'editor.snapEnabled', label: 'Enable Snapping', type: 'toggle', defaultValue: true },
          { id: 'editor.snapTolerance', label: 'Snap Tolerance', type: 'slider', defaultValue: 5, min: 1, max: 20, step: 1, unit: 'px' },
          { id: 'editor.snapToGrid', label: 'Snap to Grid', type: 'toggle', defaultValue: true },
          { id: 'editor.snapToGuides', label: 'Snap to Guides', type: 'toggle', defaultValue: true },
          { id: 'editor.snapToLayers', label: 'Snap to Other Layers', type: 'toggle', defaultValue: true },
        ],
      },
    ],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: 'Clock',
    sections: [
      {
        id: 'clips',
        title: 'Clip Defaults',
        description: 'Default behavior when creating clips',
        controls: [
          { id: 'timeline.defaultClipDuration', label: 'Default Clip Duration', type: 'number', defaultValue: 90, min: 1, max: 600, step: 1, unit: 'frames' },
          { id: 'timeline.newClipPlacement', label: 'New Clip Placement', type: 'dropdown', defaultValue: 'playhead', options: [{ label: 'At Playhead', value: 'playhead' }, { label: 'After Last Clip', value: 'end' }, { label: 'At Start', value: 'start' }] },
        ],
      },
      {
        id: 'tracks',
        title: 'Track Behavior',
        description: 'Track layout and interaction',
        controls: [
          { id: 'timeline.trackHeight', label: 'Track Height', type: 'slider', defaultValue: 22, min: 16, max: 48, step: 2, unit: 'px' },
          { id: 'timeline.videoTrackHeight', label: 'Video Track Height', type: 'slider', defaultValue: 45, min: 28, max: 80, step: 1, unit: 'px' },
          { id: 'timeline.autoExpand', label: 'Auto-expand New Tracks', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'zoom',
        title: 'Zoom Behavior',
        description: 'Timeline zoom sensitivity and limits',
        controls: [
          { id: 'timeline.zoomSensitivity', label: 'Zoom Sensitivity', type: 'slider', defaultValue: 0.002, min: 0.0005, max: 0.01, step: 0.0005 },
          { id: 'timeline.minZoom', label: 'Minimum Zoom', type: 'number', defaultValue: 0.05, min: 0.01, max: 0.5, step: 0.01 },
          { id: 'timeline.maxZoom', label: 'Maximum Zoom', type: 'number', defaultValue: 20, min: 5, max: 100, step: 1 },
        ],
      },
      {
        id: 'playback',
        title: 'Playback',
        description: 'Playback and scrubbing behavior',
        controls: [
          { id: 'timeline.loopPlayback', label: 'Loop Playback', type: 'toggle', defaultValue: true },
          { id: 'timeline.scrubAudio', label: 'Audio Scrubbing', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
          { id: 'timeline.scrollSpeed', label: 'Scroll Speed', type: 'slider', defaultValue: 1, min: 0.25, max: 3, step: 0.25 },
        ],
      },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: 'Palette',
    sections: [
      {
        id: 'theme',
        title: 'Theme',
        description: 'Overall visual theme',
        controls: [
          { id: 'appearance.theme', label: 'Theme Mode', type: 'dropdown', defaultValue: 'dark', options: [{ label: 'Dark (Default)', value: 'dark' }, { label: 'Midnight', value: 'midnight' }, { label: 'OLED Black', value: 'oled' }], disabled: true, disabledReason: 'Additional themes coming soon' },
        ],
      },
      {
        id: 'density',
        title: 'UI Density',
        description: 'Controls visual density of the interface',
        controls: [
          { id: 'appearance.density', label: 'UI Density', type: 'dropdown', defaultValue: 'default', options: [{ label: 'Compact', value: 'compact' }, { label: 'Default', value: 'default' }, { label: 'Comfortable', value: 'comfortable' }] },
        ],
      },
      {
        id: 'panels',
        title: 'Panel Appearance',
        description: 'Panel visual customization',
        controls: [
          { id: 'appearance.panelTransparency', label: 'Panel Transparency', type: 'slider', defaultValue: 0, min: 0, max: 30, step: 5, unit: '%', disabled: true, disabledReason: 'Coming soon' },
          { id: 'appearance.panelBorders', label: 'Show Panel Borders', type: 'toggle', defaultValue: true },
          { id: 'appearance.panelShadows', label: 'Panel Drop Shadows', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'accent',
        title: 'Accent Color',
        description: 'Customize the primary accent color',
        controls: [
          { id: 'appearance.accentColor', label: 'Accent Color', type: 'color', defaultValue: '#f7b500' },
          { id: 'appearance.accentPreset', label: 'Accent Preset', type: 'dropdown', defaultValue: 'gold', options: [{ label: 'Gold (Default)', value: 'gold' }, { label: 'Blue', value: 'blue' }, { label: 'Cyan', value: 'cyan' }, { label: 'Green', value: 'green' }, { label: 'Red', value: 'red' }, { label: 'Custom', value: 'custom' }], disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'colors',
    label: 'Colors',
    icon: 'Droplets',
    sections: [
      {
        id: 'surfaces',
        title: 'Surface Colors',
        description: 'Background and panel surface colors',
        controls: [
          { id: 'colors.surface0', label: 'Surface 0 (Root)', type: 'color', defaultValue: '#06101a' },
          { id: 'colors.surface1', label: 'Surface 1 (Panels)', type: 'color', defaultValue: '#0a1628' },
          { id: 'colors.surface2', label: 'Surface 2 (Elevated)', type: 'color', defaultValue: '#0e1c32' },
          { id: 'colors.surface3', label: 'Surface 3 (Tertiary)', type: 'color', defaultValue: '#122240' },
          { id: 'colors.surface4', label: 'Surface 4 (High)', type: 'color', defaultValue: '#16294a' },
          { id: 'colors.surface5', label: 'Surface 5 (Maximum)', type: 'color', defaultValue: '#1c3155' },
        ],
      },
      {
        id: 'edges',
        title: 'Border Colors',
        description: 'Edge and divider colors',
        controls: [
          { id: 'colors.edgeSubtle', label: 'Edge Subtle', type: 'color', defaultValue: '#142236' },
          { id: 'colors.edgeDefault', label: 'Edge Default', type: 'color', defaultValue: '#1a2a42' },
          { id: 'colors.edgeStrong', label: 'Edge Strong', type: 'color', defaultValue: '#243a5c' },
        ],
      },
      {
        id: 'text-colors',
        title: 'Text Colors',
        description: 'Text hierarchy colors',
        controls: [
          { id: 'colors.textPrimary', label: 'Text Primary', type: 'color', defaultValue: '#e2e8f0' },
          { id: 'colors.textSecondary', label: 'Text Secondary', type: 'color', defaultValue: '#94a3b8' },
          { id: 'colors.textTertiary', label: 'Text Tertiary', type: 'color', defaultValue: '#64748b' },
          { id: 'colors.textMuted', label: 'Text Muted', type: 'color', defaultValue: '#475569' },
        ],
      },
      {
        id: 'selection-colors',
        title: 'Selection Colors',
        description: 'Colors for selection and highlighting',
        controls: [
          { id: 'colors.selectionOutline', label: 'Selection Outline', type: 'color', defaultValue: '#38bdf8' },
          { id: 'colors.selectionFill', label: 'Selection Fill', type: 'color', defaultValue: '#38bdf8', disabled: true, disabledReason: 'Uses outline at 6% opacity' },
          { id: 'colors.guideColor', label: 'Snap Guide', type: 'color', defaultValue: '#22d3ee' },
        ],
      },
      {
        id: 'timeline-colors',
        title: 'Timeline Colors',
        description: 'Colors specific to the timeline panel',
        controls: [
          { id: 'colors.playhead', label: 'Playhead', type: 'color', defaultValue: '#ffcc00' },
          { id: 'colors.keyframe', label: 'Keyframe', type: 'color', defaultValue: '#facc15' },
          { id: 'colors.keyframeSelected', label: 'Keyframe Selected', type: 'color', defaultValue: '#22c55e' },
        ],
      },
    ],
  },
  {
    id: 'typography',
    label: 'Typography',
    icon: 'Type',
    sections: [
      {
        id: 'font-family',
        title: 'Font Family',
        description: 'UI font configuration',
        controls: [
          { id: 'typography.fontFamily', label: 'UI Font', type: 'dropdown', defaultValue: 'Inter', options: [{ label: 'Inter', value: 'Inter' }, { label: 'SF Pro', value: 'SF Pro' }, { label: 'Roboto', value: 'Roboto' }, { label: 'System Default', value: 'system-ui' }], disabled: true, disabledReason: 'Coming soon' },
          { id: 'typography.monoFont', label: 'Monospace Font', type: 'dropdown', defaultValue: 'system', options: [{ label: 'System Default', value: 'system' }, { label: 'JetBrains Mono', value: 'JetBrains Mono' }, { label: 'Fira Code', value: 'Fira Code' }], disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'font-sizes',
        title: 'Font Sizes',
        description: 'UI text size scale',
        controls: [
          { id: 'typography.baseSize', label: 'Base Font Size', type: 'slider', defaultValue: 10, min: 8, max: 14, step: 1, unit: 'px' },
          { id: 'typography.headerSize', label: 'Header Size', type: 'slider', defaultValue: 11, min: 9, max: 15, step: 1, unit: 'px' },
          { id: 'typography.smallSize', label: 'Small Text Size', type: 'slider', defaultValue: 9, min: 7, max: 12, step: 1, unit: 'px' },
        ],
      },
      {
        id: 'font-scale',
        title: 'Text Scaling',
        description: 'Global UI text scale multiplier',
        controls: [
          { id: 'typography.globalScale', label: 'UI Text Scale', type: 'slider', defaultValue: 100, min: 75, max: 150, step: 5, unit: '%', disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    icon: 'Layout',
    sections: [
      {
        id: 'panel-sizes',
        title: 'Panel Sizes',
        description: 'Default panel dimensions',
        controls: [
          { id: 'layout.layersPanelWidth', label: 'Layers Panel Width', type: 'slider', defaultValue: 200, min: 140, max: 360, step: 10, unit: 'px' },
          { id: 'layout.inspectorWidth', label: 'Inspector Width', type: 'slider', defaultValue: 240, min: 180, max: 380, step: 10, unit: 'px' },
          { id: 'layout.timelineHeight', label: 'Timeline Height', type: 'slider', defaultValue: 220, min: 80, max: 500, step: 10, unit: 'px' },
        ],
      },
      {
        id: 'sidebar',
        title: 'Sidebar',
        description: 'Sidebar layout settings',
        controls: [
          { id: 'layout.navSidebarWidth', label: 'Nav Sidebar Width', type: 'number', defaultValue: 116, min: 80, max: 180, step: 4, unit: 'px' },
          { id: 'layout.toolSidebarWidth', label: 'Tool Sidebar Width', type: 'number', defaultValue: 32, min: 24, max: 48, step: 4, unit: 'px' },
        ],
      },
      {
        id: 'workspace-proportions',
        title: 'Workspace Proportions',
        description: 'Default layout split ratios',
        controls: [
          { id: 'layout.mediaPoolWidth', label: 'Media Pool Width', type: 'slider', defaultValue: 25, min: 15, max: 40, step: 2.5, unit: '%' },
          { id: 'layout.bottomPanelHeight', label: 'Bottom Panel Height', type: 'slider', defaultValue: 47, min: 20, max: 65, step: 1, unit: '%' },
        ],
      },
    ],
  },
  {
    id: 'keyframes',
    label: 'Keyframes',
    icon: 'Diamond',
    sections: [
      {
        id: 'easing',
        title: 'Default Easing',
        description: 'Default easing curves for new keyframes',
        controls: [
          { id: 'keyframes.defaultEasing', label: 'Default Interpolation', type: 'dropdown', defaultValue: 'linear', options: [{ label: 'Linear', value: 'linear' }, { label: 'Ease In', value: 'easeIn' }, { label: 'Ease Out', value: 'easeOut' }, { label: 'Ease In/Out', value: 'easeInOut' }, { label: 'Hold', value: 'hold' }, { label: 'Spring', value: 'spring' }] },
          { id: 'keyframes.defaultSpringDamping', label: 'Spring Damping', type: 'slider', defaultValue: 0.7, min: 0.1, max: 1, step: 0.05 },
          { id: 'keyframes.defaultSpringFreq', label: 'Spring Frequency', type: 'slider', defaultValue: 4, min: 1, max: 12, step: 0.5 },
        ],
      },
      {
        id: 'interpolation',
        title: 'Interpolation Behavior',
        description: 'How values are interpolated between keyframes',
        controls: [
          { id: 'keyframes.overshootClamp', label: 'Clamp Overshoot', type: 'toggle', defaultValue: false },
          { id: 'keyframes.autoSmooth', label: 'Auto-smooth Handles on Add', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'curve-editor',
        title: 'Curve Editor',
        description: 'Graph editor behavior',
        controls: [
          { id: 'keyframes.curveSnapToGrid', label: 'Snap to Value Grid', type: 'toggle', defaultValue: true },
          { id: 'keyframes.curveHandleLength', label: 'Default Handle Length', type: 'slider', defaultValue: 0.33, min: 0.1, max: 0.5, step: 0.01, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'effects',
    label: 'Effects',
    icon: 'Wand2',
    sections: [
      {
        id: 'effects-panel',
        title: 'Effect Panel',
        description: 'Effect panel interaction settings',
        controls: [
          { id: 'effects.autoPreview', label: 'Auto-preview Effect Changes', type: 'toggle', defaultValue: true },
          { id: 'effects.collapseByDefault', label: 'Collapse Effects by Default', type: 'toggle', defaultValue: false },
        ],
      },
      {
        id: 'quality',
        title: 'Quality Presets',
        description: 'Default quality settings for effects',
        controls: [
          { id: 'effects.defaultQuality', label: 'Default Quality', type: 'dropdown', defaultValue: 'high', options: [{ label: 'Draft', value: 'draft' }, { label: 'Standard', value: 'standard' }, { label: 'High', value: 'high' }, { label: 'Maximum', value: 'max' }], disabled: true, disabledReason: 'Coming soon' },
          { id: 'effects.motionBlurSamples', label: 'Motion Blur Samples', type: 'slider', defaultValue: 8, min: 2, max: 32, step: 2, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    icon: 'Film',
    sections: [
      {
        id: 'import',
        title: 'Import Behavior',
        description: 'How media files are imported',
        controls: [
          { id: 'media.autoDetectFps', label: 'Auto-detect FPS', type: 'toggle', defaultValue: true },
          { id: 'media.importFitMode', label: 'Import Fit Mode', type: 'dropdown', defaultValue: 'fit', options: [{ label: 'Fit to Canvas', value: 'fit' }, { label: 'Fill Canvas', value: 'fill' }, { label: 'Original Size', value: 'original' }] },
        ],
      },
      {
        id: 'cache',
        title: 'Cache',
        description: 'Media cache management',
        controls: [
          { id: 'media.cacheEnabled', label: 'Enable Frame Cache', type: 'toggle', defaultValue: true },
          { id: 'media.maxCacheSize', label: 'Max Cache Size', type: 'slider', defaultValue: 512, min: 128, max: 2048, step: 128, unit: 'MB' },
          { id: 'media.clearCacheOnClose', label: 'Clear Cache on Close', type: 'toggle', defaultValue: false },
        ],
      },
      {
        id: 'proxy',
        title: 'Proxy Settings',
        description: 'Video proxy generation',
        controls: [
          { id: 'media.proxyEnabled', label: 'Enable Proxies', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
          { id: 'media.proxyScale', label: 'Proxy Scale', type: 'dropdown', defaultValue: 0.5, options: [{ label: '25%', value: 0.25 }, { label: '50%', value: 0.5 }, { label: '75%', value: 0.75 }], disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: 'Volume2',
    sections: [
      {
        id: 'waveform',
        title: 'Waveform Display',
        description: 'Audio waveform visualization settings',
        controls: [
          { id: 'audio.showWaveform', label: 'Show Waveforms in Timeline', type: 'toggle', defaultValue: true },
          { id: 'audio.waveformColor', label: 'Waveform Color', type: 'dropdown', defaultValue: 'accent', options: [{ label: 'Accent Color', value: 'accent' }, { label: 'Green', value: 'green' }, { label: 'Blue', value: 'blue' }, { label: 'White', value: 'white' }], disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'analysis',
        title: 'Audio Analysis',
        description: 'Silence detection and analysis settings',
        controls: [
          { id: 'audio.silenceThreshold', label: 'Silence Threshold', type: 'slider', defaultValue: -40, min: -60, max: -10, step: 1, unit: 'dB' },
          { id: 'audio.minSilenceDuration', label: 'Min Silence Duration', type: 'slider', defaultValue: 500, min: 100, max: 2000, step: 50, unit: 'ms' },
        ],
      },
      {
        id: 'processing',
        title: 'Processing',
        description: 'Default audio processing behavior',
        controls: [
          { id: 'audio.fadeInDefault', label: 'Default Fade-in', type: 'number', defaultValue: 0, min: 0, max: 5000, step: 50, unit: 'ms', disabled: true, disabledReason: 'Coming soon' },
          { id: 'audio.fadeOutDefault', label: 'Default Fade-out', type: 'number', defaultValue: 0, min: 0, max: 5000, step: 50, unit: 'ms', disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: 'Keyboard',
    sections: [
      {
        id: 'keybindings',
        title: 'Keyboard Shortcuts',
        description: 'Customize keyboard shortcuts',
        controls: [
          { id: 'shortcuts.preset', label: 'Shortcut Preset', type: 'dropdown', defaultValue: 'default', options: [{ label: 'FlashFX Default', value: 'default' }, { label: 'After Effects', value: 'ae' }, { label: 'Premiere Pro', value: 'premiere' }], disabled: true, disabledReason: 'Custom presets coming soon' },
        ],
      },
      {
        id: 'reset',
        title: 'Reset',
        description: 'Reset shortcuts to factory defaults',
        controls: [
          { id: 'shortcuts.resetAll', label: 'Reset All to Default', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Keybinding editor coming soon' },
        ],
      },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: 'Gauge',
    sections: [
      {
        id: 'gpu',
        title: 'GPU Settings',
        description: 'Hardware acceleration settings',
        controls: [
          { id: 'performance.gpuAcceleration', label: 'GPU Acceleration', type: 'toggle', defaultValue: true },
          { id: 'performance.webgpuPreferred', label: 'Prefer WebGPU', type: 'toggle', defaultValue: true, disabled: true, disabledReason: 'Browser-dependent' },
        ],
      },
      {
        id: 'render-quality',
        title: 'Render Quality',
        description: 'Canvas rendering quality',
        controls: [
          { id: 'performance.renderScale', label: 'Preview Resolution', type: 'dropdown', defaultValue: 1, options: [{ label: 'Full (1x)', value: 1 }, { label: 'Half (0.5x)', value: 0.5 }, { label: 'Quarter (0.25x)', value: 0.25 }] },
          { id: 'performance.antialiasing', label: 'Anti-aliasing', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'preview',
        title: 'Preview Quality',
        description: 'Playback preview settings',
        controls: [
          { id: 'performance.previewFps', label: 'Preview FPS Limit', type: 'dropdown', defaultValue: 0, options: [{ label: 'Unlimited', value: 0 }, { label: '60 fps', value: 60 }, { label: '30 fps', value: 30 }, { label: '24 fps', value: 24 }] },
          { id: 'performance.skipFrames', label: 'Skip Frames on Lag', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'cache-mgmt',
        title: 'Cache Management',
        description: 'Rendering and computation cache',
        controls: [
          { id: 'performance.renderCacheMax', label: 'Render Cache Size', type: 'slider', defaultValue: 256, min: 64, max: 1024, step: 64, unit: 'MB' },
          { id: 'performance.expressionCache', label: 'Expression Result Cache', type: 'toggle', defaultValue: true },
        ],
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'Wrench',
    sections: [
      {
        id: 'experimental',
        title: 'Experimental Features',
        description: 'Features in development (may be unstable)',
        controls: [
          { id: 'advanced.fieldSamplingGpu', label: 'GPU Field Sampling', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Experimental' },
          { id: 'advanced.parallelExport', label: 'Parallel Export Workers', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Experimental' },
          { id: 'advanced.webcodecsDecode', label: 'WebCodecs Decode', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'debug',
        title: 'Debug Tools',
        description: 'Development and debugging tools',
        controls: [
          { id: 'advanced.showFps', label: 'Show FPS Counter', type: 'toggle', defaultValue: false },
          { id: 'advanced.showRenderStats', label: 'Show Render Stats', type: 'toggle', defaultValue: false },
          { id: 'advanced.logExpressionErrors', label: 'Log Expression Errors', type: 'toggle', defaultValue: true },
        ],
      },
      {
        id: 'internals',
        title: 'Internal Toggles',
        description: 'Low-level engine toggles',
        controls: [
          { id: 'advanced.lruCacheSize', label: 'LRU Cache Entries', type: 'number', defaultValue: 128, min: 32, max: 512, step: 32 },
          { id: 'advanced.workerPoolSize', label: 'Worker Pool Size', type: 'number', defaultValue: 2, min: 1, max: 8, step: 1 },
          { id: 'advanced.physicsSubsteps', label: 'Physics Substeps', type: 'number', defaultValue: 2, min: 1, max: 8, step: 1 },
        ],
      },
    ],
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: 'Code2',
    sections: [
      {
        id: 'api',
        title: 'API Access',
        description: 'External API and integration settings',
        controls: [
          { id: 'developer.apiEnabled', label: 'Enable API Access', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
          { id: 'developer.apiPort', label: 'API Port', type: 'number', defaultValue: 3100, min: 1024, max: 65535, step: 1, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'plugins',
        title: 'Plugin System',
        description: 'Plugin loading and management',
        controls: [
          { id: 'developer.pluginsEnabled', label: 'Enable Plugins', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
          { id: 'developer.pluginSandbox', label: 'Plugin Sandbox Mode', type: 'toggle', defaultValue: true, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
      {
        id: 'logging',
        title: 'Logging',
        description: 'Debug logging configuration',
        controls: [
          { id: 'developer.logLevel', label: 'Log Level', type: 'dropdown', defaultValue: 'warn', options: [{ label: 'None', value: 'none' }, { label: 'Error', value: 'error' }, { label: 'Warn', value: 'warn' }, { label: 'Info', value: 'info' }, { label: 'Debug', value: 'debug' }] },
          { id: 'developer.logToConsole', label: 'Log to Console', type: 'toggle', defaultValue: true },
          { id: 'developer.logExpressions', label: 'Log Expression Evaluations', type: 'toggle', defaultValue: false },
        ],
      },
      {
        id: 'overlays',
        title: 'Developer Overlays',
        description: 'On-screen debug overlays',
        controls: [
          { id: 'developer.showBoundingBoxes', label: 'Show Bounding Boxes', type: 'toggle', defaultValue: false },
          { id: 'developer.showLayerIds', label: 'Show Layer IDs', type: 'toggle', defaultValue: false },
          { id: 'developer.showRenderTree', label: 'Show Render Tree', type: 'toggle', defaultValue: false, disabled: true, disabledReason: 'Coming soon' },
        ],
      },
    ],
  },
];
