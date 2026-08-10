# StyleContract

The style contract the Director commits to (`makeStyleContract`, `src/schema/styleContract.ts`). It
is a **planning** artifact (its beat is in ms) and it is persisted on the document as a required
input for the edit path. It is the bridge for the colors invariant: the palette assigns a concrete
color to each named role, and everything the Coder emits references roles.

Palette and easing counts are **fixed design ranges** (not tier caps), so `makeStyleContract` takes
no `caps` — the schema enforces exactly the ranges the prompt states.

## Fields

| field | type | constraints |
|---|---|---|
| `palette` | array of `{ role, color }` | **4 to 7** entries |
| `palette[].role` | enum `PALETTE_ROLES` | see [palette roles](./03-palette-roles.md) |
| `palette[].color` | hex string | `#rgb` \| `#rrggbb` \| `#rrggbbaa` |
| `easings` | array of easing names | **4 to 6** — the closed set the whole piece may use |
| `beatMs` | int ms | `> 0` — base timing beat; plan durations are integer multiples of it |
| `shapeLanguage` | enum `SHAPE_LANGUAGES` | `rounded` \| `sharp` \| `geometric` \| `organic` \| `mixed` |
| `staggerDoctrine` | object (below) | — |

### `staggerDoctrine`

| field | type | constraints |
|---|---|---|
| `mode` | enum `STAGGER_MODES` | `none` \| `perLayer` \| `perGroup` \| `spatial` |
| `gapMs` | int ms | ≥ 0 — base inter-element gap (wired through to `staggerReveal`/`staggerExit` at assembly) |
| `curve` | easing name | optional |

Every object is **strict** (closed to unknown keys).

## Verbatim source (`src/schema/styleContract.ts`)

```ts
export const zPaletteEntry = z.strictObject({
  role: z.enum(PALETTE_ROLES),
  color: zHexColor,            // /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
});

export const zStaggerDoctrine = z.strictObject({
  mode: z.enum(STAGGER_MODES),          // ['none','perLayer','perGroup','spatial']
  gapMs: zMs,                           // z.int().min(0)
  curve: z.enum(EASING_NAMES).optional(),
});

export function makeStyleContract() {
  return z.strictObject({
    palette: z.array(zPaletteEntry).min(4).max(7),
    easings: z.array(z.enum(EASING_NAMES)).min(4).max(6),
    beatMs: zMs.refine((v) => v > 0, 'beat must be > 0'),
    shapeLanguage: z.enum(SHAPE_LANGUAGES),   // ['rounded','sharp','geometric','organic','mixed']
    staggerDoctrine: zStaggerDoctrine,
  });
}
```

## Example (valid — five roles, four easings)

```json
{
  "palette": [
    { "role": "background", "color": "#0b1220" },
    { "role": "surface", "color": "#141c28" },
    { "role": "primary", "color": "#f7b500" },
    { "role": "textPrimary", "color": "#ffffff" },
    { "role": "accent", "color": "#22d3ee" }
  ],
  "easings": ["easeOut", "easeInOut", "easeIn", "linear"],
  "beatMs": 250,
  "shapeLanguage": "geometric",
  "staggerDoctrine": { "mode": "perLayer", "gapMs": 60 }
}
```
