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
| `format` | enum | `landscape` \| `portrait` \| `square` |
| `tone` | enum | `playful` \| `serious` \| `elegant` \| `energetic` \| `calm` \| `bold` \| `minimal` \| `corporate` |
| `subjects` | array of `{ id, name }` | ≥ 1, ≤ `caps.maxLayersTotal` (frozen 1200) |
| `subjects[].id` | namespaced id | `/^[A-Za-z0-9][A-Za-z0-9:_-]*$/` |
| `subjects[].name` | semantic name | 1–120 chars |

## `DirectorPanel` (the PanelPlan element — ms)

| field | type | constraints |
|---|---|---|
| `id` | id string | non-empty |
| `order` | int | ≥ 0 |
| `startMs` | int ms | ≥ 0 |
| `endMs` | int ms | ≥ 0 |
| `focalPoint` | `[x, y]` | optional |
| `elements` | array of `{ id, name, kind }` | ≤ `caps.maxLayersPerPanel` (frozen 120) |
| `elements[].id` | namespaced id | — |
| `elements[].name` | semantic name | — |
| `elements[].kind` | enum `AI_LAYER_TYPES` | `shape` \| `text` \| `group` \| `image` \| `video` \| `audio` \| `cloner` \| `camera` |
| `transitionIn` | `Transition` (below) | optional — transition INTO this panel |
| `inboundPresent` | array of id | element ids on screen at the panel's in-point |
| `outboundPresent` | array of id | element ids on screen at the panel's out-point |

`inboundPresent`/`outboundPresent` are the **coarse** boundary contracts (present-id lists) — enough
to fan out jobs. The assembled frame `Panel` carries the richer state contract (`present`, `opacity`,
`position` per layer); adjacent panels' outbound/inbound present-sets must reconcile or assembly
reports a `boundary-mismatch` error.

### `Transition`

| field | type | constraints |
|---|---|---|
| `type` | enum | `cut` \| `crossDissolve` \| `slide` \| `wipe` \| `push` \| `zoom` \| `fade` |
| `duration` | int | ≥ 0 (ms in the Director plan; converted to frames at job-expansion) |
| `easing` | easing name | optional |
| `params` | record of string → number | optional |

Every object is **strict** (closed to unknown keys).

## Verbatim source (`src/schema/pipeline.ts`)

```ts
export function makeBrief(caps: Caps) {
  return z.strictObject({
    durationMs: zMs.refine((v) => v > 0, 'duration must be > 0'),
    format: z.enum(OUTPUT_FORMATS),                 // ['landscape','portrait','square']
    tone: z.enum(TONES),                            // 8 tones (see table)
    subjects: z.array(z.strictObject({ id: zNamespacedId, name: zSemanticName })).min(1).max(caps.maxLayersTotal),
  });
}

export function makeDirectorPanel(caps: Caps) {
  return z.strictObject({
    id: zId,
    order: z.int().min(0),
    startMs: zMs,
    endMs: zMs,
    focalPoint: zVec2.optional(),
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
    brief: makeBrief(caps),
    styleContract: makeStyleContract(caps),
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
  "brief": { "durationMs": 4000, "format": "landscape", "tone": "bold", "subjects": [{ "id": "s1", "name": "wordmark" }] },
  "styleContract": { "...": "see 04-style-contract.md" },
  "panelPlan": [
    { "id": "panel-0", "order": 0, "startMs": 0, "endMs": 2000, "elements": [], "inboundPresent": [], "outboundPresent": [] },
    { "id": "panel-1", "order": 1, "startMs": 2000, "endMs": 4000,
      "transitionIn": { "type": "crossDissolve", "duration": 250 },
      "elements": [], "inboundPresent": [], "outboundPresent": [] }
  ]
}
```
