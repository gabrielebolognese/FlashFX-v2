# AI authoring contract — reference artifacts

Extracted verbatim from the schema package (`src/schema/`) and the preset catalog
(`src/ai/presetCatalog.ts`). These are the closed vocabularies and top-level contracts the
generation pipeline is built on; they are also the source a system-prompt builder renders.

If any of these disagree with the code, the CODE is authoritative — regenerate these from it.

1. [Motion presets](./01-motion-presets.md) — `MOTION_PRESET_NAMES` + per-preset params, ranges, defaults, and the properties each writes.
2. [Easing](./02-easing.md) — the named easing enum the Director may choose from, resolving to concrete handles.
3. [Palette roles](./03-palette-roles.md) — the semantic role vocabulary.
4. [Style contract](./04-style-contract.md) — the `StyleContract` schema, in full.
5. [Director output](./05-director-output.md) — the `PanelPlan` / `DirectorOutput` schema, in full.

Conventions used below:
- **Time units:** planning contracts (Director output, style-contract beat) carry **milliseconds**;
  everything document-facing carries integer **frames**. `zMs`/`zFrame` = `z.int().min(0)`.
- **Caps** shown as `≤ caps.X` are per-tier for validation but frozen at `DECODE_CAPS` for the
  constrained-decoding tool schema (so the prompt-cache prefix is stable). `DECODE_CAPS` values are
  noted where they bound a field.
