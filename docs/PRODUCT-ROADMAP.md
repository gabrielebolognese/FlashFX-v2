# FlashFX — MVP → Product Roadmap

How to turn FlashFX from a strong local editor into a real, durable, monetizable product.
Grounded in a two-part codebase audit (Aug 2026): commercial/backend plumbing + reliability/UX.

---

## 0. Where FlashFX actually is (the honest map)

FlashFX is a **pure static SPA (Vite/React/Zustand) + Supabase BaaS — there is no application backend.**
The surprising finding from the audit: the *editor engine* is much healthier than an MVP usually is,
while the *product shell* is essentially not built yet.

**What's genuinely solid (protect this — it's the moat):**
- **Export works.** `codec/exporter.ts` is a real WebCodecs (H.264) + `mp4-muxer` pipeline with careful
  AAC audio mixing (`codec/audioMixer.ts`, preview-parity mute/solo/volume automation), backpressure,
  cancel, granular progress, and non-fatal audio fallback. The old "precomp exports blank" and
  "VideoFrame OOM" blockers are fixed in the current tree.
- **Crash recovery is a strength.** `engine/recovery.ts`: memory watchdog + auto-trim, WebGPU
  device-loss auto-rebuild, a guaranteed reset path, and panel-level error boundaries.
- **First-result path exists.** ~40 authored templates (`animation-templates/catalog.ts`) + 6 deep-link
  demos (`templates/registry.ts`) + a guided tutorial. New users are not stuck on a blank canvas.
- **Local persistence is real.** IndexedDB projects + media blobs, autosave, `.ffx` file portability,
  and a fresh local Brands/Saved library (IndexedDB).

**What's missing or fragile (the product gap — mostly not code-hard):**
| Gap | State |
|---|---|
| **Auth / accounts** | None. Only a static `x-app-key` header; every Supabase table is one global tenant, no `user_id`. |
| **Billing** | None. No Paddle/Stripe. `TIER_CAPS` exist but are AI-doc-size caps, unwired to any account. |
| **Cloud projects / sync** | None. IndexedDB-only → clearing data or switching device loses everything. |
| **Cloud media** | None. Media is IndexedDB blobs; no R2/S3; only advisory quota warnings. |
| **Entitlements** | None. Export is 4K-to-everyone, no watermark, no plan check. |
| **Analytics / error tracking** | None. No Sentry/PostHog/GA. You would launch *blind* to crashes and behavior. |
| **Root resilience** | No root error boundary, no global `window.onerror`/`unhandledrejection`/`beforeunload`. |
| **Unsupported-browser gate** | None. WebGPU-less users boot in, then hit a confusing "reset" dead-end. |
| **Onboarding** | Built but **dark-launched** (`active:false`, never triggered for new users). |
| **Legal** | No ToS/Privacy/consent — yet PII (`user_agent`, `project_id`) is already sent to Supabase. |
| **Landing / pricing** | None in code (exists only as planning docs). Editor-only. |
| **AI** | Real Director→Coder pipeline is built + tested but **not wired**; the in-app chat is a mockup. |
| **Committed secret** | A Google service-account key was committed; rotation + git-history purge flagged unresolved. |
| **Export durability** | No output validation; all encoded chunks + full MP4 held in RAM → OOM risk on long/4K. |

---

## Strategic thesis (why this order)

A paying user of a video editor assumes two things above all: **"my work won't disappear"** and
**"I can get my video out."** Everything else — auth, billing, AI — is worthless bolted onto a tool that
fails either. So the sequence is **earn trust → own the account → make it durable → charge for it → grow it.**

Two consequences:
1. **The cheapest, highest-leverage work comes first and needs no backend:** stop launching blind
   (analytics + error tracking), stop being one stray `throw` from a white screen (root boundary +
   global handlers), stop dead-ending non-Chrome users, and turn on the onboarding you already built.
   This is ~1–2 weeks and de-risks *everything* after it.
2. **Auth is the hinge, not the start.** Cloud sync, billing, entitlements, and AI metering all hang off
   real accounts — so accounts come right after the Phase-0 hardening, but not before it.

The premium-UI renovation you just finished is the **credibility layer** that makes people willing to pay;
this roadmap is the machinery that lets you actually charge and keep them.

---

## Phase 0 — Stop launching blind & fragile  *(no backend; ~1–2 weeks; do this first)*

