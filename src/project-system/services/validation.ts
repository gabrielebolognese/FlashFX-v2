import type {
  Composition,
  Layer,
  ShapeLayer,
  TextLayer,
  GroupLayer,
  VideoLayer,
  ImageLayer,
  AudioLayer,
  AnimatableProperty,
  Transform,
  ShapeGeometry,
  Background,
  BackgroundLayer,
  CompositionSettings,
  Vec4,
  ImageFilters,
  ImageColorCorrection,
  ColorWheelValues,
  TextContent,
  TextLayoutConfig,
  TextAnimatableOverrides,
  TextSpanStyle,
  Track,
  Mask,
  MaskType,
  LottieIconLayer,
  PrecompLayer,
  LayerShadow,
  LayerGlow,
  LayerBlur,
  LayerEffect,
  ShapeMaterialConfig,
  ShapePatternConfig,
  PathVertex,
} from '../../core/types';
import type { LayerConstraints } from '../../core/reframe';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function ensureAnimatableProperty(val: unknown, name: string, valueType: 'number' | 'vec2', defaultValue: number | [number, number]): AnimatableProperty {
  if (isObject(val) && Array.isArray((val as Record<string, unknown>).keyframes)) {
    const prop = val as Record<string, unknown>;
    return {
      id: typeof prop.id === 'string' ? prop.id : crypto.randomUUID(),
      name: typeof prop.name === 'string' ? prop.name : name,
      valueType,
      defaultValue: prop.defaultValue != null ? prop.defaultValue as number | [number, number] : defaultValue,
      keyframes: Array.isArray(prop.keyframes) ? prop.keyframes.filter(isValidKeyframe) : [],
    };
  }
  if (typeof val === 'number') {
    return { id: crypto.randomUUID(), name, valueType: 'number', defaultValue: val, keyframes: [] };
  }
  return { id: crypto.randomUUID(), name, valueType, defaultValue, keyframes: [] };
}

function isValidKeyframe(k: unknown): boolean {
  if (!isObject(k)) return false;
  const kf = k as Record<string, unknown>;
  return typeof kf.frame === 'number' && kf.value != null;
}

function ensureTransform(val: unknown): Transform {
  const t = isObject(val) ? val as Record<string, unknown> : {};
  return {
    position: ensureAnimatableProperty(t.position, 'Position', 'vec2', [0, 0]),
    rotation: ensureAnimatableProperty(t.rotation, 'Rotation', 'number', 0),
    scale: ensureAnimatableProperty(t.scale, 'Scale', 'vec2', [1, 1]),
    anchorPoint: ensureAnimatableProperty(t.anchorPoint, 'Anchor Point', 'vec2', [0, 0]),
    opacity: ensureAnimatableProperty(t.opacity, 'Opacity', 'number', 1),
    // 2.5D depth props: whitelisted through the round-trip only when present, so a pure-2D
    // layer serializes byte-identically (were being silently stripped otherwise).
    ...(isObject(t.positionZ) ? { positionZ: ensureAnimatableProperty(t.positionZ, 'Z Position', 'number', 0) } : {}),
    ...(isObject(t.rotationX) ? { rotationX: ensureAnimatableProperty(t.rotationX, 'X Rotation', 'number', 0) } : {}),
    ...(isObject(t.rotationY) ? { rotationY: ensureAnimatableProperty(t.rotationY, 'Y Rotation', 'number', 0) } : {}),
  };
}

function ensureVec4(val: unknown, fallback: Vec4): Vec4 {
  if (Array.isArray(val) && val.length >= 4) return [val[0], val[1], val[2], val[3]];
  if (Array.isArray(val) && val.length === 3) return [val[0], val[1], val[2], 1];
  return fallback;
}

