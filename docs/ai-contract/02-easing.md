# Easing

The named easing enum the Director may choose from and the Coder may name (`EASING_NAMES`,
`src/schema/enums.ts`). It resolves to concrete keyframe handles in the ONE place they are written
down (`EASING_TABLE`, `src/schema/easing.ts`); the same values also mirror
`src/core/animationPresets.ts` (verified byte-identical by `scripts/verify-schema.mjs`).

```
EASING_NAMES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring']
```

The Director picks a **closed set of 4–6** of these into the style contract (`easings`); the Coder
may only name easings from that chosen set.

## Resolution to concrete handles

Each name resolves to a keyframe `interpolation` mode plus, for bezier curves, `handleOut`/`handleIn`
tangents. (The cubic-bezier evaluator substitutes defaults for exact-zero components, so "zero" axes
use a tiny `0.001` to preserve the intended curve shape.)

| name | interpolation | handleOut | handleIn |
|---|---|---|---|
| `linear` | `linear` | — | — |
| `easeIn` | `bezier` | `[0.42, 0.001]` | `[1, 1]` |
| `easeOut` | `bezier` | `[0.001, 0.001]` | `[0.58, 1]` |
| `easeInOut` | `bezier` | `[0.42, 0.001]` | `[0.58, 1]` |
| `spring` | `spring` | — | — |

`linear` and `spring` carry no handles (their interpolation mode is self-describing to the evaluator).

## Verbatim source (`src/schema/easing.ts`)

```ts
export interface EasingHandles {
  interpolation: 'linear' | 'bezier' | 'hold' | 'spring';
  handleOut?: [number, number];
  handleIn?: [number, number];
}

export const EASING_TABLE: Record<EasingName, EasingHandles> = {
  linear: { interpolation: 'linear' },
  easeIn: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [1, 1] },
  easeOut: { interpolation: 'bezier', handleOut: [0.001, 0.001], handleIn: [0.58, 1] },
  easeInOut: { interpolation: 'bezier', handleOut: [0.42, 0.001], handleIn: [0.58, 1] },
  spring: { interpolation: 'spring' },
};

export const zEasingName = z.enum(EASING_NAMES); // ['linear','easeIn','easeOut','easeInOut','spring']
```