The de-risking layer. None of it needs accounts.

- **Observability.** Add error tracking (**Sentry**) + product analytics (**PostHog**, self-hostable,
  privacy-friendly). Wire a first-run → first-export funnel and feature-usage events. Route
  `PanelErrorBoundary` + recovery events into Sentry. *You cannot improve what you can't see.*
- **Root resilience.** Add a **root error boundary** in `main.tsx`, a global `window.onerror` +
  `unhandledrejection` handler (→ Sentry + a friendly recovery screen), and a `beforeunload`
  unsaved-changes guard. One panel crash already recovers; a Toolbar/modal/shell crash currently
  white-screens the whole app.
- **Unsupported-browser gate.** Feature-detect WebGPU **before** app render → a clean "FlashFX needs
  Chrome or Edge" screen with guidance, instead of the current confusing infinite-reset overlay.
- **Turn on onboarding.** Flip `onboarding/store.ts` `active` on a first-run localStorage flag. The
  wizard is fully built and shipping nothing today.
- **Autosave hardening.** Crash-flush on `visibilitychange`/`beforeunload`, a small rolling
  local version history (you already serialize whole documents), and surface save failures (today they
  only `console.error`).
- **Export durability.** Validate output (non-zero frames/chunks, a quick playability probe) and fix the
  RAM ceiling for long/4K — stream to disk via the **File System Access API** (or chunked writes)
  instead of buffering the whole MP4 in memory; warn/cap when memory is tight.
- **Housekeeping (blockers).** Verify the "uncommitted Phase-1 fixes" are actually in git; **rotate the
  Google service-account key + purge git history**; delete/replace the stale
  `docs/EXPORT_SYSTEM_DOCUMENTATION.md` (it describes a non-existent pipeline).
- **CI + `npm test`.** Aggregate the ~50 `verify:*` harnesses into one command and run
  typecheck/lint/verify on push. (The reliability-critical paths — export, persistence, recovery — have
  *no* harness coverage; add a few.)
- **Minimal legal now.** A Privacy Policy + a consent mechanism for analytics/telemetry — required the
  moment you turn on Sentry/PostHog, and arguably already owed for the recovery-log PII.

**Exit:** you can see every crash and the activation funnel; a stray error can't white-screen the app;
non-Chrome users get a clean message; exports are validated; the onboarding runs.

## Phase 1 — Accounts & identity  *(the hinge)*

- **Supabase Auth** (email/password + Google/Apple OAuth) — least new infra since Supabase is already in.
  Sessions, protected surfaces, sign-in/up/reset UI, account settings.