function ensureShapeGeometry(val: unknown): ShapeGeometry | null {
  if (!isObject(val)) return null;
  const s = val as Record<string, unknown>;
  const fillColor = ensureVec4(s.fillColor, [0.5, 0.5, 0.5, 1]);
  const strokeColor = ensureVec4(s.strokeColor, [0, 0, 0, 0]);
  const strokeWidth = ensureAnimatableProperty(s.strokeWidth, 'Stroke Width', 'number', 0);

  switch (s.type) {
    case 'rectangle':
      return {
        type: 'rectangle',
        width: ensureAnimatableProperty(s.width, 'Width', 'number', 200),
        height: ensureAnimatableProperty(s.height, 'Height', 'number', 150),
        fillColor,
        strokeColor,
        strokeWidth,
        borderRadius: ensureAnimatableProperty(s.borderRadius, 'Border Radius', 'number', 0),
        ...(Array.isArray(s.cornerRadii) && s.cornerRadii.length === 4
          ? {
              cornerRadii: [
                ensureAnimatableProperty(s.cornerRadii[0], 'Corner TL', 'number', 0),
                ensureAnimatableProperty(s.cornerRadii[1], 'Corner TR', 'number', 0),
                ensureAnimatableProperty(s.cornerRadii[2], 'Corner BR', 'number', 0),
                ensureAnimatableProperty(s.cornerRadii[3], 'Corner BL', 'number', 0),
              ] as [AnimatableProperty, AnimatableProperty, AnimatableProperty, AnimatableProperty],
            }
          : {}),
      };
    case 'circle':
      return {
        type: 'circle',
        radius: ensureAnimatableProperty(s.radius, 'Radius', 'number', 80),
        fillColor,
        strokeColor,
        strokeWidth,
      };
    case 'star':
      return {
        type: 'star',
        points: ensureAnimatableProperty(s.points, 'Points', 'number', 5),
        outerRadius: ensureAnimatableProperty(s.outerRadius, 'Outer Radius', 'number', 80),
        innerRadius: ensureAnimatableProperty(s.innerRadius, 'Inner Radius', 'number', 35),
        fillColor,
        strokeColor,
        strokeWidth,
      };
    case 'polygon':
      return {
        type: 'polygon',
        vertices: Array.isArray(s.vertices) ? s.vertices : [],
        closed: typeof s.closed === 'boolean' ? s.closed : true,
        fillColor,
        strokeColor,
        strokeWidth,
        // M17 — preserve glyph counters + fill rule (else stripped on save/load).
        ...(Array.isArray(s.holes) ? { holes: s.holes as PathVertex[][] } : {}),
        ...(s.fillRule === 'evenodd' || s.fillRule === 'nonzero' ? { fillRule: s.fillRule } : {}),
      };
    default:
      return null;
  }
}

function ensureImageFilters(val: unknown): ImageFilters {
  const f = isObject(val) ? val as Record<string, unknown> : {};
  return {
    brightness: typeof f.brightness === 'number' ? f.brightness : 0,
    contrast: typeof f.contrast === 'number' ? f.contrast : 0,
    saturation: typeof f.saturation === 'number' ? f.saturation : 0,
    exposure: typeof f.exposure === 'number' ? f.exposure : 0,
    gamma: typeof f.gamma === 'number' ? f.gamma : 1,
  };
}

function ensureColorWheelValues(val: unknown): ColorWheelValues {
  const v = isObject(val) ? val as Record<string, unknown> : {};
  return {
    r: typeof v.r === 'number' ? v.r : 0,
    g: typeof v.g === 'number' ? v.g : 0,
    b: typeof v.b === 'number' ? v.b : 0,
    intensity: typeof v.intensity === 'number' ? v.intensity : 0,
    luminance: typeof v.luminance === 'number' ? v.luminance : 0,
  };
}

function ensureColorCorrection(val: unknown): ImageColorCorrection {
  const cc = isObject(val) ? val as Record<string, unknown> : {};
  return {
    lift: ensureColorWheelValues(cc.lift),
    gamma: ensureColorWheelValues(cc.gamma),
    gain: ensureColorWheelValues(cc.gain),
    offset: ensureColorWheelValues(cc.offset),
    temperature: typeof cc.temperature === 'number' ? cc.temperature : 0,
    tint: typeof cc.tint === 'number' ? cc.tint : 0,
    vibrance: typeof cc.vibrance === 'number' ? cc.vibrance : 0,
    saturation: typeof cc.saturation === 'number' ? cc.saturation : 0,
    contrast: typeof cc.contrast === 'number' ? cc.contrast : 0,
    pivot: typeof cc.pivot === 'number' ? cc.pivot : 0.5,
  };
}

