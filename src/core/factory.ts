import type {
  AnimatableProperty,
  Keyframe,
  Vec2,
  Vec4,
  Transform,
  ShapeLayer,
  TextLayer,
  GroupLayer,
  VideoLayer,
  ImageLayer,
  AudioLayer,
  ParticleLayer,
  AnimationItemLayer,
  FieldSampledLayer,
  LottieIconLayer,
  LayoutObjectLayer,
  LayoutContainerLayer,
  LayoutParams,
  VideoPlaybackMode,
  ImageFilters,
  ImageColorCorrection,
  Composition,
  CompositionSettings,
  TextContent,
  TextLayoutConfig,
  TextAnimatableOverrides,
  Background,
  BackgroundLayer,
  RectangleShape,
  CircleShape,
  StarShape,
  PolygonShape,
  PathVertex,
  Mask,
  MaskType,
  ContainerShapeType,
} from './types';

let idCounter = 0;
export function uid(): string {
  return `${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function createProperty(
  name: string,
  valueType: 'number' | 'vec2',
  defaultValue: number | Vec2
): AnimatableProperty {
  return {
    id: uid(),
    name,
    valueType,
    defaultValue,
    keyframes: [],
  };
}

export function createKeyframe(
  frame: number,
  value: number | Vec2,
  interpolation: Keyframe['interpolation'] = 'linear'
): Keyframe {
  return {
    frame,
    value,
    interpolation,
    handleIn: [0, 0],
    handleOut: [0, 0],
  };
}

export function createTransform(
  x = 0,
  y = 0,
  scaleX = 1,
  scaleY = 1
): Transform {
  return {
    position: createProperty('Position', 'vec2', [x, y]),
    rotation: createProperty('Rotation', 'number', 0),
    scale: createProperty('Scale', 'vec2', [scaleX, scaleY]),
    anchorPoint: createProperty('Anchor Point', 'vec2', [0, 0]),
    opacity: createProperty('Opacity', 'number', 1),
  };
}

export function createRectangleLayer(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Vec4,
  durationFrames: number
): ShapeLayer {
  const shape: RectangleShape = {
    type: 'rectangle',
    width: createProperty('Width', 'number', width),
    height: createProperty('Height', 'number', height),
    fillColor: color,
    strokeColor: [0, 0, 0, 0],
    strokeWidth: createProperty('Stroke Width', 'number', 0),
    borderRadius: createProperty('Border Radius', 'number', 0),
  };
  return {
    id: uid(),
    type: 'shape',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    shape,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createCircleLayer(
  name: string,
  x: number,
  y: number,
  radius: number,
  color: Vec4,
  durationFrames: number
): ShapeLayer {
  const shape: CircleShape = {
    type: 'circle',
    radius: createProperty('Radius', 'number', radius),
    fillColor: color,
    strokeColor: [0, 0, 0, 0],
    strokeWidth: createProperty('Stroke Width', 'number', 0),
  };
  return {
    id: uid(),
    type: 'shape',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    shape,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createStarLayer(
  name: string,
  x: number,
  y: number,
  points: number,
  outerRadius: number,
  innerRadius: number,
  color: Vec4,
  durationFrames: number
): ShapeLayer {
  const shape: StarShape = {
    type: 'star',
    points: createProperty('Points', 'number', points),
    outerRadius: createProperty('Outer Radius', 'number', outerRadius),
    innerRadius: createProperty('Inner Radius', 'number', innerRadius),
    fillColor: color,
    strokeColor: [0, 0, 0, 0],
    strokeWidth: createProperty('Stroke Width', 'number', 0),
  };
  return {
    id: uid(),
    type: 'shape',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    shape,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createPolygonLayer(
  name: string,
  x: number,
  y: number,
  vertices: PathVertex[],
  closed: boolean,
  color: Vec4,
  durationFrames: number
): ShapeLayer {
  const shape: PolygonShape = {
    type: 'polygon',
    vertices,
    closed,
    fillColor: color,
    strokeColor: [1, 1, 1, 1],
    strokeWidth: createProperty('Stroke Width', 'number', 2),
  };
  return {
    id: uid(),
    type: 'shape',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    shape,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createDefaultPolygonVertices(): PathVertex[] {
  return [
    { position: [-60, -60], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
    { position: [60, -60], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
    { position: [60, 60], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
    { position: [-60, 60], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' },
  ];
}

export function createVideoLayer(
  name: string,
  x: number,
  y: number,
  assetId: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceDuration: number,
  sourceFrameRate: number,
  durationFrames: number,
  playbackMode: VideoPlaybackMode = 'wait',
  proxyScale: number = 0.25
): VideoLayer {
  return {
    id: uid(),
    type: 'video',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    video: {
      assetId,
      sourceWidth,
      sourceHeight,
      sourceDuration,
      sourceFrameRate,
      startOffset: 0,
      playbackRate: 1,
      muted: false,
      playbackMode,
      proxyScale,
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createDefaultImageFilters(): ImageFilters {
  return {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    gamma: 1,
  };
}

export function createDefaultColorCorrection(): ImageColorCorrection {
  return {
    lift: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
    gamma: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
    gain: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
    offset: { r: 0, g: 0, b: 0, intensity: 0, luminance: 0 },
    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    contrast: 0,
    pivot: 0.5,
  };
}

export function createImageLayer(
  name: string,
  x: number,
  y: number,
  assetId: string,
  sourceWidth: number,
  sourceHeight: number,
  format: string,
  fileSize: number,
  durationFrames: number
): ImageLayer {
  return {
    id: uid(),
    type: 'image',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    image: {
      assetId,
      sourceWidth,
      sourceHeight,
      format,
      fileSize,
    },
    filters: createDefaultImageFilters(),
    colorCorrection: createDefaultColorCorrection(),
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createAudioLayer(
  name: string,
  assetId: string,
  sourceDuration: number,
  sampleRate: number,
  channels: number,
  durationFrames: number
): AudioLayer {
  return {
    id: uid(),
    type: 'audio',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(0, 0),
    audio: {
      assetId,
      sourceDuration,
      sampleRate,
      channels,
      startOffset: 0,
      muted: false,
      volume: createProperty('Volume', 1),
      pitch: createProperty('Pitch', 0),
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createGroupLayer(
  name: string,
  x: number,
  y: number,
  durationFrames: number
): GroupLayer {
  return {
    id: uid(),
    type: 'group',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    collapsed: false,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createDefaultTextContent(text = 'Text'): TextContent {
  return {
    spans: [{
      text,
      style: {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontStyle: 'normal',
        fontSize: 48,
        color: [1, 1, 1, 1],
        letterSpacing: 0,
        lineHeight: 1.2,
        strokeColor: [0, 0, 0, 0],
        strokeWidth: 0,
        underline: false,
        strikethrough: false,
        textTransform: 'none',
      },
    }],
  };
}

export function createDefaultTextLayoutConfig(): TextLayoutConfig {
  return {
    boundingBox: { type: 'auto' },
    horizontalAlign: 'center',
    verticalAlign: 'top',
    overflow: 'visible',
    baselineShift: 0,
    perGlyphAnimation: false,
  };
}

export function createTextAnimOverrides(): TextAnimatableOverrides {
  return {
    fontSize: createProperty('Font Size', 'number', 48),
    letterSpacing: createProperty('Letter Spacing', 'number', 0),
    lineHeight: createProperty('Line Height', 'number', 1.2),
    strokeWidth: createProperty('Stroke Width', 'number', 0),
  };
}

export function createTextLayer(
  name: string,
  x: number,
  y: number,
  content: string,
  durationFrames: number,
  color: Vec4 = [1, 1, 1, 1]
): TextLayer {
  const textContent = createDefaultTextContent(content);
  textContent.spans[0].style.color = color;
  return {
    id: uid(),
    type: 'text',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    content: textContent,
    layoutConfig: createDefaultTextLayoutConfig(),
    animOverrides: createTextAnimOverrides(),
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createBackgroundLayer(): BackgroundLayer {
  let bgColor: [number, number, number] = [0.08, 0.09, 0.12];
  try {
    const stored = localStorage.getItem('ffx-default-bg-color');
    if (stored) bgColor = JSON.parse(stored);
  } catch { /* use default */ }
  return {
    id: uid(),
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    type: 'solid',
    stops: [
      { color: bgColor, position: 0, opacity: 1 },
      { color: bgColor, position: 1, opacity: 1 },
    ],
    angle: 0,
    centerX: 0.5,
    centerY: 0.5,
    radius: 0.5,
  };
}

export function createDefaultBackground(): Background {
  return {
    layers: [createBackgroundLayer()],
  };
}

export function createMask(
  type: MaskType,
  centerX: number,
  centerY: number,
  width: number,
  height: number
): Mask {
  return {
    id: uid(),
    name: 'Mask',
    type,
    enabled: true,
    inverted: false,
    position: createProperty('Mask Position', 'vec2', [centerX, centerY]),
    size: createProperty('Mask Size', 'vec2', [Math.max(1, width), Math.max(1, height)]),
    rotation: createProperty('Mask Rotation', 'number', 0),
    feather: createProperty('Mask Feather', 'number', 0),
    opacity: createProperty('Mask Opacity', 'number', 1),
    points: type === 'star' ? 5 : 6,
    innerRadius: createProperty('Inner Radius', 'number', Math.max(1, Math.min(width, height) * 0.2)),
  };
}

export function createComposition(
  name: string,
  settings: CompositionSettings
): Composition {
  return {
    id: uid(),
    name,
    settings,
    layers: [],
    tracks: [],
    background: createDefaultBackground(),
    motionPaths: [],
    anchorEdges: [],
    physicsBindings: [],
  };
}

export function createParticleLayer(
  name: string,
  x: number,
  y: number,
  preset: string,
  emitterConfigJSON: string,
  durationFrames: number
): ParticleLayer {
  return {
    id: uid(),
    type: 'particle',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    particle: {
      preset,
      seed: Math.floor(Math.random() * 100000),
      emitterConfig: emitterConfigJSON,
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createAnimationItemLayer(
  name: string,
  x: number,
  y: number,
  itemType: string,
  configJSON: string,
  dataSourceJSON: string,
  durationFrames: number,
): AnimationItemLayer {
  return {
    id: uid(),
    type: 'animationItem',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    animationItem: {
      itemType,
      configJSON,
      dataSourceJSON,
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createFieldSampledLayer(
  name: string,
  x: number,
  y: number,
  configJSON: string,
  durationFrames: number,
): FieldSampledLayer {
  return {
    id: uid(),
    type: 'fieldSampled',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    fieldSampled: {
      configJSON,
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createLottieIconLayer(
  name: string,
  x: number,
  y: number,
  jsonPath: string,
  jsonData: string,
  totalFrames: number,
  frameRate: number,
  sourceWidth: number,
  sourceHeight: number,
  durationFrames: number,
): LottieIconLayer {
  return {
    id: uid(),
    type: 'lottieIcon',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    lottieIcon: {
      jsonPath,
      jsonData,
      totalFrames,
      frameRate,
      sourceWidth,
      sourceHeight,
      startFrame: 0,
      color: '#ffffff',
    },
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createDefaultLayoutParams(): LayoutParams {
  return {
    width: { type: 'wrapContent' },
    height: { type: 'wrapContent' },
    spacing: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    mainAxisAlignment: 'start',
    crossAxisAlignment: 'start',
    overflowBehavior: 'visible',
    background: null,
    borderRadius: 0,
    borderColor: null,
    borderWidth: 0,
    opacity: 1,
  };
}

export function createLayoutObjectLayer(
  name: string,
  layoutType: 'hbox' | 'vbox' | 'grid',
  x: number,
  y: number,
  durationFrames: number,
): LayoutObjectLayer {
  const params = createDefaultLayoutParams();
  if (layoutType === 'grid') {
    params.gridColumns = 3;
    params.gridHGap = 20;
    params.gridVGap = 20;
    params.gridHAlign = 'start';
    params.gridVAlign = 'start';
  }
  return {
    id: uid(),
    type: layoutType,
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    children: [],
    layoutParams: params,
    childOverrides: {},
    computedLayout: null,
    inPoint: 0,
    outPoint: durationFrames,
  };
}

export function createDefaultChildOverride() {
  return {
    grow: 0,
    shrink: 1,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    layoutVisibility: 'visible' as const,
  };
}

export function createLayoutContainerLayer(
  name: string,
  shapeType: ContainerShapeType,
  x: number,
  y: number,
  durationFrames: number,
): LayoutContainerLayer {
  return {
    id: uid(),
    type: 'layoutContainer',
    name,
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(x, y),
    containerShape: {
      type: shapeType,
      width: 300,
      height: 300,
      radius: 150,
      vertices: [],
      closed: true,
    },
    distributionMode: 'evenDistribution',
    spacing: 0,
    padding: 0,
    rotationOffset: 0,
    children: [],
    computedData: null,
    inPoint: 0,
    outPoint: durationFrames,
  };
}
