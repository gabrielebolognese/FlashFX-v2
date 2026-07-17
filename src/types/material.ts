export type MaterialGradientType = 'linear' | 'radial';

export type MaterialLinearDirection =
  | 'top-to-bottom'
  | 'bottom-to-top'
  | 'left-to-right'
  | 'right-to-left'
  | 'diagonal-tl-br'
  | 'diagonal-tr-bl';

export type MaterialRadialType = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type MaterialBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export interface MaterialColorStop {
  id: string;
  color: string;
  opacity: number;
  position: number;
}

export type MaterialType =
  | 'matte'
  | 'glossy'
  | 'metallic'
  | 'glass'
  | 'neon'
  | 'holographic'
  | 'plastic';

export type ShadowType =
  | 'drop'
  | 'long'
  | 'soft'
  | 'hard'
  | 'inner'
  | 'ambient';

export type GlowType =
  | 'outer'
  | 'inner'
  | 'directional'
  | 'pulse'
  | 'rim';

export interface MatteMaterial {
  type: 'matte';
  color: string;
  opacity: number;
}

export interface GlossyMaterial {
  type: 'glossy';
  color: string;
  highlightStrength: number;
  highlightPositionX: number;
  highlightPositionY: number;
  glossSoftness: number;
  lightDirection: number;
}

export interface MetallicMaterial {
  type: 'metallic';
  color: string;
  reflectionColor: string;
  reflectionIntensity: number;
  highlightPositionX: number;
  highlightPositionY: number;
  glossSoftness: number;
  lightDirection: number;
}

export interface GlassMaterial {
  type: 'glass';
  color: string;
  opacity: number;
  edgeBrightness: number;
  blurStrength: number;
  refractionOffset: number;
}

export interface NeonMaterial {
  type: 'neon';
  color: string;
  coreBrightness: number;
  glowRadius: number;
  glowIntensity: number;
  flickerAmount: number;
}

export interface HolographicMaterial {
  type: 'holographic';
  baseColor: string;
  hueShiftSpeed: number;
  saturation: number;
  gradientAngle: number;
  shimmerIntensity: number;
}

export interface PlasticMaterial {
  type: 'plastic';
  color: string;
  glossStrength: number;
  softness: number;
  lightAngle: number;
}

export type Material =
  | MatteMaterial
  | GlossyMaterial
  | MetallicMaterial
  | GlassMaterial
  | NeonMaterial
  | HolographicMaterial
  | PlasticMaterial;

export interface DropShadow {
  type: 'drop';
  color: string;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface LongShadow {
  type: 'long';
  angle: number;
  length: number;
  color: string;
  opacityDecay: number;
}

export interface SoftShadow {
  type: 'soft';
  blurRadius: number;
  spread: number;
  softness: number;
  color: string;
  opacity: number;
}

export interface HardShadow {
  type: 'hard';
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
}

export interface InnerShadow {
  type: 'inner';
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  intensity: number;
}

export interface AmbientShadow {
  type: 'ambient';
  opacity: number;
  spread: number;
  color: string;
}

export type ShadowEffect =
  | DropShadow
  | LongShadow
  | SoftShadow
  | HardShadow
  | InnerShadow
  | AmbientShadow;

export interface OuterGlow {
  type: 'outer';
  color: string;
  radius: number;
  intensity: number;
  falloff: number;
}

export interface InnerGlow {
  type: 'inner';
  color: string;
  thickness: number;
  intensity: number;
}

export interface DirectionalGlow {
  type: 'directional';
  color: string;
  directionAngle: number;
  strength: number;
  spread: number;
}

export interface PulseGlow {
  type: 'pulse';
  color: string;
  minRadius: number;
  maxRadius: number;
  speed: number;
}

export interface RimLight {
  type: 'rim';
  color: string;
  thickness: number;
  brightness: number;
  angle: number;
}

export type GlowEffect =
  | OuterGlow
  | InnerGlow
  | DirectionalGlow
  | PulseGlow
  | RimLight;

export interface MaterialFillLayer {
  id: string;
  type: MaterialGradientType;
  colorStops: MaterialColorStop[];
  direction?: MaterialLinearDirection;
  radialType?: MaterialRadialType;
  angle?: number;
  blendMode: MaterialBlendMode;
  opacity: number;
}

export interface ShapeMaterialConfig {
  enabled: boolean;
  layers: MaterialFillLayer[];
}

export interface MaterialLayer {
  id: string;
  material: Material;
  shadows: ShadowEffect[];
  glows: GlowEffect[];
  enabled: boolean;
}

export function createDefaultMaterial(type: MaterialType): Material {
  switch (type) {
    case 'matte':
      return {
        type: 'matte',
        color: '#ffffff',
        opacity: 1,
      };
    case 'glossy':
      return {
        type: 'glossy',
        color: '#ffffff',
        highlightStrength: 0.5,
        highlightPositionX: 0.3,
        highlightPositionY: 0.3,
        glossSoftness: 0.7,
        lightDirection: 45,
      };
    case 'metallic':
      return {
        type: 'metallic',
        color: '#c0c0c0',
        reflectionColor: '#ffffff',
        reflectionIntensity: 0.8,
        highlightPositionX: 0.3,
        highlightPositionY: 0.3,
        glossSoftness: 0.7,
        lightDirection: 45,
      };
    case 'glass':
      return {
        type: 'glass',
        color: '#ffffff',
        opacity: 0.3,
        edgeBrightness: 0.8,
        blurStrength: 5,
        refractionOffset: 2,
      };
    case 'neon':
      return {
        type: 'neon',
        color: '#00ffff',
        coreBrightness: 1,
        glowRadius: 20,
        glowIntensity: 0.8,
        flickerAmount: 0,
      };
    case 'holographic':
      return {
        type: 'holographic',
        baseColor: '#ffffff',
        hueShiftSpeed: 1,
        saturation: 0.8,
        gradientAngle: 45,
        shimmerIntensity: 0.5,
      };
    case 'plastic':
      return {
        type: 'plastic',
        color: '#ffffff',
        glossStrength: 0.3,
        softness: 0.8,
        lightAngle: 45,
      };
  }
}

export function createMaterialLayer(type: MaterialType): MaterialLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    material: createDefaultMaterial(type),
    shadows: [],
    glows: [],
    enabled: true,
  };
}

