const STORAGE_KEY = 'flashfx_appearance_settings';

export interface CanvasAppearance {
  canvasDefaultColor: string;
  canvasBorderColor: string;
  canvasBorderWidth: number;
  canvasShadowColor: string;
  canvasShadowBlur: number;
  canvasShadowSpread: number;
  workspaceBgColor: string;
  checkerboard: boolean;
  checkerboardLight: string;
  checkerboardDark: string;
  checkerboardCellSize: number;
  centerSnapColor: string;
  elementSnapColor: string;
  snapLineThickness: number;
  snapLineOpacity: number;
  snapDotColor: string;
  snapDotSize: number;
  snapThreshold: number;
  selectionHandleColor: string;
  selectionHandleSize: number;
  selectionBorderColor: string;
  selectionBorderWidth: number;
  multiSelectFillColor: string;
  multiSelectBorderColor: string;
  multiSelectBorderWidth: number;
}

export interface ClipsTimelineAppearance {
  clipColorShape: string;
  clipColorText: string;
  clipColorImage: string;
  clipColorVideo: string;
  clipColorAudio: string;
  clipColorGradient: string;
  clipColor3D: string;
  clipLabelTextColor: string;
  clipLabelFontSize: number;
  clipBorderRadius: number;
  clipSelectedOutlineColor: string;
  clipSelectedOutlineWidth: number;
  clipLockedOpacity: number;
  playheadLineColor: string;
  playheadLineWidth: number;
  playheadActiveColor: string;
  playheadCapShape: 'square' | 'diamond' | 'circle' | 'triangle-up' | 'triangle-down' | 'arrow-down' | 'pentagon';
  playheadCapSize: number;
  playheadCapColor: string;
  trackBgEven: string;
  trackBgOdd: string;
  trackBorderColor: string;
  trackBorderWidth: number;
  trackHeaderBgColor: string;
  trackHeight: number;
  trackHeaderWidth: number;
  rulerBgColor: string;
  rulerTextColor: string;
  rulerTickColor: string;
  rulerHeight: number;
  rulerFontSize: number;
  snapLineColor: string;
  snapLineWidth: number;
  snapLineOpacity: number;
  keyframeDiamondColor: string;
  keyframeDiamondSize: number;
  keyframeDiamondBorderColor: string;
}

export interface KeyframesTimelineAppearance {
  panelBgColor: string;
  trackRowHeight: number;
  trackRowBgEven: string;
  trackRowBgOdd: string;
  trackRowHoverColor: string;
  trackRowSelectedColor: string;
  trackHeaderWidth: number;
  trackHeaderTextColor: string;
  trackHeaderFontSize: number;
  gridLineOpacity: number;
  zeroLineColor: string;
  zeroLineWidth: number;
  rulerBgColor: string;
  rulerTextColor: string;
  rulerHeight: number;
  scrubberColor: string;
  scrubberWidth: number;
}

export interface LayersPanelAppearance {
  layerRowHeight: number;
  layerIndentSize: number;
  layerRowPaddingH: number;
  rowBgColor: string;
  rowHoverColor: string;
  rowSelectedColor: string;
  rowSelectedTextColor: string;
  rowBorderColor: string;
  rowBorderWidth: number;
  groupHeaderBgColor: string;
  iconSize: number;
  iconColor: string;
  visibilityBtnSize: number;
  lockBtnSize: number;
  buttonSpacing: number;
  buttonColor: string;
  buttonActiveColor: string;
  buttonHoverColor: string;
  nameFontSize: number;
  nameColor: string;
  nameSelectedColor: string;
  nameLockedOpacity: number;
  panelBgColor: string;
  panelHeaderBgColor: string;
  panelHeaderTextColor: string;
  panelHeaderHeight: number;
  scrollbarWidth: number;
}

export interface MediaPageAppearance {
  cardWidth: number;
  cardHeight: number;
  cardBorderRadius: number;
  cardGridGap: number;
  cardGridColumns: number;
  cardBgColor: string;
  cardHoverBgColor: string;
  cardSelectedBgColor: string;
  cardSelectedBorderColor: string;
  cardSelectedBorderWidth: number;
  cardShadowOnHover: boolean;
  thumbnailFitMode: 'cover' | 'contain' | 'fill';
  showAssetTitles: boolean;
  titleFontSize: number;
  titleColor: string;
  titleMaxLines: number;
  showAssetDuration: boolean;
  durationBadgeBgColor: string;
  durationBadgeTextColor: string;
  durationBadgeFontSize: number;
  panelBgColor: string;
  sectionHeaderColor: string;
  sectionHeaderFontSize: number;
  searchBarBgColor: string;
  searchBarBorderColor: string;
}