function ensureTextSpanStyle(val: unknown): TextSpanStyle {
  const s = isObject(val) ? val as Record<string, unknown> : {};
  return {
    fontFamily: typeof s.fontFamily === 'string' ? s.fontFamily : 'Inter',
    fontWeight: (typeof s.fontWeight === 'number' ? s.fontWeight : 400) as TextSpanStyle['fontWeight'],
    fontStyle: s.fontStyle === 'italic' ? 'italic' : 'normal',
    fontSize: typeof s.fontSize === 'number' ? s.fontSize : 48,
    color: ensureVec4(s.color ?? s.fillColor, [1, 1, 1, 1]),
    letterSpacing: typeof s.letterSpacing === 'number' ? s.letterSpacing : 0,
    lineHeight: typeof s.lineHeight === 'number' ? s.lineHeight : 1.2,
    strokeColor: ensureVec4(s.strokeColor, [0, 0, 0, 0]),
    strokeWidth: typeof s.strokeWidth === 'number' ? s.strokeWidth : 0,
    underline: typeof s.underline === 'boolean' ? s.underline : false,
    strikethrough: typeof s.strikethrough === 'boolean' ? s.strikethrough : false,
    textTransform: (s.textTransform === 'uppercase' || s.textTransform === 'lowercase' || s.textTransform === 'capitalize') ? s.textTransform : 'none',
  };
}

function ensureTextContent(val: unknown): TextContent {
  if (isObject(val) && Array.isArray((val as Record<string, unknown>).spans)) {
    const spans = ((val as Record<string, unknown>).spans as unknown[]).map((sp) => {
      if (!isObject(sp)) return { text: '', style: ensureTextSpanStyle(undefined) };
      const s = sp as Record<string, unknown>;
      return { text: typeof s.text === 'string' ? s.text : '', style: ensureTextSpanStyle(s.style) };
    });
    return { spans: spans.length > 0 ? spans : [{ text: 'Text', style: ensureTextSpanStyle(undefined) }] };
  }
  return { spans: [{ text: 'Text', style: ensureTextSpanStyle(undefined) }] };
}

function ensureTextLayoutConfig(val: unknown): TextLayoutConfig {
  const c = isObject(val) ? val as Record<string, unknown> : {};
  const bbRaw = isObject(c.boundingBox) ? c.boundingBox as Record<string, unknown> : {};
  let boundingBox: TextLayoutConfig['boundingBox'] = { type: 'auto' };
  if (bbRaw.type === 'fixed' && typeof bbRaw.width === 'number' && typeof bbRaw.height === 'number') {
    boundingBox = { type: 'fixed', width: bbRaw.width, height: bbRaw.height };
  } else if (bbRaw.type === 'fixedWidth' && typeof bbRaw.width === 'number') {
    boundingBox = { type: 'fixedWidth', width: bbRaw.width };
  }
  return {
    boundingBox,
    horizontalAlign: (c.horizontalAlign === 'left' || c.horizontalAlign === 'center' || c.horizontalAlign === 'right') ? c.horizontalAlign : 'center',
    verticalAlign: (c.verticalAlign === 'top' || c.verticalAlign === 'middle' || c.verticalAlign === 'bottom') ? c.verticalAlign : 'top',
    overflow: (c.overflow === 'visible' || c.overflow === 'clip' || c.overflow === 'truncate') ? c.overflow : 'visible',
    baselineShift: typeof c.baselineShift === 'number' ? c.baselineShift : 0,
    perGlyphAnimation: typeof c.perGlyphAnimation === 'boolean' ? c.perGlyphAnimation : false,
  };
}

function ensureTextAnimOverrides(val: unknown): TextAnimatableOverrides {
  const o = isObject(val) ? val as Record<string, unknown> : {};
  return {
    fontSize: ensureAnimatableProperty(o.fontSize, 'Font Size', 'number', 48),
    letterSpacing: ensureAnimatableProperty(o.letterSpacing, 'Letter Spacing', 'number', 0),
    lineHeight: ensureAnimatableProperty(o.lineHeight, 'Line Height', 'number', 1.2),
    strokeWidth: ensureAnimatableProperty(o.strokeWidth, 'Stroke Width', 'number', 0),
  };
}

function ensureMasks(val: unknown): Mask[] | undefined {
  if (!Array.isArray(val) || val.length === 0) return undefined;
  const validTypes: MaskType[] = ['rectangle', 'ellipse', 'star', 'polygon'];
  const masks: Mask[] = [];
  for (const raw of val) {
    if (!isObject(raw)) continue;
    const m = raw as Record<string, unknown>;
    const type = validTypes.includes(m.type as MaskType) ? (m.type as MaskType) : 'rectangle';
    masks.push({
      id: typeof m.id === 'string' ? m.id : crypto.randomUUID(),
      name: typeof m.name === 'string' ? m.name : 'Mask',
      type,
      enabled: typeof m.enabled === 'boolean' ? m.enabled : true,
      inverted: typeof m.inverted === 'boolean' ? m.inverted : false,
      position: ensureAnimatableProperty(m.position, 'Mask Position', 'vec2', [0, 0]),
      size: ensureAnimatableProperty(m.size, 'Mask Size', 'vec2', [200, 200]),
      rotation: ensureAnimatableProperty(m.rotation, 'Mask Rotation', 'number', 0),
      feather: ensureAnimatableProperty(m.feather, 'Mask Feather', 'number', 0),
      opacity: ensureAnimatableProperty(m.opacity, 'Mask Opacity', 'number', 1),
      points: typeof m.points === 'number' ? m.points : 5,
      innerRadius: ensureAnimatableProperty(m.innerRadius, 'Inner Radius', 'number', 40),
    });
  }
  return masks.length > 0 ? masks : undefined;
}