- **Rewrite the data model for ownership.** Add `user_id` to every table; replace the static-header RLS
  with real per-user policies; retire `x-app-key`. Migrate the current global brand-kit/saved-asset rows
  (they're shared today) to per-user, or keep a curated global set + per-user overrides.
- **Anonymous → account upgrade.** Let users try the editor logged-out (local-only), then "sign in to
  save to the cloud" — preserves your local-first funnel while capturing the account.

**Unblocks:** cloud sync, billing, entitlements, AI metering.

## Phase 2 — Durability & "reusable"  *(cloud projects + media; depends on Phase 1)*

This is the literal "usable *and reusable*" promise — your projects follow you across devices.

- **Cloud projects.** Keep the **local-first architecture** (it's an asset) and add cloud as a **sync +
  backup** layer: push scene JSON + metadata to Supabase/R2 on save, pull on open, last-write-wins with
  a version history and a simple conflict banner. Don't rip out IndexedDB — make the cloud its mirror.
- **Cloud media in R2** (already in your stack). Presigned uploads/downloads; store the R2 key on the
  asset record; hydrate object URLs at runtime. Per-plan storage quota (you already measure usage).
- **Cross-device open + a real project dashboard** backed by the cloud, not just this browser.

## Phase 3 — Monetization  *(billing + entitlements; depends on Phase 1)*

- **Paddle** (recommended over Stripe for a solo founder: Merchant-of-Record handles global VAT/tax,
  chargebacks, invoicing — and it's already the named stack). Checkout + subscriptions + webhooks →
  an **entitlements table** keyed by `user_id`.
- **Plans** (suggested): **Free** (watermark, 720p/1080p, N projects, small storage, a few AI credits) ·
  **Pro** (no watermark, 4K, more storage, more AI) · **Studio** (max everything, priority AI).
- **One entitlement gate** (`useEntitlements`) enforced at the choke points: **export** (resolution +
  watermark), **AI**, **project-create**, **media upload/quota**. Wire the existing `TIER_CAPS`
  scaffolding into it instead of the current hardcoded `'pro'`.
- **Free-tier watermark** on export + contextual upgrade prompts (the highest-converting surface).

## Phase 4 — AI as a paid feature  *(depends on Phase 1 + 3)*

The engine is done and tested; only the productization is missing.

- **Key-holding proxy** (the paused AI-plan **M4**): a Supabase edge function holding
  `ANTHROPIC_API_KEY` as a secret (never a `VITE_` var), shared-secret gated, with **per-user credit
  metering**. The `drive-assets` function is the pattern to copy.
- **Wire the real pipeline** into the chat panel — replace `aiChatDemo.ts` (the mockup) with
  `generate()` → `commitAiComposition`, streaming progress through the Dynamic Island / Tasks panel.
- **Meter usage** against plan credits; upsell when they run out. AI is the clearest premium lever.

## Phase 5 — Go-to-market  *(legal + landing + acquisition)*

- **Full legal** (before public launch): Terms of Service, complete Privacy Policy, cookie/analytics
  consent, and GDPR/CCPA **data export + delete** (now easy because Phase 1 gave you `user_id`).
- **Landing + pricing page.** The deep-link templates (`/?template=`) are already built as CTA targets;
  the `SEO-PLAN.md` and `LANDING-CTA-FEATURES-PLAN.md` are waiting. Real marketing surface, not editor-only.
- **Support scaffolding.** Help docs, in-app feedback/bug capture, a changelog.

## Phase 6 — Growth  *(post-launch)*

- **Sharing** (view-only share links → later real-time collaboration).
- **Template marketplace / expansion**, referral loop, lifecycle email, in-app "what's new."
- **Adaptive playback quality** and a real proxy pipeline (today "Create Proxy" is a facade that still
  full-decodes 4K) — quality-of-life that reduces churn on heavy projects.

---

## Critical path & the "next 5 things"

```
Phase 0 (harden, no backend) ─┬─────────────► Phase 5 legal/landing ──► launch
                              │
                              └─► Phase 1 Auth ─┬─► Phase 2 Cloud/media (reusable)
                                                ├─► Phase 3 Billing/entitlements ──► Phase 4 AI $$
                                                └─► (Phase 5 data-delete needs user_id)
```

**If you do only five things next, in order:**
1. **Sentry + PostHog** — stop being blind.
2. **Root error boundary + global handlers + unsupported-browser gate** — stop being one throw from a white screen.
3. **Supabase Auth + `user_id` + real RLS** — the hinge everything hangs off.
4. **Cloud project sync (local-first + R2 media)** — deliver "your work is safe, anywhere."
5. **Paddle + entitlement gate + export watermark** — turn it into revenue.

## Decisions only you can make
- **Free-first (freemium) vs. paid-from-day-one?** Recommend **freemium** with a watermark — your local-first
  try-before-signup funnel is already built for it.
- **Paddle vs. Stripe?** Recommend **Paddle** (MoR) for a solo founder unless you want to own tax/compliance.
- **Where do scenes live** — Postgres JSON vs. R2 blobs? Recommend **metadata in Postgres, scene JSON in R2**
  (cheap, scales, keeps Postgres lean).
- **AI pricing** — credits vs. unlimited-on-tier? Recommend **credits** (bounds your Anthropic cost per user).

## Effort / leverage summary
| Phase | Rough effort | Leverage | Needs backend |
|---|---|---|---|
| 0 Harden | 1–2 wks | Very high (de-risks all) | No |
| 1 Auth | 2–4 wks | Foundational | Yes (Supabase Auth) |
| 2 Cloud/media | 3–5 wks | High (the "reusable" promise) | Yes (Supabase + R2) |
| 3 Billing | 2–3 wks | High (revenue) | Yes (Paddle + edge fns) |
| 4 AI | 1–2 wks | High (premium lever; engine done) | Yes (key proxy) |
| 5 GTM | 2–3 wks | High (acquisition + legal gate) | Partial |
| 6 Growth | ongoing | Compounding | Mixed |

*Estimates assume a solo founder and are relative, not commitments.*
