// PERMANENT fixtures. These are the renderer regression suite, the seed for the Coder's golden
// examples, and what the preset curves get tuned against — written to be read many times. Hand-
// authored plan (ms) + fragments (frames), covering: shape (rect/circle), text, group + parenting,
// the cloner/effector path, multi-panel structure with boundary contracts + a transition, and every
// preset category (entrance fadeIn/slideIn/popIn, emphasis emphasisPulse, staggered group reveal).
//
// Deliberately NOT covered visually: image/video/audio (need registered assets) and camera (needs
// 3D layers to matter) — both are supported by the compiler but excluded here so the visual check
// renders with no external dependencies.

// Loose typing on purpose: compile() parses these through the Zod schema, which is the real check.
type Fixture = { director: unknown; fragments: unknown[] };

// ── showreel: the main visual fixture (two panels @ beat 250ms) ──
const showreel: Fixture = {
  director: {
    brief: { durationMs: 4000, format: 'landscape', tone: 'bold', subjects: [{ id: 's1', name: 'wordmark' }] },
    styleContract: {
      palette: [
        { role: 'background', color: '#0b1220' },
        { role: 'primary', color: '#f7b500' },
        { role: 'textPrimary', color: '#ffffff' },
        { role: 'accent', color: '#22d3ee' },
      ],
      easings: ['easeOut', 'easeInOut', 'linear', 'easeIn'],
      beatMs: 250,
      shapeLanguage: 'geometric',
      staggerDoctrine: { mode: 'perLayer', gapMs: 60 },
    },
    panelPlan: [
      { id: 'panel-0', order: 0, startMs: 0, endMs: 2000, elements: [], inboundPresent: [], outboundPresent: [] },
      { id: 'panel-1', order: 1, startMs: 2000, endMs: 4000, transitionIn: { type: 'crossDissolve', duration: 250 }, elements: [], inboundPresent: [], outboundPresent: [] },
    ],
  },
  fragments: [
    {
      panelId: 'panel-0',
      layers: [
        { id: 'p0:card', name: 'hero-card', type: 'shape',
          shape: { type: 'rectangle', width: 900, height: 460, borderRadius: 28 }, fill: { role: 'primary' },
          transform: { position: [960, 540] },
          presets: [{ preset: 'popIn', start: 0, duration: 18, params: { overshoot: 1.12 } }] },
        { id: 'p0:title', name: 'wordmark', type: 'text',
          spans: [{ text: 'FlashFX', fontSize: 120, fontWeight: 800, color: { role: 'background' } }],
          align: 'center', transform: { position: [960, 500] },
          presets: [{ preset: 'slideIn', start: 6, duration: 18, params: { direction: 'up', distance: 120 } }] },
        { id: 'p0:sub', name: 'subtitle', type: 'text',
          spans: [{ text: 'generated, fully editable', fontSize: 44, color: { role: 'background' } }],
          align: 'center', transform: { position: [960, 620] },
          presets: [
            { preset: 'fadeIn', start: 20, duration: 12 },
            { preset: 'emphasisPulse', start: 40, duration: 20, params: { peak: 1.08, cycles: 1 } },
          ] },
      ],
    },
    {
      panelId: 'panel-1',
      layers: [
        // Cloner: a source circle repeated into a row of 7 (the source itself is hidden C4D-style).
        { id: 'p1:src', name: 'dot-source', type: 'shape',
          shape: { type: 'circle', radius: 22 }, fill: { role: 'accent' }, transform: { position: [0, 0] } },
        { id: 'p1:grid', name: 'dot-row', type: 'cloner',
          sourceRef: { type: 'layer', layerId: 'p1:src' },
          distribution: { type: 'grid', countX: 7, countY: 1, countZ: 1, spacing: { x: 90, y: 0, z: 0 }, origin: { x: -270, y: 0, z: 0 }, rowOffset: 0 },
          effectors: [], stagger: { delaySeconds: 0 }, renderCount: 7,
          transform: { position: [960, 320] } },
        // Group + parenting + staggered reveal of three chips. The group carries NO transform — AI
        // groups are identity, so children author WORLD coordinates and stepFrames is left to the
        // staggerDoctrine.gapMs (60ms → 2 frames @ 30fps).
        { id: 'p1:row', name: 'chip-row', type: 'group',
          presets: [{ preset: 'staggerReveal', start: 0, duration: 12, params: { childPreset: 'popIn', order: 'forward' } }] },
        { id: 'p1:chip1', name: 'chip-1', type: 'shape', parentId: 'p1:row',
          shape: { type: 'rectangle', width: 160, height: 90, borderRadius: 16 }, fill: { role: 'primary' }, transform: { position: [760, 640] } },
        { id: 'p1:chip2', name: 'chip-2', type: 'shape', parentId: 'p1:row',
          shape: { type: 'rectangle', width: 160, height: 90, borderRadius: 16 }, fill: { role: 'accent' }, transform: { position: [960, 640] } },
        { id: 'p1:chip3', name: 'chip-3', type: 'shape', parentId: 'p1:row',
          shape: { type: 'rectangle', width: 160, height: 90, borderRadius: 16 }, fill: { role: 'textPrimary' }, transform: { position: [1160, 640] } },
      ],
    },
  ],
};

// ── boundaryMismatch: a NEGATIVE fixture — panel 0 says 'ghost' is on screen at the seam, panel 1
//    disagrees. Assembly must REPORT this (not paper over it). ──
const boundaryMismatch: Fixture = {
  director: {
    brief: { durationMs: 2000, format: 'landscape', tone: 'calm', subjects: [{ id: 's1', name: 'x' }] },
    styleContract: {
      palette: [{ role: 'primary', color: '#f7b500' }],
      easings: ['linear', 'easeOut', 'easeIn'], beatMs: 250, shapeLanguage: 'geometric', staggerDoctrine: { mode: 'none', gapMs: 0 },
    },
    panelPlan: [
      { id: 'panel-0', order: 0, startMs: 0, endMs: 1000, elements: [], inboundPresent: [], outboundPresent: ['ghost'] },
      { id: 'panel-1', order: 1, startMs: 1000, endMs: 2000, elements: [], inboundPresent: [], outboundPresent: [] },
    ],
  },
  fragments: [
    { panelId: 'panel-0', layers: [{ id: 'p0:a', name: 'a', type: 'shape', shape: { type: 'circle', radius: 40 }, fill: { role: 'primary' } }] },
    { panelId: 'panel-1', layers: [{ id: 'p1:b', name: 'b', type: 'shape', shape: { type: 'circle', radius: 40 }, fill: { role: 'primary' } }] },
  ],
};

export const FIXTURES: Record<string, Fixture> = { showreel, boundaryMismatch };
