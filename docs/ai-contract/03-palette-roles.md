# Palette roles

The semantic palette-role vocabulary (`PALETTE_ROLES`, `src/schema/enums.ts`). Roles are named by
**function, not hue**: the AI names a role, never a color. The style contract's palette binds each
role to a concrete color (`{ role, color: hex }`); assembly resolves a role reference to a linked
color style where the slot supports it, else to a literal from the contract.

```
PALETTE_ROLES = [
  'background', 'surface', 'primary', 'secondary', 'accent',
  'textPrimary', 'textSecondary', 'textInverse',
  'success', 'warning', 'danger', 'neutral',
]
```

| role | intended function |
|---|---|
| `background` | the base canvas / backdrop color |
| `surface` | raised panels, cards, containers on top of the background |
| `primary` | the dominant brand / action color |
| `secondary` | supporting brand color, second in weight to primary |
| `accent` | a small-area highlight / pop color |
| `textPrimary` | main body / heading text |
| `textSecondary` | subdued / secondary text |
| `textInverse` | text placed on a primary/dark fill (contrast inversion) |
| `success` | positive / confirmation state |
| `warning` | caution state |
| `danger` | error / destructive state |
| `neutral` | grays / dividers / disabled |

## How the AI references a role

The only color the AI emits is a role reference (`zColorRole`, `src/schema/primitives.ts`):

```ts
export const zColorRole = z.strictObject({ role: z.enum(PALETTE_ROLES) });
export const zAiColor = zColorRole; // AI color slots accept ONLY a role reference — never a literal
```

## Bounds

A style contract's palette binds **4 to 7** roles (a fixed design range, enforced structurally —
`z.array(zPaletteEntry).min(4).max(7)`). Not all twelve: a palette with every role bound has no
point of view. A palette need not bind every role, only those it uses.
