# StyleContract

The style contract the Director commits to (`makeStyleContract`, `src/schema/styleContract.ts`). It
is a **planning** artifact — its beat is in **milliseconds** — and it is persisted on the document as
a required input for the edit path. It is the bridge for the colors invariant: the palette assigns a
concrete color to each named role, and everything the Coder emits references roles.

## Fields

| field | type | constraints |
|---|---|---|
| `palette` | array of `{ role, color }` | ≥ 1, ≤ `caps.maxPaletteEntries` (frozen 32) |
| `palette[].role` | enum `PALETTE_ROLES` | see [palette roles](./03-palette-roles.md) |
| `palette[].color` | hex string | `#rgb` \| `#rrggbb` \| `#rrggbbaa` |
| `easings` | array of easing names | ≥ 1, ≤ 6 — the closed set the whole piece may use |
| `beatMs` | int ms | `> 0` — base timing beat; plan durations are integer multiples of it |
| `shapeLanguage` | enum | `rounded` \| `sharp` \| `geometric` \| `organic` \| `mixed` |
| `staggerDoctrine` | object (below) | — |

### `staggerDoctrine`

| field | type | constraints |
|---|---|---|
| `mode` | enum | `none` \| `perLayer` \| `perGroup` \| `spatial` |
| `gapMs` | int ms | ≥ 0 — base inter-element gap (planning) |
| `curve` | easing name | optional |

Every object is **strict** (closed to unknown keys).

## Verbatim source (`src/schema/styleContract.ts`)

```ts
export const zPaletteEntry = z.strictObject({
  role: z.enum(PALETTE_ROLES),
  color: zHexColor,            // /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
});

export const zStaggerDoctrine = z.strictObject({
  mode: z.enum(['none', 'perLayer', 'perGroup', 'spatial']),
  gapMs: zMs,                  // z.int().min(0)
  curve: z.enum(EASING_NAMES).optional(),
});

export function makeStyleContract(caps: Caps) {
  return z.strictObject({
    palette: z.array(zPaletteEntry).min(1).max(caps.maxPaletteEntries),
    easings: z.array(z.enum(EASING_NAMES)).min(1).max(6),
    beatMs: zMs.refine((v) => v > 0, 'beat must be > 0'),
    shapeLanguage: z.enum(['rounded', 'sharp', 'geometric', 'organic', 'mixed']),
    staggerDoctrine: zStaggerDoctrine,
  });
}
```

## Example (valid)

```json
{
  "palette": [
    { "role": "background", "color": "#0b1220" },
    { "role": "primary", "color": "#f7b500" },
    { "role": "textPrimary", "color": "#ffffff" },
    { "role": "accent", "color": "#22d3ee" }
  ],
  "easings": ["easeOut", "easeInOut", "linear", "easeIn"],
  "beatMs": 250,
  "shapeLanguage": "geometric",
  "staggerDoctrine": { "mode": "perLayer", "gapMs": 60 }
}
```