// New Material Fill Layer Functions
export const createDefaultMaterialColorStop = (color: string = '#3B82F6', position: number = 0): MaterialColorStop => ({
  id: `color-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  color,
  opacity: 100,
  position
});

export const createDefaultMaterialFillLayer = (): MaterialFillLayer => ({
  id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  type: 'linear',
  colorStops: [
    createDefaultMaterialColorStop('#3B82F6', 0),
    createDefaultMaterialColorStop('#8B5CF6', 100)
  ],
  direction: 'top-to-bottom',
  angle: 180,
  blendMode: 'normal',
  opacity: 100
});

export const createDefaultShapeMaterial = (): ShapeMaterialConfig => ({
  enabled: false,
  layers: []
});

export const createSolidColorMaterialConfig = (color: string): ShapeMaterialConfig => ({
  enabled: true,
  layers: [{
    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'linear',
    colorStops: [createDefaultMaterialColorStop(color, 0)],
    direction: 'top-to-bottom',
    angle: 180,
    blendMode: 'normal',
    opacity: 100
  }]
});

export const getMaterialGradientCSS = (layer: MaterialFillLayer): string => {
  const stops = layer.colorStops
    .sort((a, b) => a.position - b.position)
    .map(stop => {
      const rgba = hexToRgbaMaterial(stop.color, stop.opacity / 100);
      return `${rgba} ${stop.position}%`;
    })
    .join(', ');

  if (layer.type === 'linear') {
    const angle = getMaterialLinearAngle(layer.direction || 'top-to-bottom');
    return `linear-gradient(${angle}deg, ${stops})`;
  } else {
    const position = getMaterialRadialPosition(layer.radialType || 'center');
    return `radial-gradient(circle at ${position}, ${stops})`;
  }
};

export const getMaterialLinearAngle = (direction: MaterialLinearDirection): number => {
  switch (direction) {
    case 'top-to-bottom': return 180;
    case 'bottom-to-top': return 0;
    case 'left-to-right': return 90;
    case 'right-to-left': return 270;
    case 'diagonal-tl-br': return 135;
    case 'diagonal-tr-bl': return 225;
    default: return 180;
  }
};

export const getMaterialRadialPosition = (radialType: MaterialRadialType): string => {
  switch (radialType) {
    case 'center': return '50% 50%';
    case 'top-left': return '0% 0%';
    case 'top-right': return '100% 0%';
    case 'bottom-left': return '0% 100%';
    case 'bottom-right': return '100% 100%';
    default: return '50% 50%';
  }
};

export const hexToRgbaMaterial = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const generateShapeMaterialStyle = (config: ShapeMaterialConfig): React.CSSProperties => {
  if (!config.enabled || config.layers.length === 0) {
    return {};
  }

  if (config.layers.length === 1 && config.layers[0].colorStops.length === 1) {
    const stop = config.layers[0].colorStops[0];
    return {
      backgroundColor: hexToRgbaMaterial(stop.color, stop.opacity / 100)
    };
  }

  const gradients = config.layers.map(layer => getMaterialGradientCSS(layer));

  return {
    backgroundImage: gradients.join(', '),
    backgroundBlendMode: config.layers.map(l => l.blendMode).join(', ') as any
  };
};
