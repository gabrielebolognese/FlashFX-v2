# FlashFX — Deep-link templates (landing-page CTAs → seeded editor)

## Goal

The marketing landing page (a **separate** codebase/domain) has feature CTAs — "Try it in the
editor", "Try it now". Clicking one should open FlashFX with that feature already set up: e.g. the
particle-generator CTA opens a fresh project with a live particle scene. The only contract between
the two projects is a **URL parameter** — no shared code.

## Decisions (locked)

- **Link format:** query param — `https://<app>/?template=<id>`. Works with the app's existing static
  hosting (index.html at root). (Hash `#template=<id>` is the fallback if a host can't serve index at
  arbitrary paths; not needed today.)
- **Payload:** a **named template** the app owns (`?template=particles`). No cross-codebase schema
  coupling; the app fully controls what each id builds. (A validated live-config payload — `&cfg=…` —
  is a possible Phase 2 if we ever want the link to pixel-match the exact demo the user played with.)

## How it works

1. Landing page CTA → `https://<app>/?template=particles`.
2. App boot (`useTemplateBoot`, called from `ProjectApp`) reads the param **once**, validates it
   against the whitelist, and strips it via `history.replaceState` (so refresh/bookmark don't
   re-create the project).
3. `launchTemplate(id)` → `createAndOpenProject({...})` (fresh project, flips to the editor) → waits
   for the new scene to actually load → runs `template.apply(editor)` to seed it via real store
   actions → optionally starts playback.
4. A splash covers the brief create/seed so the dashboard never flashes. No param → the app boots
   normally.

Each click yields a **new** project (a clean demo scene), whether or not the user already has
projects.

## Code (all under `src/templates/`, plus one wire-in)

| File | Role |
|------|------|
| `types.ts` | `Template { name, width, height, videoFormat, autoplay?, apply(editor) }`. |
| `registry.ts` | `TEMPLATES: Record<id, Template>` whitelist + `isTemplateId`. **Add an entry here to expose a new CTA — nothing else changes.** |
| `launch.ts` | `launchTemplate(id)`: open fresh project → `waitForSceneLoad` (composition ref changes) → `apply` → autoplay. The wait avoids a race: `ProjectApp` loads the scene *after* `createAndOpenProject` returns, so seeding immediately would hit the wrong doc. |
| `boot.ts` | `readTemplateFromUrl()` (validated) + `clearTemplateParam()`. |
| `useTemplateBoot.ts` | Hook: on mount, if a valid param exists, launch it and report `booting`. Module-level guard = exactly one project even under StrictMode's double-invoked effects. |
| `TemplateSplash.tsx` | The "Setting up your scene…" splash. |
| `project-system/ui/ProjectApp.tsx` | Calls `useTemplateBoot()`; renders the splash while `booting`. |

## Guardrails

- **Whitelist only** — an unknown `?template=` value is ignored (never eval'd or trusted as scene
  data). This is the entire trust boundary for v1 (no untrusted payload is parsed).
- Param stripped immediately after read — no re-fire.
- Seeding waits for the real scene load, then applies — deterministic, not a blind delay.

## Landing-page snippet (their codebase)

Just an anchor — no SDK, no shared code:

```html
<!-- Particle generator CTA -->
<a href="https://app.flashfx.com/?template=particles">Try it in the editor</a>
```

**Valid template ids (keep in sync with `src/templates/registry.ts`):**

| id | Opens |
|----|-------|
| `particles` | 1920×1080 project with a live particle (fire) burst on a dark stage, auto-playing. |

New feature CTAs (3D, cloner, expressions, …) = one new `registry.ts` entry + one row here.

## Phase 2 (later, not built)

- More templates as features land (`3d`, `cloner`, `expressions`).
- Optional live-config payload `?template=particles&cfg=<base64 json>` — carries the exact params from
  the landing-page demo; requires a **versioned, validated, clamped** decoder (untrusted input) and a
  shared/pinned config schema between the two codebases.
- Optional `postMessage` handshake if the editor is ever embedded in an iframe on the landing page
  (vs. opened in a new tab).
