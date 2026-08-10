# DirectorOutput / PanelPlan

The Director's single-call output (`makeDirectorOutput`, `src/schema/pipeline.ts`): a brief + the
style contract + the panel plan, **all in milliseconds** (planning). Job-expansion later converts to
frames exactly once (at the beat); nothing downstream of that sees milliseconds.

## `DirectorOutput`

| field | type |
|---|---|
| `brief` | `Brief` (below) |
| `styleContract` | see [StyleContract](./04-style-contract.md) |
| `panelPlan` | array of `DirectorPanel` — ≥ 1, ≤ `caps.maxPanels` (frozen 32) |

## `Brief`

| field | type | constraints |
|---|---|---|
| `durationMs` | int ms | `> 0` — committed total duration (the Director decides, doesn't ask) |
| `format` | enum | `landscape` \| `portrait` \| `square` — **mirrors the canvas, never invented** |
| `tone` | enum | `playful` \| `serious` \| `elegant` \| `energetic` \| `calm` \| `bold` \| `minimal` \| `corporate` |
| `subjects` | array of `{ id, name }` | **3 to 12** (a conceptual inventory, not a layer count) |
| `subjects[].id` | namespaced id | `/^[A-Za-z0-9][A-Za-z0-9:_-]*$/` |
| `subjects[].name` | semantic name | 1–120 chars |

## `DirectorPanel` (the PanelPlan element — ms)

| field | type | constraints |
|---|---|---|
| `id` | id string | non-empty |
| `order` | int | ≥ 0 |
| `startMs` | int ms | ≥ 0 |
| `endMs` | int ms | ≥ 0 |
| `focalPoint` | `[x, y]` | **required** — every panel has one |
| `elements` | array of `{ id, name, kind }` | ≤ `caps.maxLayersPerPanel` (frozen 120) |
| `elements[].id` | namespaced id | — |
| `elements[].name` | semantic name | — |
| `elements[].kind` | enum `AI_LAYER_TYPES` | `shape` \| `text` \| `group` \| `image` \| `video` \| `cloner` (no `camera`/`audio`) |
| `transitionIn` | `Transition` (below) | optional — transition INTO this panel; **panel 0 must have none** |
| `inboundPresent` | array of id | element ids on screen at the in-point (the unified boundary contract) |
| `outboundPresent` | array of id | element ids on screen at the out-point |

`inboundPresent`/`outboundPresent` are the **unified** boundary contract — the same present-list shape
the compiled frame `Panel` uses (no second representation). Adjacent panels' outbound/inbound
present-sets must reconcile exactly or assembly (and `validateDirectorPlan`) reports a
`boundary-mismatch`.

### `Transition`

| field | type | constraints |
|---|---|---|
| `type` | enum | `cut` \| `crossDissolve` \| `slide` \| `wipe` \| `push` \| `zoom` \| `fade` |
| `duration` | int | ≥ 0 (ms in the Director plan; converted to frames at job-expansion) |
| `easing` | easing name | optional |
| `params` | record of string → number | optional |

Every object is **strict** (closed to unknown keys).

## Rules the SEMANTIC validator enforces (Zod cannot — cross-panel/field)

`validateDirectorPlan` (`src/schema/semantic.ts`) checks, in addition to the structural bounds above:

- **Beat alignment** — every `startMs`/`endMs`, `durationMs`, and transition duration is an integer
  multiple of `styleContract.beatMs`.
- **Contiguity** — panels are ordered `0..n-1`, `panelPlan[0].startMs === 0`, gapless & non-overlapping.
- **Duration** — the last panel ends exactly at `brief.durationMs`.
- **Element ownership** — each element id is declared once (its first panel); carried elements appear
  only in present-lists.
- **Id namespace** — a declared element's id is namespaced to its owning panel (`p<order>:…`).
- **Boundary reconciliation** — panel 0's `inboundPresent` is empty; each panel's `outboundPresent`
  equals the next panel's `inboundPresent`.
- **Format** — `brief.format` matches the preflight canvas (given the canvas).
- **Transitions** — panel 0 has no `transitionIn`; a transition's `duration` ≤ half the shorter of the
  two panels it joins.

## Verbatim source (`src/schema/pipeline.ts`)

```ts
export const MAX_SUBJECTS = 12;
export function makeBrief() {
  return z.strictObject({
    durationMs: zMs.refine((v) => v > 0, 'duration must be > 0'),
    format: z.enum(OUTPUT_FORMATS),                 // ['landscape','portrait','square']
    tone: z.enum(TONES),                            // 8 tones (see table)
    subjects: z.array(z.strictObject({ id: zNamespacedId, name: zSemanticName })).min(3).max(MAX_SUBJECTS),
  });
}

export function makeDirectorPanel(caps: Caps) {
  return z.strictObject({
    id: zId,
    order: z.int().min(0),
    startMs: zMs,
    endMs: zMs,
    focalPoint: zVec2,                              // REQUIRED
    elements: z.array(z.strictObject({ id: zNamespacedId, name: zSemanticName, kind: z.enum(AI_LAYER_TYPES) }))
      .max(caps.maxLayersPerPanel),
    transitionIn: zTransition.optional(),
    inboundPresent: z.array(zId),
    outboundPresent: z.array(zId),
  });
}

export function makeDirectorPanelPlan(caps: Caps) {
  return z.array(makeDirectorPanel(caps)).min(1).max(caps.maxPanels);
}

export function makeDirectorOutput(caps: Caps) {
  return z.strictObject({
    brief: makeBrief(),
    styleContract: makeStyleContract(),
    panelPlan: makeDirectorPanelPlan(caps),
  });
}

// zTransition (src/schema/panels.ts):
export const zTransition = z.strictObject({
  type: z.enum(TRANSITION_TYPES),                   // ['cut','crossDissolve','slide','wipe','push','zoom','fade']
  duration: z.int().min(0),
  easing: zEasingName.optional(),
  params: z.record(z.string(), z.number()).optional(),
});
```

## Example (valid, two panels @ beat 250ms)

```json
{
  "brief": { "durationMs": 4000, "format": "landscape", "tone": "bold",
    "subjects": [{ "id": "s1", "name": "wordmark" }, { "id": "s2", "name": "tagline" }, { "id": "s3", "name": "accent-dots" }] },
  "styleContract": { "...": "see 04-style-contract.md (4–7 palette roles, 4–6 easings)" },
  "panelPlan": [
    { "id": "panel-0", "order": 0, "startMs": 0, "endMs": 2000, "focalPoint": [960, 540],
      "elements": [], "inboundPresent": [], "outboundPresent": [] },
    { "id": "panel-1", "order": 1, "startMs": 2000, "endMs": 4000, "focalPoint": [960, 480],
      "transitionIn": { "type": "crossDissolve", "duration": 250 },
      "elements": [], "inboundPresent": [], "outboundPresent": [] }
  ]
}
```