export interface OtherAppearance {
  contextMenuBgColor: string;
  contextMenuBorderColor: string;
  contextMenuBorderWidth: number;
  contextMenuItemHeight: number;
  contextMenuItemPaddingH: number;
  contextMenuItemHoverColor: string;
  contextMenuItemTextColor: string;
  contextMenuItemActiveTextColor: string;
  contextMenuSeparatorColor: string;
  contextMenuSeparatorWidth: number;
  contextMenuFontSize: number;
  contextMenuMinWidth: number;
  contextMenuShadowColor: string;
  contextMenuShadowBlur: number;
  contextMenuAnimation: 'none' | 'fade' | 'scale';
  tooltipBgColor: string;
  tooltipTextColor: string;
  tooltipFontSize: number;
  tooltipDelay: number;
  tooltipBorderRadius: number;
}

export interface AppearanceSettings {
  canvas: CanvasAppearance;
  clipsTimeline: ClipsTimelineAppearance;
  keyframesTimeline: KeyframesTimelineAppearance;
  layersPanel: LayersPanelAppearance;
  mediaPage: MediaPageAppearance;
  other: OtherAppearance;
}

const FACTORY_DEFAULTS: AppearanceSettings = {
  canvas: {
    canvasDefaultColor: '#000000',
    canvasBorderColor: '#000000',
    canvasBorderWidth: 2,
    canvasShadowColor: 'rgba(0,0,0,0.5)',
    canvasShadowBlur: 24,
    canvasShadowSpread: 0,
    workspaceBgColor: '#111827',
    checkerboard: false,
    checkerboardLight: '#ffffff',
    checkerboardDark: '#cccccc',
    checkerboardCellSize: 16,
    centerSnapColor: '#FFD700',
    elementSnapColor: '#FF8C00',
    snapLineThickness: 2,
    snapLineOpacity: 100,
    snapDotColor: '#EF4444',
    snapDotSize: 5,
    snapThreshold: 8,
    selectionHandleColor: '#FACC15',
    selectionHandleSize: 8,
    selectionBorderColor: '#FACC15',
    selectionBorderWidth: 2,
    multiSelectFillColor: 'rgba(250,204,21,0.1)',
    multiSelectBorderColor: '#FACC15',
    multiSelectBorderWidth: 2,
  },
  clipsTimeline: {
    clipColorShape: '#3b82f6',
    clipColorText: '#3b82f6',
    clipColorImage: '#3b82f6',
    clipColorVideo: '#ef4444',
    clipColorAudio: '#052e16',
    clipColorGradient: '#3b82f6',
    clipColor3D: '#3b82f6',
    clipLabelTextColor: 'rgba(255,255,255,0.92)',
    clipLabelFontSize: 10,
    clipBorderRadius: 0,
    clipSelectedOutlineColor: 'rgba(34,197,94,0.8)',
    clipSelectedOutlineWidth: 2,
    clipLockedOpacity: 30,
    playheadLineColor: '#f59e0b',
    playheadLineWidth: 2,
    playheadActiveColor: '#ef4444',
    playheadCapShape: 'triangle-down',
    playheadCapSize: 16,
    playheadCapColor: '#f59e0b',
    trackBgEven: 'rgba(0,0,0,0)',
    trackBgOdd: 'rgba(0,0,0,0)',
    trackBorderColor: 'rgba(0,0,0,0.6)',
    trackBorderWidth: 1,
    trackHeaderBgColor: 'rgba(31,41,55,0.4)',
    trackHeight: 28,
    trackHeaderWidth: 144,
    rulerBgColor: '#1f2937',
    rulerTextColor: '#9ca3af',
    rulerTickColor: '#9ca3af',
    rulerHeight: 32,
    rulerFontSize: 10,
    snapLineColor: '#ef4444',
    snapLineWidth: 1,
    snapLineOpacity: 100,
    keyframeDiamondColor: 'rgba(255,255,255,0.92)',
    keyframeDiamondSize: 7,
    keyframeDiamondBorderColor: 'rgba(0,0,0,0.55)',
  },
  keyframesTimeline: {
    panelBgColor: '#111827',
    trackRowHeight: 28,
    trackRowBgEven: 'rgba(0,0,0,0)',
    trackRowBgOdd: 'rgba(255,255,255,0.02)',
    trackRowHoverColor: 'rgba(255,255,255,0.04)',
    trackRowSelectedColor: 'rgba(250,204,21,0.08)',
    trackHeaderWidth: 120,
    trackHeaderTextColor: '#9ca3af',
    trackHeaderFontSize: 11,
    gridLineOpacity: 20,
    zeroLineColor: '#374151',
    zeroLineWidth: 1,
    rulerBgColor: '#1f2937',
    rulerTextColor: '#6b7280',
    rulerHeight: 24,
    scrubberColor: '#f59e0b',
    scrubberWidth: 1,
  },
  layersPanel: {
    layerRowHeight: 32,
    layerIndentSize: 16,
    layerRowPaddingH: 8,
    rowBgColor: 'rgba(55,65,81,0.3)',
    rowHoverColor: 'rgba(55,65,81,0.6)',
    rowSelectedColor: 'rgba(250,204,21,0.2)',
    rowSelectedTextColor: '#facc15',
    rowBorderColor: 'rgba(55,65,81,0.3)',
    rowBorderWidth: 1,
    groupHeaderBgColor: 'rgba(31,41,55,0.6)',
    iconSize: 14,
    iconColor: '#9ca3af',
    visibilityBtnSize: 14,
    lockBtnSize: 14,
    buttonSpacing: 4,
    buttonColor: '#6b7280',
    buttonActiveColor: '#facc15',
    buttonHoverColor: '#d1d5db',
    nameFontSize: 12,
    nameColor: '#d1d5db',
    nameSelectedColor: '#facc15',
    nameLockedOpacity: 50,
    panelBgColor: '#111827',
    panelHeaderBgColor: 'rgba(31,41,55,0.8)',
    panelHeaderTextColor: '#ffffff',
    panelHeaderHeight: 32,
    scrollbarWidth: 4,
  },
  mediaPage: {
    cardWidth: 120,
    cardHeight: 80,
    cardBorderRadius: 8,
    cardGridGap: 6,
    cardGridColumns: 3,
    cardBgColor: 'rgba(31,41,55,0.6)',
    cardHoverBgColor: 'rgba(55,65,81,0.6)',
    cardSelectedBgColor: 'rgba(250,204,21,0.1)',
    cardSelectedBorderColor: '#facc15',
    cardSelectedBorderWidth: 2,
    cardShadowOnHover: true,
    thumbnailFitMode: 'cover',
    showAssetTitles: true,
    titleFontSize: 11,
    titleColor: '#d1d5db',
    titleMaxLines: 1,
    showAssetDuration: true,
    durationBadgeBgColor: 'rgba(0,0,0,0.7)',
    durationBadgeTextColor: '#ffffff',
    durationBadgeFontSize: 10,
    panelBgColor: '#111827',
    sectionHeaderColor: '#6b7280',
    sectionHeaderFontSize: 11,
    searchBarBgColor: '#1f2937',
    searchBarBorderColor: 'rgba(55,65,81,0.5)',
  },
  other: {
    contextMenuBgColor: '#1f2937',
    contextMenuBorderColor: '#374151',
    contextMenuBorderWidth: 1,
    contextMenuItemHeight: 32,
    contextMenuItemPaddingH: 12,
    contextMenuItemHoverColor: '#374151',
    contextMenuItemTextColor: '#d1d5db',
    contextMenuItemActiveTextColor: '#ffffff',
    contextMenuSeparatorColor: '#374151',
    contextMenuSeparatorWidth: 1,
    contextMenuFontSize: 12,
    contextMenuMinWidth: 180,
    contextMenuShadowColor: 'rgba(0,0,0,0.5)',
    contextMenuShadowBlur: 16,
    contextMenuAnimation: 'none',
    tooltipBgColor: '#111827',
    tooltipTextColor: '#ffffff',
    tooltipFontSize: 12,
    tooltipDelay: 400,
    tooltipBorderRadius: 2,
  },
};

