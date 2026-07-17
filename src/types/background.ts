export type GradientType = 'linear' | 'radial';

export type LinearDirection =
  | 'top-to-bottom'
  | 'bottom-to-top'
  | 'left-to-right'
  | 'right-to-left'
  | 'diagonal-tl-br'
  | 'diagonal-tr-bl';

export type RadialType = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type BlendMode =
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

export interface ColorStop {
  id: string;
  color: string;
  opacity: number;
  position: number;
}

export interface GradientLayer {
  id: string;
  type: GradientType;
  colorStops: ColorStop[];
  direction?: LinearDirection;
  radialType?: RadialType;
  angle?: number;
  blendMode: BlendMode;
  opacity: number;
}

export interface BackgroundConfig {
  enabled: boolean;
  layers: GradientLayer[];
}

export const createDefaultColorStop = (color: string = '#3B82F6', position: number = 0): ColorStop => ({
  id: `color-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  color,
  opacity: 100,
  position
});

export const createDefaultGradientLayer = (): GradientLayer => ({
  id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  type: 'linear',
  colorStops: [
    createDefaultColorStop('#3B82F6', 0),
    createDefaultColorStop('#8B5CF6', 100)
  ],
  direction: 'top-to-bottom',
  angle: 180,
  blendMode: 'normal',
  opacity: 100
});

export const createDefaultBackground = (): BackgroundConfig => ({
  enabled: false,
  layers: []
});

export const getGradientCSS = (layer: GradientLayer): string => {
  const stops = layer.colorStops
    .sort((a, b) => a.position - b.position)
    .map(stop => {
      const rgba = hexToRgba(stop.color, stop.opacity / 100);
      return `${rgba} ${stop.position}%`;
    })
    .join(', ');

  if (layer.type === 'linear') {
    const angle = getLinearAngle(layer.direction || 'top-to-bottom');
    return `linear-gradient(${angle}deg, ${stops})`;
  } else {
    const position = getRadialPosition(layer.radialType || 'center');
    return `radial-gradient(circle at ${position}, ${stops})`;
  }
};

export const getLinearAngle = (direction: LinearDirection): number => {
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

export const getRadialPosition = (radialType: RadialType): string => {
  switch (radialType) {
    case 'center': return '50% 50%';
    case 'top-left': return '0% 0%';
    case 'top-right': return '100% 0%';
    case 'bottom-left': return '0% 100%';
    case 'bottom-right': return '100% 100%';
    default: return '50% 50%';
  }
};

export const hexToRgba = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const generateBackgroundStyle = (config: BackgroundConfig): React.CSSProperties => {
  if (!config.enabled || config.layers.length === 0) {
    return { backgroundColor: 'transparent' };
  }

  if (config.layers.length === 1 && config.layers[0].colorStops.length === 1) {
    const stop = config.layers[0].colorStops[0];
    return {
      backgroundColor: hexToRgba(stop.color, stop.opacity / 100)
    };
  }

  const gradients = config.layers.map(layer => getGradientCSS(layer));

  return {
    backgroundImage: gradients.join(', '),
    backgroundBlendMode: config.layers.map(l => l.blendMode).join(', ') as any
  };
};
