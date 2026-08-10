# Motion presets

`MOTION_PRESET_NAMES` (`src/schema/enums.ts`) — the closed set of motion presets the Coder may
attach at layer level. Params are **closed per preset name** (`src/schema/presetParams.ts`): an
unknown parameter is a parse error, not something the expander tolerates. The expander that turns an
attachment into real keyframe tracks lives in `src/ai/presetCatalog.ts`, keyed by the same names, and
maps onto the existing engine generator `generatePresetKeyframes` (curves are not re-authored).

```
MOTION_PRESET_NAMES = [
  'fadeIn', 'slideIn', 'popIn',        // entrances
  'fadeOut', 'slideOut', 'scaleOut',   // exits
  'emphasisPulse',                      // emphasis
  'staggerReveal',                      // staggered group reveal
]
```

## Attachment shape (common to every preset)

Each entry in a layer's `presets: [...]` array is:

| field | type | notes |
|---|---|---|
| `preset` | one of `MOTION_PRESET_NAMES` | discriminator |
| `start` | `zFrame` (int ≥ 0) | absolute composition frame the preset begins |
| `duration` | `zFrameDuration` (int ≥ 1) | length in frames |
| `easing` | named easing (optional) | overrides the preset's own segment easing |
| `params` | closed per-preset object (below) | defaults to `{}`; all fields defaulted |

The attachment is a `z.discriminatedUnion('preset', …)` of eight strict objects, one per name.

## Per-preset params, ranges, defaults, and properties written

### Entrances

**`fadeIn`** — entrance. *Bring an element on by fading from transparent. The safe default entrance.*
- Params: _none_.
- Writes: `transform.opacity` (0 → 1, easeOut).

**`slideIn`** — entrance. *Enter from an edge with a gentle settle. Use for cards/titles that arrive with direction.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `direction` | enum | `left` \| `right` \| `up` \| `down` | `left` |
  | `distance` | number (px) | `> 0`, ≤ `10000`, optional | derived from comp size (0.6·width for left/right, 0.6·height for up/down) |
- Writes: `transform.position` (offset → rest, easeOut) and `transform.opacity` (0 → 1).

**`popIn`** — entrance / emphasis. *Scale up from nothing with a slight overshoot. Punchy; good for logos, badges, emphasis entrances.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `overshoot` | number | `1`–`2` (1 = none) | `1.15` |
  - Writes: `transform.scale` (0 → overshoot → 1) and `transform.opacity` (0 → 1).

### Exits

**`fadeOut`** — exit. *Take an element off by fading out. The safe default exit.*
- Params: _none_.
- Writes: `transform.opacity` (1 → 0, easeIn).

**`slideOut`** — exit. *Exit toward an edge while fading. Mirror of slideIn for symmetric transitions.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `direction` | enum | `left` \| `right` \| `up` \| `down` | `right` |
  | `distance` | number (px) | `> 0`, ≤ `10000`, optional | derived from comp size |
- Writes: `transform.position` (rest → offset, easeIn) and `transform.opacity` (1 → 0).

**`scaleOut`** — exit. *Shrink away. Good for dismissing chips/thumbnails.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `to` | number | `0`–`1` (final scale, 0 = nothing) | `0` |
- Writes: `transform.scale` (rest → `to`, easeIn) and `transform.opacity` (1 → 0).

### Emphasis

**`emphasisPulse`** — emphasis. *A scale pulse in place to draw the eye without moving the element. Use sparingly.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `peak` | number | `1`–`2` (peak scale) | `1.15` |
  | `cycles` | int | `1`–`4` | `1` |
- Writes: `transform.scale` (1 → peak → 1, repeated `cycles` times, easeInOut).

### Staggered group reveal

**`staggerReveal`** — group. *Reveal the children of a group one after another. The workhorse for lists, grids, and word-by-word titles.*
- Applies its `childPreset` to **each child of the group** with a growing start offset; it writes **no
  tracks on the group itself**.
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `childPreset` | enum | `fadeIn` \| `slideIn` \| `popIn` | `fadeIn` |
  | `stepFrames` | int | `1`–`60` (delay added per successive child) | `4` |
  | `order` | enum | `forward` \| `reverse` | `forward` |
- Writes: whatever `childPreset` writes, per child, at `start + i·stepFrames`.

## Verbatim schema source (`src/schema/presetParams.ts`)

```ts
const SLIDE_DIR = z.enum(['left', 'right', 'up', 'down']);

export const PRESET_PARAMS = {
  fadeIn: z.strictObject({}),
  slideIn: z.strictObject({
    direction: SLIDE_DIR.default('left'),
    distance: z.number().positive().max(10000).optional(),
  }),
  popIn: z.strictObject({
    overshoot: z.number().min(1).max(2).default(1.15),
  }),
  fadeOut: z.strictObject({}),
  slideOut: z.strictObject({
    direction: SLIDE_DIR.default('right'),
    distance: z.number().positive().max(10000).optional(),
  }),
  scaleOut: z.strictObject({
    to: z.number().min(0).max(1).default(0),
  }),
  emphasisPulse: z.strictObject({
    peak: z.number().min(1).max(2).default(1.15),
    cycles: z.int().min(1).max(4).default(1),
  }),
  staggerReveal: z.strictObject({
    childPreset: z.enum(['fadeIn', 'slideIn', 'popIn']).default('fadeIn'),
    stepFrames: z.int().min(1).max(60).default(4),
    order: z.enum(['forward', 'reverse']).default('forward'),
  }),
} as const;

// each attachment: { preset: literal, start: zFrame, duration: zFrameDuration,
//                    easing?: EasingName, params: PRESET_PARAMS[name].prefault({}) }
export const zMotionPresetAttachment = z.discriminatedUnion('preset', [ /* 8 attachments */ ]);
```