function deepMerge<T>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults };
  for (const key in saved) {
    const k = key as keyof T;
    if (saved[k] !== undefined && saved[k] !== null) {
      result[k] = saved[k] as T[keyof T];
    }
  }
  return result;
}

class AppearanceSettingsService {
  private settings: AppearanceSettings;

  constructor() {
    this.settings = this.load();
    this.applyAllCssVars();
  }

  private load(): AppearanceSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...FACTORY_DEFAULTS, canvas: { ...FACTORY_DEFAULTS.canvas }, clipsTimeline: { ...FACTORY_DEFAULTS.clipsTimeline }, keyframesTimeline: { ...FACTORY_DEFAULTS.keyframesTimeline }, layersPanel: { ...FACTORY_DEFAULTS.layersPanel }, mediaPage: { ...FACTORY_DEFAULTS.mediaPage }, other: { ...FACTORY_DEFAULTS.other } };
      const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
      return {
        canvas: deepMerge(FACTORY_DEFAULTS.canvas, parsed.canvas ?? {}),
        clipsTimeline: deepMerge(FACTORY_DEFAULTS.clipsTimeline, parsed.clipsTimeline ?? {}),
        keyframesTimeline: deepMerge(FACTORY_DEFAULTS.keyframesTimeline, parsed.keyframesTimeline ?? {}),
        layersPanel: deepMerge(FACTORY_DEFAULTS.layersPanel, parsed.layersPanel ?? {}),
        mediaPage: deepMerge(FACTORY_DEFAULTS.mediaPage, parsed.mediaPage ?? {}),
        other: deepMerge(FACTORY_DEFAULTS.other, parsed.other ?? {}),
      };
    } catch {
      return { ...FACTORY_DEFAULTS };
    }
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  getAll(): AppearanceSettings {
    return this.settings;
  }

  getCanvas(): CanvasAppearance { return this.settings.canvas; }
  getClipsTimeline(): ClipsTimelineAppearance { return this.settings.clipsTimeline; }
  getKeyframesTimeline(): KeyframesTimelineAppearance { return this.settings.keyframesTimeline; }
  getLayersPanel(): LayersPanelAppearance { return this.settings.layersPanel; }
  getMediaPage(): MediaPageAppearance { return this.settings.mediaPage; }
  getOther(): OtherAppearance { return this.settings.other; }

  setCanvas(updates: Partial<CanvasAppearance>) {
    this.settings.canvas = { ...this.settings.canvas, ...updates };
    this.save();
    this.applyCanvasCssVars();
  }

  setClipsTimeline(updates: Partial<ClipsTimelineAppearance>) {
    this.settings.clipsTimeline = { ...this.settings.clipsTimeline, ...updates };
    this.save();
    this.applyClipsTimelineCssVars();
  }

  setKeyframesTimeline(updates: Partial<KeyframesTimelineAppearance>) {
    this.settings.keyframesTimeline = { ...this.settings.keyframesTimeline, ...updates };
    this.save();
    this.applyKeyframesTimelineCssVars();
  }

  setLayersPanel(updates: Partial<LayersPanelAppearance>) {
    this.settings.layersPanel = { ...this.settings.layersPanel, ...updates };
    this.save();
    this.applyLayersPanelCssVars();
  }

  setMediaPage(updates: Partial<MediaPageAppearance>) {
    this.settings.mediaPage = { ...this.settings.mediaPage, ...updates };
    this.save();
    this.applyMediaPageCssVars();
  }

  setOther(updates: Partial<OtherAppearance>) {
    this.settings.other = { ...this.settings.other, ...updates };
    this.save();
    this.applyOtherCssVars();
  }

  resetCanvas() {
    this.settings.canvas = { ...FACTORY_DEFAULTS.canvas };
    this.save();
    this.applyCanvasCssVars();
  }

  resetClipsTimeline() {
    this.settings.clipsTimeline = { ...FACTORY_DEFAULTS.clipsTimeline };
    this.save();
    this.applyClipsTimelineCssVars();
  }

  resetKeyframesTimeline() {
    this.settings.keyframesTimeline = { ...FACTORY_DEFAULTS.keyframesTimeline };
    this.save();
    this.applyKeyframesTimelineCssVars();
  }

  resetLayersPanel() {
    this.settings.layersPanel = { ...FACTORY_DEFAULTS.layersPanel };
    this.save();
    this.applyLayersPanelCssVars();
  }

  resetMediaPage() {
    this.settings.mediaPage = { ...FACTORY_DEFAULTS.mediaPage };
    this.save();
    this.applyMediaPageCssVars();
  }

  resetOther() {
    this.settings.other = { ...FACTORY_DEFAULTS.other };
    this.save();
    this.applyOtherCssVars();
  }

  resetAll() {
    this.settings = {
      canvas: { ...FACTORY_DEFAULTS.canvas },
      clipsTimeline: { ...FACTORY_DEFAULTS.clipsTimeline },
      keyframesTimeline: { ...FACTORY_DEFAULTS.keyframesTimeline },
      layersPanel: { ...FACTORY_DEFAULTS.layersPanel },
      mediaPage: { ...FACTORY_DEFAULTS.mediaPage },
      other: { ...FACTORY_DEFAULTS.other },
    };
    this.save();
    this.applyAllCssVars();
  }

  private applyAllCssVars() {
    this.applyCanvasCssVars();
    this.applyClipsTimelineCssVars();
    this.applyKeyframesTimelineCssVars();
    this.applyLayersPanelCssVars();
    this.applyMediaPageCssVars();
    this.applyOtherCssVars();
  }

  private css(prop: string, val: string | number) {
    document.documentElement.style.setProperty(prop, String(val));
  }

  private applyCanvasCssVars() {
    const c = this.settings.canvas;
    this.css('--appearance-canvas-default-color', c.canvasDefaultColor);
    this.css('--appearance-canvas-border-color', c.canvasBorderColor);
    this.css('--appearance-canvas-border-width', `${c.canvasBorderWidth}px`);
    this.css('--appearance-canvas-shadow-color', c.canvasShadowColor);
    this.css('--appearance-canvas-shadow-blur', `${c.canvasShadowBlur}px`);
    this.css('--appearance-canvas-shadow-spread', `${c.canvasShadowSpread}px`);
    this.css('--appearance-canvas-workspace-bg', c.workspaceBgColor);
    this.css('--appearance-canvas-center-snap-color', c.centerSnapColor);
    this.css('--appearance-canvas-element-snap-color', c.elementSnapColor);
    this.css('--appearance-canvas-snap-line-thickness', `${c.snapLineThickness}px`);
    this.css('--appearance-canvas-snap-line-opacity', `${c.snapLineOpacity / 100}`);
    this.css('--appearance-canvas-snap-dot-color', c.snapDotColor);
    this.css('--appearance-canvas-snap-dot-size', `${c.snapDotSize}px`);
    this.css('--appearance-canvas-selection-handle-color', c.selectionHandleColor);
    this.css('--appearance-canvas-selection-handle-size', `${c.selectionHandleSize}px`);
    this.css('--appearance-canvas-selection-border-color', c.selectionBorderColor);
    this.css('--appearance-canvas-selection-border-width', `${c.selectionBorderWidth}px`);
    this.css('--appearance-canvas-multi-select-fill', c.multiSelectFillColor);
    this.css('--appearance-canvas-multi-select-border', c.multiSelectBorderColor);
    this.css('--appearance-canvas-multi-select-border-width', `${c.multiSelectBorderWidth}px`);
  }

  private applyClipsTimelineCssVars() {
    const c = this.settings.clipsTimeline;
    this.css('--appearance-clips-color-shape', c.clipColorShape);
    this.css('--appearance-clips-color-text', c.clipColorText);
    this.css('--appearance-clips-color-image', c.clipColorImage);
    this.css('--appearance-clips-color-video', c.clipColorVideo);
    this.css('--appearance-clips-color-audio', c.clipColorAudio);
    this.css('--appearance-clips-color-gradient', c.clipColorGradient);
    this.css('--appearance-clips-color-3d', c.clipColor3D);
    this.css('--appearance-clips-label-text-color', c.clipLabelTextColor);
    this.css('--appearance-clips-label-font-size', `${c.clipLabelFontSize}px`);
    this.css('--appearance-clips-border-radius', `${c.clipBorderRadius}px`);
    this.css('--appearance-clips-selected-outline-color', c.clipSelectedOutlineColor);
    this.css('--appearance-clips-selected-outline-width', `${c.clipSelectedOutlineWidth}px`);
    this.css('--appearance-clips-locked-opacity', `${c.clipLockedOpacity / 100}`);
    this.css('--appearance-clips-playhead-color', c.playheadLineColor);
    this.css('--appearance-clips-playhead-width', `${c.playheadLineWidth}px`);
    this.css('--appearance-clips-playhead-active-color', c.playheadActiveColor);
    this.css('--appearance-clips-playhead-cap-size', `${c.playheadCapSize}px`);
    this.css('--appearance-clips-playhead-cap-color', c.playheadCapColor);
    this.css('--appearance-clips-track-bg-even', c.trackBgEven);
    this.css('--appearance-clips-track-bg-odd', c.trackBgOdd);
    this.css('--appearance-clips-track-border-color', c.trackBorderColor);
    this.css('--appearance-clips-track-border-width', `${c.trackBorderWidth}px`);
    this.css('--appearance-clips-track-header-bg', c.trackHeaderBgColor);
    this.css('--appearance-clips-track-height', `${c.trackHeight}px`);
    this.css('--appearance-clips-track-header-width', `${c.trackHeaderWidth}px`);
    this.css('--appearance-clips-ruler-bg', c.rulerBgColor);
    this.css('--appearance-clips-ruler-text', c.rulerTextColor);
    this.css('--appearance-clips-ruler-tick', c.rulerTickColor);
    this.css('--appearance-clips-ruler-height', `${c.rulerHeight}px`);
    this.css('--appearance-clips-ruler-font-size', `${c.rulerFontSize}px`);
    this.css('--appearance-clips-snap-line-color', c.snapLineColor);
    this.css('--appearance-clips-snap-line-width', `${c.snapLineWidth}px`);
    this.css('--appearance-clips-snap-line-opacity', `${c.snapLineOpacity / 100}`);
    this.css('--appearance-clips-kf-diamond-color', c.keyframeDiamondColor);
    this.css('--appearance-clips-kf-diamond-size', `${c.keyframeDiamondSize}px`);
    this.css('--appearance-clips-kf-diamond-border', c.keyframeDiamondBorderColor);
  }

  private applyKeyframesTimelineCssVars() {
    const c = this.settings.keyframesTimeline;
    this.css('--appearance-kftl-panel-bg', c.panelBgColor);
    this.css('--appearance-kftl-row-height', `${c.trackRowHeight}px`);
    this.css('--appearance-kftl-row-bg-even', c.trackRowBgEven);
    this.css('--appearance-kftl-row-bg-odd', c.trackRowBgOdd);
    this.css('--appearance-kftl-row-hover', c.trackRowHoverColor);
    this.css('--appearance-kftl-row-selected', c.trackRowSelectedColor);
    this.css('--appearance-kftl-header-width', `${c.trackHeaderWidth}px`);
    this.css('--appearance-kftl-header-text', c.trackHeaderTextColor);
    this.css('--appearance-kftl-header-font-size', `${c.trackHeaderFontSize}px`);
    this.css('--appearance-kftl-grid-opacity', `${c.gridLineOpacity / 100}`);
    this.css('--appearance-kftl-zero-line-color', c.zeroLineColor);
    this.css('--appearance-kftl-zero-line-width', `${c.zeroLineWidth}px`);
    this.css('--appearance-kftl-ruler-bg', c.rulerBgColor);
    this.css('--appearance-kftl-ruler-text', c.rulerTextColor);
    this.css('--appearance-kftl-ruler-height', `${c.rulerHeight}px`);
    this.css('--appearance-kftl-scrubber-color', c.scrubberColor);
    this.css('--appearance-kftl-scrubber-width', `${c.scrubberWidth}px`);
  }

  private applyLayersPanelCssVars() {
    const c = this.settings.layersPanel;
    this.css('--appearance-layers-row-height', `${c.layerRowHeight}px`);
    this.css('--appearance-layers-indent-size', `${c.layerIndentSize}px`);
    this.css('--appearance-layers-row-padding-h', `${c.layerRowPaddingH}px`);
    this.css('--appearance-layers-row-bg', c.rowBgColor);
    this.css('--appearance-layers-row-hover', c.rowHoverColor);
    this.css('--appearance-layers-row-selected', c.rowSelectedColor);
    this.css('--appearance-layers-row-selected-text', c.rowSelectedTextColor);
    this.css('--appearance-layers-row-border', c.rowBorderColor);
    this.css('--appearance-layers-row-border-width', `${c.rowBorderWidth}px`);
    this.css('--appearance-layers-group-header-bg', c.groupHeaderBgColor);
    this.css('--appearance-layers-icon-size', `${c.iconSize}px`);
    this.css('--appearance-layers-icon-color', c.iconColor);
    this.css('--appearance-layers-btn-color', c.buttonColor);
    this.css('--appearance-layers-btn-active-color', c.buttonActiveColor);
    this.css('--appearance-layers-btn-hover-color', c.buttonHoverColor);
    this.css('--appearance-layers-name-font-size', `${c.nameFontSize}px`);
    this.css('--appearance-layers-name-color', c.nameColor);
    this.css('--appearance-layers-name-selected-color', c.nameSelectedColor);
    this.css('--appearance-layers-name-locked-opacity', `${c.nameLockedOpacity / 100}`);
    this.css('--appearance-layers-panel-bg', c.panelBgColor);
    this.css('--appearance-layers-panel-header-bg', c.panelHeaderBgColor);
    this.css('--appearance-layers-panel-header-text', c.panelHeaderTextColor);
    this.css('--appearance-layers-panel-header-height', `${c.panelHeaderHeight}px`);
  }

  private applyMediaPageCssVars() {
    const c = this.settings.mediaPage;
    this.css('--appearance-media-card-width', `${c.cardWidth}px`);
    this.css('--appearance-media-card-height', `${c.cardHeight}px`);
    this.css('--appearance-media-card-border-radius', `${c.cardBorderRadius}px`);
    this.css('--appearance-media-card-gap', `${c.cardGridGap}px`);
    this.css('--appearance-media-card-columns', String(c.cardGridColumns));
    this.css('--appearance-media-card-bg', c.cardBgColor);
    this.css('--appearance-media-card-hover-bg', c.cardHoverBgColor);
    this.css('--appearance-media-card-selected-bg', c.cardSelectedBgColor);
    this.css('--appearance-media-card-selected-border', c.cardSelectedBorderColor);
    this.css('--appearance-media-card-selected-border-width', `${c.cardSelectedBorderWidth}px`);
    this.css('--appearance-media-title-font-size', `${c.titleFontSize}px`);
    this.css('--appearance-media-title-color', c.titleColor);
    this.css('--appearance-media-duration-badge-bg', c.durationBadgeBgColor);
    this.css('--appearance-media-duration-badge-text', c.durationBadgeTextColor);
    this.css('--appearance-media-duration-badge-font-size', `${c.durationBadgeFontSize}px`);
    this.css('--appearance-media-panel-bg', c.panelBgColor);
    this.css('--appearance-media-section-header-color', c.sectionHeaderColor);
    this.css('--appearance-media-section-header-font-size', `${c.sectionHeaderFontSize}px`);
    this.css('--appearance-media-search-bar-bg', c.searchBarBgColor);
    this.css('--appearance-media-search-bar-border', c.searchBarBorderColor);
  }

  private applyOtherCssVars() {
    const c = this.settings.other;
    this.css('--appearance-ctx-bg', c.contextMenuBgColor);
    this.css('--appearance-ctx-border-color', c.contextMenuBorderColor);
    this.css('--appearance-ctx-border-width', `${c.contextMenuBorderWidth}px`);
    this.css('--appearance-ctx-item-height', `${c.contextMenuItemHeight}px`);
    this.css('--appearance-ctx-item-padding-h', `${c.contextMenuItemPaddingH}px`);
    this.css('--appearance-ctx-item-hover', c.contextMenuItemHoverColor);
    this.css('--appearance-ctx-item-text', c.contextMenuItemTextColor);
    this.css('--appearance-ctx-item-active-text', c.contextMenuItemActiveTextColor);
    this.css('--appearance-ctx-separator', c.contextMenuSeparatorColor);
    this.css('--appearance-ctx-separator-width', `${c.contextMenuSeparatorWidth}px`);
    this.css('--appearance-ctx-font-size', `${c.contextMenuFontSize}px`);
    this.css('--appearance-ctx-min-width', `${c.contextMenuMinWidth}px`);
    this.css('--appearance-ctx-shadow-color', c.contextMenuShadowColor);
    this.css('--appearance-ctx-shadow-blur', `${c.contextMenuShadowBlur}px`);
    this.css('--appearance-tooltip-bg', c.tooltipBgColor);
    this.css('--appearance-tooltip-text', c.tooltipTextColor);
    this.css('--appearance-tooltip-font-size', `${c.tooltipFontSize}px`);
    this.css('--appearance-tooltip-border-radius', `${c.tooltipBorderRadius}px`);
  }
}

export const appearanceSettingsService = new AppearanceSettingsService();