function validateLayer(raw: unknown): Layer | null {
  if (!isObject(raw)) return null;
  const r = raw as Record<string, unknown>;

  const baseFields = {
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' ? r.name : 'Layer',
    parentId: typeof r.parentId === 'string' ? r.parentId : null,
    trackId: typeof r.trackId === 'string' ? r.trackId : null,
    visible: typeof r.visible === 'boolean' ? r.visible : true,
    locked: typeof r.locked === 'boolean' ? r.locked : false,
    effectsEnabled: typeof r.effectsEnabled === 'boolean' ? r.effectsEnabled : true,
    motionBlur: typeof r.motionBlur === 'boolean' ? r.motionBlur : false,
    motionBlurShutter: typeof r.motionBlurShutter === 'number' ? r.motionBlurShutter : 180,
    is3D: typeof r.is3D === 'boolean' ? r.is3D : false,
    blendMode: typeof r.blendMode === 'string' ? r.blendMode as Layer['blendMode'] : 'normal' as const,
    transform: ensureTransform(r.transform),
    masks: ensureMasks(r.masks),
    inPoint: typeof r.inPoint === 'number' ? r.inPoint : 0,
    outPoint: typeof r.outPoint === 'number' ? r.outPoint : 150,
    ...(typeof r.labelColor === 'string' ? { labelColor: r.labelColor } : {}),
    // M14 reframe constraints — preserve through the round-trip (else stripped on save/load,
    // the same data-loss class that bit cloner/precomp).
    ...(isObject(r.constraints) ? { constraints: r.constraints as unknown as LayerConstraints } : {}),
    // Per-layer effects are app-generated structured blobs — preserve them
    // through the round-trip rather than dropping them (was a data-loss bug).
    ...(isObject(r.shadow) ? { shadow: r.shadow as unknown as LayerShadow } : {}),
    ...(isObject(r.glow) ? { glow: r.glow as unknown as LayerGlow } : {}),
    ...(isObject(r.blur) ? { blur: r.blur as unknown as LayerBlur } : {}),
    ...(Array.isArray(r.effects) ? { effects: r.effects as LayerEffect[] } : {}),
  };

  switch (r.type) {
    case 'shape': {
      const shape = ensureShapeGeometry(r.shape);
      if (!shape) return null;
      return {
        ...baseFields,
        type: 'shape',
        shape,
        // Preserve shape material / pattern fill (were dropped on load).
        ...(isObject(r.materialConfig) ? { materialConfig: r.materialConfig as unknown as ShapeMaterialConfig } : {}),
        ...(isObject(r.strokeMaterialConfig) ? { strokeMaterialConfig: r.strokeMaterialConfig as unknown as ShapeMaterialConfig } : {}),
        ...(isObject(r.patternFill) ? { patternFill: r.patternFill as unknown as ShapePatternConfig } : {}),
        // M21 — preserve linked-style refs (else stripped on save/load).
        ...(typeof r.fillStyleId === 'string' ? { fillStyleId: r.fillStyleId } : {}),
        ...(typeof r.strokeStyleId === 'string' ? { strokeStyleId: r.strokeStyleId } : {}),
      } as ShapeLayer;
    }
    case 'text': {
      // Support loading old format (text.content/text.style) and new format (content/layoutConfig/animOverrides)
      let textContent: TextContent;
      let layoutConfig: TextLayoutConfig;
      let animOverrides: TextAnimatableOverrides;

      if (isObject(r.content) && Array.isArray((r.content as Record<string, unknown>).spans)) {
        textContent = ensureTextContent(r.content);
        layoutConfig = ensureTextLayoutConfig(r.layoutConfig);
        animOverrides = ensureTextAnimOverrides(r.animOverrides);
      } else if (isObject(r.text)) {
        const textRaw = r.text as Record<string, unknown>;
        const oldStyle = isObject(textRaw.style) ? textRaw.style as Record<string, unknown> : {};
        const spanStyle = ensureTextSpanStyle(oldStyle);
        const oldContent = typeof textRaw.content === 'string' ? textRaw.content : 'Text';
        textContent = { spans: [{ text: oldContent, style: spanStyle }] };
        const mode = textRaw.mode === 'box' ? 'box' : 'point';
        const boxW = typeof textRaw.boxWidth === 'number' ? textRaw.boxWidth : 300;
        const boxH = typeof textRaw.boxHeight === 'number' ? textRaw.boxHeight : 200;
        layoutConfig = {
          boundingBox: mode === 'box' ? { type: 'fixed', width: boxW, height: boxH } : { type: 'auto' },
          horizontalAlign: (oldStyle.textAlign === 'left' || oldStyle.textAlign === 'center' || oldStyle.textAlign === 'right') ? oldStyle.textAlign as 'left' | 'center' | 'right' : 'center',
          verticalAlign: 'top',
          overflow: 'visible',
          baselineShift: 0,
          perGlyphAnimation: false,
        };
        animOverrides = {
          fontSize: ensureAnimatableProperty(oldStyle.fontSize, 'Font Size', 'number', 48),
          letterSpacing: ensureAnimatableProperty(oldStyle.letterSpacing, 'Letter Spacing', 'number', 0),
          lineHeight: ensureAnimatableProperty(oldStyle.lineHeight, 'Line Height', 'number', 1.2),
          strokeWidth: ensureAnimatableProperty(oldStyle.strokeWidth, 'Stroke Width', 'number', 0),
        };
      } else {
        textContent = ensureTextContent(undefined);
        layoutConfig = ensureTextLayoutConfig(undefined);
        animOverrides = ensureTextAnimOverrides(undefined);
      }

      return {
        ...baseFields,
        type: 'text',
        content: textContent,
        layoutConfig,
        animOverrides,
        // M21 — preserve linked-style refs.
        ...(typeof r.fillStyleId === 'string' ? { fillStyleId: r.fillStyleId } : {}),
        ...(typeof r.strokeStyleId === 'string' ? { strokeStyleId: r.strokeStyleId } : {}),
      } as TextLayer;
    }
    case 'group': {
      return {
        ...baseFields,
        type: 'group',
        collapsed: typeof r.collapsed === 'boolean' ? r.collapsed : false,
      } as GroupLayer;
    }
    case 'video': {
      const v = isObject(r.video) ? r.video as Record<string, unknown> : {};
      if (typeof v.assetId !== 'string') return null;
      return {
        ...baseFields,
        type: 'video',
        ...(typeof r.lockAspect === 'boolean' ? { lockAspect: r.lockAspect } : {}),
        video: {
          assetId: v.assetId as string,
          sourceWidth: typeof v.sourceWidth === 'number' ? v.sourceWidth : 1920,
          sourceHeight: typeof v.sourceHeight === 'number' ? v.sourceHeight : 1080,
          sourceDuration: typeof v.sourceDuration === 'number' ? v.sourceDuration : 5,
          sourceFrameRate: typeof v.sourceFrameRate === 'number' ? v.sourceFrameRate : 30,
          startOffset: typeof v.startOffset === 'number' ? v.startOffset : 0,
          playbackRate: typeof v.playbackRate === 'number' ? v.playbackRate : 1,
          muted: typeof v.muted === 'boolean' ? v.muted : false,
          ...(typeof v.freezeSourceFrame === 'number' ? { freezeSourceFrame: v.freezeSourceFrame } : {}),
          ...(v.reversed === true ? { reversed: true } : {}),
        },
      } as VideoLayer;
    }
    case 'image': {
      const img = isObject(r.image) ? r.image as Record<string, unknown> : {};
      if (typeof img.assetId !== 'string') return null;
      return {
        ...baseFields,
        type: 'image',
        ...(typeof r.lockAspect === 'boolean' ? { lockAspect: r.lockAspect } : {}),
        image: {
          assetId: img.assetId as string,
          sourceWidth: typeof img.sourceWidth === 'number' ? img.sourceWidth : 800,
          sourceHeight: typeof img.sourceHeight === 'number' ? img.sourceHeight : 600,
          format: typeof img.format === 'string' ? img.format : 'image/png',
          fileSize: typeof img.fileSize === 'number' ? img.fileSize : 0,
        },
        filters: ensureImageFilters(r.filters),
        colorCorrection: ensureColorCorrection(r.colorCorrection),
      } as ImageLayer;
    }
    case 'audio': {
      const a = isObject(r.audio) ? r.audio as Record<string, unknown> : {};
      if (typeof a.assetId !== 'string') return null;
      return {
        ...baseFields,
        type: 'audio',
        audio: {
          assetId: a.assetId as string,
          sourceDuration: typeof a.sourceDuration === 'number' ? a.sourceDuration : 5,
          sampleRate: typeof a.sampleRate === 'number' ? a.sampleRate : 48000,
          channels: typeof a.channels === 'number' ? a.channels : 2,
          startOffset: typeof a.startOffset === 'number' ? a.startOffset : 0,
          muted: typeof a.muted === 'boolean' ? a.muted : false,
          volume: ensureAnimatableProperty(a.volume, 'Volume', 'number', 1),
          pitch: ensureAnimatableProperty(a.pitch, 'Pitch', 'number', 0),
        },
      } as AudioLayer;
    }
    case 'lottieIcon': {
      const li = isObject(r.lottieIcon) ? r.lottieIcon as Record<string, unknown> : {};
      if (typeof li.jsonData !== 'string') return null;
      return {
        ...baseFields,
        type: 'lottieIcon',
        lottieIcon: {
          jsonPath: typeof li.jsonPath === 'string' ? li.jsonPath : '',
          jsonData: li.jsonData as string,
          totalFrames: typeof li.totalFrames === 'number' ? li.totalFrames : 60,
          frameRate: typeof li.frameRate === 'number' ? li.frameRate : 30,
          sourceWidth: typeof li.sourceWidth === 'number' ? li.sourceWidth : 200,
          sourceHeight: typeof li.sourceHeight === 'number' ? li.sourceHeight : 200,
          startFrame: typeof li.startFrame === 'number' ? li.startFrame : 0,
          color: typeof li.color === 'string' ? li.color : '#ffffff',
        },
      } as LottieIconLayer;
    }
    case 'precomp': {
      if (typeof r.compositionId !== 'string') return null;
      const tr = isObject(r.timeRemap) ? r.timeRemap as Record<string, unknown> : null;
      return {
        ...baseFields,
        type: 'precomp',
        compositionId: r.compositionId,
        timeRemap: tr
          ? {
              startFrame: typeof tr.startFrame === 'number' ? tr.startFrame : 0,
              timeStretch: typeof tr.timeStretch === 'number' ? tr.timeStretch : 1,
            }
          : undefined,
      } as PrecompLayer;
    }
    case 'cloner': {
      // Cloner data (distribution union, effectors, data binding) is app-generated;
      // pass the structured fields through rather than re-validating them field-by-field.
      if (!isObject(r.sourceRef) || !isObject(r.distribution)) return null;
      return {
        ...baseFields,
        type: 'cloner',
        sourceRef: r.sourceRef,
        distribution: r.distribution,
        effectors: Array.isArray(r.effectors) ? r.effectors : [],
        stagger: isObject(r.stagger) ? r.stagger : { delaySeconds: 0 },
        renderCount: typeof r.renderCount === 'number' ? r.renderCount : 500,
        dataBinding: isObject(r.dataBinding) ? r.dataBinding : undefined,
      } as unknown as Layer;
    }
    // The following layer types carry app-generated structured payloads. Pass them
    // through (like cloner) so they SURVIVE load instead of hitting the default and
    // being silently deleted (was a data-loss bug).
    case 'particle': {
      if (!isObject(r.particle)) return null;
      return { ...baseFields, type: 'particle', particle: r.particle } as unknown as Layer;
    }
    case 'animationItem': {
      if (!isObject(r.animationItem)) return null;
      return { ...baseFields, type: 'animationItem', animationItem: r.animationItem } as unknown as Layer;
    }
    case 'generativePattern': {
      if (!isObject(r.generativePattern)) return null;
      const pa = isObject(r.patternAnim) ? r.patternAnim as Record<string, unknown> : {};
      return {
        ...baseFields,
        type: 'generativePattern',
        generativePattern: r.generativePattern,
        width: ensureAnimatableProperty(r.width, 'Width', 'number', 800),
        height: ensureAnimatableProperty(r.height, 'Height', 'number', 500),
        patternAnim: {
          scale: ensureAnimatableProperty(pa.scale, 'Pattern Scale', 'number', 1),
          rotation: ensureAnimatableProperty(pa.rotation, 'Pattern Rotation', 'number', 0),
          warp: ensureAnimatableProperty(pa.warp, 'Pattern Warp', 'number', 0.2),
          contrast: ensureAnimatableProperty(pa.contrast, 'Pattern Contrast', 'number', 0.2),
        },
      } as unknown as Layer;
    }
    case 'fieldSampled': {
      if (!isObject(r.fieldSampled)) return null;
      return { ...baseFields, type: 'fieldSampled', fieldSampled: r.fieldSampled } as unknown as Layer;
    }
    case 'camera': {
      // 2.5D camera: round-trip the lens/aim/DOF settings (else silently stripped on load).
      const c = isObject(r.camera) ? r.camera as Record<string, unknown> : {};
      return {
        ...baseFields,
        type: 'camera',
        is3D: true,
        camera: {
          mode: c.mode === 'one-node' ? 'one-node' : 'two-node',
          pointOfInterest: ensureAnimatableProperty(c.pointOfInterest, 'Point of Interest', 'vec2', [0, 0]),
          pointOfInterestZ: ensureAnimatableProperty(c.pointOfInterestZ, 'POI Z', 'number', 0),
          zoom: ensureAnimatableProperty(c.zoom, 'Zoom', 'number', 1080),
          // AE lens paperwork (static). Default to AE's 36mm/horizontal/pixels + lock-to-zoom
          // so legacy cameras that predate these fields behave like a fresh AE camera.
          filmSize: typeof c.filmSize === 'number' ? c.filmSize : 36,
          measureFilmSize: c.measureFilmSize === 'vertical' || c.measureFilmSize === 'diagonal' ? c.measureFilmSize : 'horizontal',
          units: c.units === 'inches' || c.units === 'millimeters' ? c.units : 'pixels',
          dofEnabled: typeof c.dofEnabled === 'boolean' ? c.dofEnabled : false,
          focusDistance: ensureAnimatableProperty(c.focusDistance, 'Focus Distance', 'number', 1080),
          lockToZoom: typeof c.lockToZoom === 'boolean' ? c.lockToZoom : true,
          aperture: ensureAnimatableProperty(c.aperture, 'Aperture', 'number', 25),
          blurLevel: ensureAnimatableProperty(c.blurLevel, 'Blur Level', 'number', 1),
          // Smooth spatial-bezier path tangents (optional). Keep only well-formed {frame, tangent[3]}.
          ...(Array.isArray(c.spatialTangents)
            ? { spatialTangents: (c.spatialTangents as unknown[]).filter((t): t is { frame: number; tangent: [number, number, number] } =>
                isObject(t) && typeof (t as Record<string, unknown>).frame === 'number' &&
                Array.isArray((t as Record<string, unknown>).tangent) && ((t as Record<string, unknown>).tangent as unknown[]).length === 3) }
            : {}),
        },
      } as unknown as Layer;
    }
    case 'hbox':
    case 'vbox':
    case 'grid': {
      return {
        ...baseFields,
        type: r.type,
        children: Array.isArray(r.children) ? r.children : [],
        layoutParams: r.layoutParams,
        childOverrides: isObject(r.childOverrides) ? r.childOverrides : {},
        computedLayout: isObject(r.computedLayout) ? r.computedLayout : null,
      } as unknown as Layer;
    }
    case 'layoutContainer': {
      return {
        ...baseFields,
        type: 'layoutContainer',
        containerShape: r.containerShape,
        distributionMode: r.distributionMode,
        spacing: typeof r.spacing === 'number' ? r.spacing : 0,
        padding: typeof r.padding === 'number' ? r.padding : 0,
        rotationOffset: typeof r.rotationOffset === 'number' ? r.rotationOffset : 0,
        ...(r.followPathRotation === true ? { followPathRotation: true } : {}),
        children: Array.isArray(r.children) ? r.children : [],
        computedData: isObject(r.computedData) ? r.computedData : null,
      } as unknown as Layer;
    }
    default:
      return null;
  }
}

