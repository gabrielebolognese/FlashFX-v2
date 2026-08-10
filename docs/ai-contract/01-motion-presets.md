# Motion presets

`MOTION_PRESET_NAMES` (`src/schema/enums.ts`) — the closed set of motion presets the Coder may
attach at layer level. Params are **closed per preset name** (`src/schema/presetParams.ts`): an
unknown parameter is a parse error, not something the expander tolerates. The expander that turns an
attachment into real keyframe tracks lives in `src/ai/presetCatalog.ts`, keyed by the same names, and
maps onto the existing engine generator `generatePresetKeyframes` (curves are not re-authored).

```
MOTION_PRESET_NAMES = [
  'fadeIn', 'slideIn', 'popIn',            // entrances
  'fadeOut', 'slideOut', 'scaleOut',       // exits
  'emphasisPulse',                          // emphasis
  'staggerReveal', 'staggerExit',           // staggered group reveal / clear
]
```

`staggerReveal` and `staggerExit` are GROUP presets: they write nothing on the group itself — the
assembler applies their `childPreset` to each child of the group with a growing offset.

## Attachment shape (common to every preset)

Each entry in a layer's `presets: [...]` array is:

| field | type | notes |
|---|---|---|
| `preset` | one of `MOTION_PRESET_NAMES` | discriminator |
| `start` | `zFrame` (int ≥ 0) | **panel-local** frame the preset begins (0 = the panel's start); assembly adds the panel offset |
| `duration` | `zFrameDuration` (int ≥ 1) | length in frames |
| `easing` | named easing (optional) | overrides the preset's own segment easing |
| `params` | closed per-preset object (below) | defaults to `{}`; all fields defaulted |

The attachment is a `z.discriminatedUnion('preset', …)` of nine strict objects, one per name.

## Per-preset params, ranges, defaults, and properties written

### Entrances

**`fadeIn`** — entrance. *Bring an element on by fading from transparent. The safe default entrance.*
- Params: _none_. Writes: `transform.opacity` (0 → 1, easeOut).

**`slideIn`** — entrance. *Enter from an edge with a gentle settle.*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `direction` | enum | `left` \| `right` \| `up` \| `down` | `left` |
  | `distance` | number (px) | `> 0`, ≤ `10000`, optional | derived from comp size |
  - Writes: `transform.position` and `transform.opacity`.

**`popIn`** — entrance. *Scale up from nothing with a slight overshoot.*
- Params: `overshoot` — number `1`–`2` (1 = none), default `1.15`. Writes: `transform.scale`, `transform.opacity`.

### Exits

**`fadeOut`** — exit. *Fade out. The safe default exit.* Params: _none_. Writes: `transform.opacity`.

**`slideOut`** — exit. *Exit toward an edge while fading.*
- Params: `direction` (default `right`), `distance` (`> 0`, ≤ `10000`, optional). Writes: `transform.position`, `transform.opacity`.

**`scaleOut`** — exit. *Shrink away.* Params: `to` — number `0`–`1`, default `0`. Writes: `transform.scale`, `transform.opacity`.

### Emphasis

**`emphasisPulse`** — emphasis. *A scale pulse in place.*
- Params: `peak` (number `1`–`2`, default `1.15`), `cycles` (int `1`–`4`, default `1`). Writes: `transform.scale`.

### Staggered group presets

**`staggerReveal`** — group. *Reveal the children of a group one after another (lists, grids, word-by-word titles).*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `childPreset` | enum | `fadeIn` \| `slideIn` \| `popIn` | `fadeIn` |
  | `stepFrames` | int | `1`–`60`, **optional** | omit → `styleContract.staggerDoctrine.gapMs` (converted to frames) |
  | `order` | enum | `forward` \| `reverse` | `forward` |
- Writes: whatever `childPreset` writes, per child, at `start + i·step`.

**`staggerExit`** — group. *Clear the children of a group one after another (the exit mirror).*
- Params:
  | param | type | range | default |
  |---|---|---|---|
  | `childPreset` | enum | `fadeOut` \| `slideOut` \| `scaleOut` | `fadeOut` |
  | `stepFrames` | int | `1`–`60`, **optional** | omit → `staggerDoctrine.gapMs` |
  | `order` | enum | `forward` \| `reverse` | `forward` |
- Writes: whatever `childPreset` writes, per child.

## Overlap rule

Two presets on the same layer whose written-property sets intersect are a hard error
(`preset-property-overlap`, checked from each preset's `targets` in the catalog) — silent
last-write-wins would erase an animation.

## Verbatim schema source (`src/schema/presetParams.ts`)

```ts
const SLIDE_DIR = z.enum(['left', 'right', 'up', 'down']);

export const PRESET_PARAMS = {
  fadeIn: z.strictObject({}),
  slideIn: z.strictObject({
    direction: SLIDE_DIR.default('left'),
    distance: z.number().positive().max(10000).optional(),
  }),
  popIn: z.strictObject({ overshoot: z.number().min(1).max(2).default(1.15) }),
  fadeOut: z.strictObject({}),
  slideOut: z.strictObject({
    direction: SLIDE_DIR.default('right'),
    distance: z.number().positive().max(10000).optional(),
  }),
  scaleOut: z.strictObject({ to: z.number().min(0).max(1).default(0) }),
  emphasisPulse: z.strictObject({
    peak: z.number().min(1).max(2).default(1.15),
    cycles: z.int().min(1).max(4).default(1),
  }),
  staggerReveal: z.strictObject({
    childPreset: z.enum(['fadeIn', 'slideIn', 'popIn']).default('fadeIn'),
    stepFrames: z.int().min(1).max(60).optional(),   // omit → staggerDoctrine.gapMs
    order: z.enum(['forward', 'reverse']).default('forward'),
  }),
  staggerExit: z.strictObject({
    childPreset: z.enum(['fadeOut', 'slideOut', 'scaleOut']).default('fadeOut'),
    stepFrames: z.int().min(1).max(60).optional(),
    order: z.enum(['forward', 'reverse']).default('forward'),
  }),
} as const;

// each attachment: { preset: literal, start: zFrame (panel-local), duration: zFrameDuration,
//                    easing?: EasingName, params: PRESET_PARAMS[name].prefault({}) }
export const zMotionPresetAttachment = z.discriminatedUnion('preset', [ /* 9 attachments */ ]);
```
