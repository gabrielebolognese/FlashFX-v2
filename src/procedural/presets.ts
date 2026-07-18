import type { ProceduralBinding } from './types';

let presetIdCounter = 0;
function nextId(): string {
  return `proc_${Date.now()}_${presetIdCounter++}`;
}

export interface ProceduralPreset {
  name: string;
  category: 'transform' | 'grid' | 'tile';
  description: string;
  create: (layerId: string, durationFrames: number) => ProceduralBinding;
}

function makeBinding(
  layerId: string,
  durationFrames: number,
  loopType: ProceduralBinding['loopType'],
  overrides: Partial<ProceduralBinding>,
): ProceduralBinding {
  return {
    id: nextId(),
    layerId,
    enabled: true,
    loopType,
    loopDurationFrames: durationFrames,
    speedMultiplier: 1,
    pingPong: false,
    ...overrides,
  };
}

export const PROCEDURAL_PRESETS: ProceduralPreset[] = [
  {
    name: 'Radial Spin',
    category: 'transform',
    description: 'Continuous rotation, perfect for sunburst patterns',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'rotation', cycles: 1, amplitude: 360, offset: 0, easing: 'linear', direction: 1 },
      ],
    }),
  },
  {
    name: 'Pulse',
    category: 'transform',
    description: 'Smooth scale breathing animation',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'scale', cycles: 1, amplitude: 0.2, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Bounce',
    category: 'transform',
    description: 'Vertical bouncing motion',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'positionY', cycles: 1, amplitude: -30, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Orbit',
    category: 'transform',
    description: 'Circular orbit path around center',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'positionX', cycles: 1, amplitude: 50, offset: 0, easing: 'sine', direction: 1 },
        { property: 'positionY', cycles: 1, amplitude: 50, offset: 0, easing: 'cosine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Wobble',
    category: 'transform',
    description: 'Rotational wobble with scale',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'rotation', cycles: 2, amplitude: 15, offset: 0, easing: 'sine', direction: 1 },
        { property: 'scale', cycles: 2, amplitude: 0.05, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Float',
    category: 'transform',
    description: 'Gentle floating motion with slight rotation',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'positionY', cycles: 1, amplitude: -15, offset: 0, easing: 'sine', direction: 1 },
        { property: 'rotation', cycles: 1, amplitude: 3, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Fade Pulse',
    category: 'transform',
    description: 'Opacity pulsing',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'opacity', cycles: 1, amplitude: -0.4, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Spin & Scale',
    category: 'transform',
    description: 'Combined rotation with scale burst',
    create: (layerId, dur) => makeBinding(layerId, dur, 'transform', {
      transformParams: [
        { property: 'rotation', cycles: 1, amplitude: 360, offset: 0, easing: 'linear', direction: 1 },
        { property: 'scale', cycles: 2, amplitude: 0.3, offset: 0, easing: 'sine', direction: 1 },
      ],
    }),
  },
  {
    name: 'Diagonal Cascade',
    category: 'grid',
    description: 'Grid with diagonal wave animation',
    create: (layerId, dur) => makeBinding(layerId, dur, 'gridArray', {
      gridParams: {
        rows: 4,
        cols: 4,
        cellWidth: 80,
        cellHeight: 80,
        spacingX: 10,
        spacingY: 10,
        phaseOffsetMode: 'diagonal',
        phaseSpread: 0.6,
        baseTransforms: [
          { property: 'scale', cycles: 1, amplitude: 0.3, offset: 0, easing: 'sine', direction: 1 },
          { property: 'opacity', cycles: 1, amplitude: -0.3, offset: 0, easing: 'cosine', direction: 1 },
        ],
      },
    }),
  },
  {
    name: 'Radial Pop',
    category: 'grid',
    description: 'Grid with radial expanding wave',
    create: (layerId, dur) => makeBinding(layerId, dur, 'gridArray', {
      gridParams: {
        rows: 5,
        cols: 5,
        cellWidth: 60,
        cellHeight: 60,
        spacingX: 8,
        spacingY: 8,
        phaseOffsetMode: 'radial',
        phaseSpread: 0.5,
        baseTransforms: [
          { property: 'scale', cycles: 1, amplitude: 0.5, offset: 0, easing: 'sine', direction: 1 },
          { property: 'positionY', cycles: 1, amplitude: -10, offset: 0, easing: 'sine', direction: 1 },
        ],
      },
    }),
  },
  {
    name: 'Horizontal Wave',
    category: 'grid',
    description: 'Grid with horizontal sweep animation',
    create: (layerId, dur) => makeBinding(layerId, dur, 'gridArray', {
      gridParams: {
        rows: 3,
        cols: 6,
        cellWidth: 70,
        cellHeight: 70,
        spacingX: 12,
        spacingY: 12,
        phaseOffsetMode: 'horizontal',
        phaseSpread: 0.7,
        baseTransforms: [
          { property: 'positionY', cycles: 1, amplitude: -20, offset: 0, easing: 'sine', direction: 1 },
          { property: 'rotation', cycles: 1, amplitude: 10, offset: 0, easing: 'sine', direction: 1 },
        ],
      },
    }),
  },
  {
    name: 'Random Twinkle',
    category: 'grid',
    description: 'Grid with random phase stagger',
    create: (layerId, dur) => makeBinding(layerId, dur, 'gridArray', {
      gridParams: {
        rows: 4,
        cols: 4,
        cellWidth: 50,
        cellHeight: 50,
        spacingX: 15,
        spacingY: 15,
        phaseOffsetMode: 'random',
        phaseSpread: 0.9,
        baseTransforms: [
          { property: 'scale', cycles: 1, amplitude: 0.4, offset: 0, easing: 'sine', direction: 1 },
          { property: 'opacity', cycles: 1, amplitude: -0.5, offset: 0, easing: 'sine', direction: 1 },
        ],
      },
    }),
  },
  {
    name: 'Scroll Right',
    category: 'tile',
    description: 'Seamless horizontal scroll',
    create: (layerId, dur) => makeBinding(layerId, dur, 'tileScroll', {
      tileParams: { scrollX: 1, scrollY: 0, tileWidth: 200, tileHeight: 200 },
    }),
  },
  {
    name: 'Scroll Diagonal',
    category: 'tile',
    description: 'Seamless diagonal scroll',
    create: (layerId, dur) => makeBinding(layerId, dur, 'tileScroll', {
      tileParams: { scrollX: 1, scrollY: 1, tileWidth: 200, tileHeight: 200 },
    }),
  },
  {
    name: 'Scroll Down',
    category: 'tile',
    description: 'Seamless vertical scroll',
    create: (layerId, dur) => makeBinding(layerId, dur, 'tileScroll', {
      tileParams: { scrollX: 0, scrollY: 1, tileWidth: 200, tileHeight: 200 },
    }),
  },
];

export const PRESET_NAMES = PROCEDURAL_PRESETS.map((p) => p.name);