function ensureBackgroundLayer(val: unknown): BackgroundLayer | null {
  if (!isObject(val)) return null;
  const l = val as Record<string, unknown>;
  const validTypes = ['solid', 'linear', 'radial'];
  if (!validTypes.includes(l.type as string)) return null;

  return {
    id: typeof l.id === 'string' ? l.id : crypto.randomUUID(),
    enabled: typeof l.enabled === 'boolean' ? l.enabled : true,
    opacity: typeof l.opacity === 'number' ? l.opacity : 1,
    blendMode: typeof l.blendMode === 'string' ? l.blendMode as BackgroundLayer['blendMode'] : 'normal',
    type: l.type as BackgroundLayer['type'],
    stops: Array.isArray(l.stops) && l.stops.length > 0
      ? l.stops.map((s: Record<string, unknown>) => ({
          color: Array.isArray(s.color) ? [s.color[0] ?? 0, s.color[1] ?? 0, s.color[2] ?? 0] as [number, number, number] : [0, 0, 0] as [number, number, number],
          position: typeof s.position === 'number' ? s.position : 0,
          opacity: typeof s.opacity === 'number' ? s.opacity : 1,
        }))
      : [{ color: [0.08, 0.09, 0.12] as [number, number, number], position: 0, opacity: 1 }, { color: [0.08, 0.09, 0.12] as [number, number, number], position: 1, opacity: 1 }],
    angle: typeof l.angle === 'number' ? l.angle : 0,
    centerX: typeof l.centerX === 'number' ? l.centerX : 0.5,
    centerY: typeof l.centerY === 'number' ? l.centerY : 0.5,
    radius: typeof l.radius === 'number' ? l.radius : 0.5,
  };
}

function ensureBackground(val: unknown): Background {
  if (isObject(val) && Array.isArray((val as Record<string, unknown>).layers)) {
    const rawLayers = (val as Record<string, unknown>).layers as unknown[];
    const layers = rawLayers.map(ensureBackgroundLayer).filter((l): l is BackgroundLayer => l !== null);
    if (layers.length > 0) return { layers };
  }
  return {
    layers: [{
      id: crypto.randomUUID(),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      type: 'solid',
      stops: [
        { color: [0.08, 0.09, 0.12], position: 0, opacity: 1 },
        { color: [0.08, 0.09, 0.12], position: 1, opacity: 1 },
      ],
      angle: 0,
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.5,
    }],
  };
}

function ensureSettings(val: unknown): CompositionSettings {
  const s = isObject(val) ? val as Record<string, unknown> : {};
  return {
    width: typeof s.width === 'number' ? s.width : 1920,
    height: typeof s.height === 'number' ? s.height : 1080,
    frameRate: typeof s.frameRate === 'number' ? s.frameRate : 30,
    durationFrames: typeof s.durationFrames === 'number' ? s.durationFrames : 150,
    backgroundColor: ensureVec4(s.backgroundColor, [0.08, 0.09, 0.12, 1]),
  };
}

export function validateComposition(raw: unknown): Composition {
  const r = isObject(raw) ? raw as Record<string, unknown> : {};

  const settings = ensureSettings(r.settings);
  const rawLayers = Array.isArray(r.layers) ? r.layers : [];
  const layers = rawLayers.map(validateLayer).filter((l): l is Layer => l !== null);
  const tracks = Array.isArray(r.tracks) ? (r.tracks as unknown[]).filter(isValidTrack) as Track[] : [];

  return {
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' ? r.name : 'Untitled',
    settings,
    layers,
    tracks,
    background: ensureBackground(r.background),
    motionPaths: Array.isArray(r.motionPaths) ? r.motionPaths : [],
    ...(Array.isArray(r.markers) ? { markers: (r.markers as unknown[]).filter(isValidMarker) as Composition['markers'] } : {}),
    // Composition-level bindings are app-generated structured data; preserve them
    // through the round-trip (were silently dropped on load → physics/procedural/
    // anchor/stagger setups vanished on reopen).
    ...(Array.isArray(r.proceduralBindings) ? { proceduralBindings: r.proceduralBindings as Composition['proceduralBindings'] } : {}),
    ...(Array.isArray(r.anchorEdges) ? { anchorEdges: r.anchorEdges as Composition['anchorEdges'] } : {}),
    ...(Array.isArray(r.physicsBindings) ? { physicsBindings: r.physicsBindings as Composition['physicsBindings'] } : {}),
    ...(isObject(r.physicsWorld) ? { physicsWorld: r.physicsWorld as unknown as Composition['physicsWorld'] } : {}),
    ...(Array.isArray(r.staggerBindings) ? { staggerBindings: r.staggerBindings as Composition['staggerBindings'] } : {}),
  };
}

function isValidMarker(val: unknown): boolean {
  if (!isObject(val)) return false;
  const m = val as Record<string, unknown>;
  return typeof m.id === 'string' && typeof m.frame === 'number';
}

function isValidTrack(val: unknown): boolean {
  if (!isObject(val)) return false;
  const t = val as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.order === 'number';
}
