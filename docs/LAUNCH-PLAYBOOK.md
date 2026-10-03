# FlashFX launch playbook

Everything needed to launch FlashFX publicly and get technical people talking: the assets, the posts,
the checklist, the timing, and the repo polish. The strategy is simple - **make it technically
undeniable**, then put it in front of the rooms where that is rewarded.

- **Live demo:** https://editor.flashfx.app
- **Repo:** https://github.com/gabrielebolognese/FlashFX-v2

---

## 0. Before you post (do NOT skip)

These convert attention into stars. A front-page spot wasted on an unpolished repo is gone for good.

- [ ] **Demo GIF in the README.** The #1 driver of stars - people decide from the GIF without cloning.
      Record ~15s showing the cloner + physics + an AI build (prompt -> editable scene). Save as
      `docs/demo.gif` (the README already references it). Keep it under ~8MB so it loads.
- [ ] **Pick a LICENSE.** No license = "all rights reserved" = suppresses stars and blocks contribution.
      This is a business decision:
      - *Permissive (MIT / Apache-2.0):* max stars, but allows commercial forks.
      - *Source-available (BSL / PolyForm / Elastic):* protects the product, code stays readable, still
        gets stars. Good fit for a commercial SaaS with a public repo.
      Decide deliberately, then add a `LICENSE` file and update the README's License section.
- [ ] **Verify the README claims** are accurate and nothing overstates (the HN/Reddit crowd checks).
- [ ] **Set the repo description + topics** (discovery signal - see section 4).
- [ ] Make sure the live demo loads with **no sign-up** and does not crash on first paint.
- [ ] CI is green (the README badge should be passing).

## 1. The one-liner

> A WebGPU motion-graphics studio in the browser - keyframes, expressions, MoGraph, 2D physics, and AI
> that generates editable scenes. Built solo.

## 2. Hacker News - "Show HN" (your best shot)

Post a **Show HN**, then immediately post the first comment yourself (HN convention; it is where the
discussion starts). Be present to answer **every** comment for the first few hours - engagement drives
ranking. Best time: a **weekday morning, US Eastern** (roughly 8-10am ET).

**Title** (pick one; plain beats hype on HN):

- `Show HN: FlashFX – a WebGPU motion-graphics studio in the browser`
- `Show HN: After Effects/C4D-style motion graphics in the browser, on WebGPU`
- `Show HN: Browser motion-graphics engine on WebGPU, with AI that edits scenes`

**First comment** (paste after submitting):

> Hi HN. FlashFX is a motion-graphics editor that runs entirely in the browser on WebGPU - closer to
> After Effects + Cinema 4D MoGraph than to the usual web trim-and-caption tools. Live, no sign-up to
> look: https://editor.flashfx.app
>
> I built it solo. The UI is React, but everything that matters - compositing, animation evaluation,
> effects, video decode, export - runs in a WebGPU + Web Worker runtime on an OffscreenCanvas. No WebGL
> fallback; it's GPU-first.
>
> The parts I found hardest / most interesting:
> - A WebGPU 2D compositor with a multipass pipeline (isolated layer passes, premultiplied-over blend,
>   pooled render targets). There aren't many open examples of this.
> - Frame-purity: the timeline scrubs non-sequentially, so the renderer and every procedural system
>   (a C4D-style cloner, particles, Rapier 2D physics, expressions) has to be byte-identical for a given
>   frame. Randomness is seeded; Math.random/Date are banned in the pure paths.
> - A WebCodecs decode pool with a present-on-clock scheduler and hard memory caps, because naive
>   WebCodecs usage stalls the hardware decoder's output pool and freezes playback.
> - An AI pipeline that outputs an *editable* scene (planner -> deterministic compiler -> real
>   layers/keyframes you can tweak), rather than a black-box clip.
>
> Honest caveats: it needs a Chromium-based browser with WebGPU, it's pre-launch, and there are rough
> edges - very much a work in progress.
>
> I'd love feedback from graphics/WebGPU/motion-design folks especially: the rendering approach, the
> frame-purity constraints, the WebCodecs scheduling, or just whether it feels good to use. Repo:
> https://github.com/gabrielebolognese/FlashFX-v2
>
> Happy to go deep on any of the internals. Architecture writeup: (link the blog post / ARCHITECTURE.md)

## 3. Other rooms (same day or staggered)

Tailor the angle to each audience; do not cross-post the identical text.

| Where | Angle |
|-------|-------|
| **r/webgpu**, **r/GraphicsProgramming** | the WebGPU compositor + frame-purity + WebCodecs scheduling |
| **r/javascript**, **r/webdev** | "an AE/C4D-class engine in the browser, no install" + the live demo |
| **r/motiondesign** | the actual tool: cloner, kinetic type, the AI editable-scene flow (users, not devs) |
| **r/SideProject**, **r/sideproject** | the solo-founder build story + demo |
| **Lobsters** | the technical writeup (tag: graphics, javascript) |
| **X / Bluesky** (dev-graphics) | a short thread: a hard problem solved (frame-purity, the decoder-pool stall) + a clip |
| **Product Hunt** | the product launch (schedule 12:01am PT; line up a few early supporters) |
| **WebGPU / graphics Discords** | share the demo where the people who will *get it* hang out |

## 4. Repo polish commands

Set the GitHub repo description + topics (improves discovery and trending). With the GitHub CLI:

```bash
gh repo edit gabrielebolognese/FlashFX-v2 \
  --description "A WebGPU motion-graphics studio in the browser: keyframes, expressions, MoGraph, 2D physics, and AI that generates editable scenes." \
  --homepage "https://editor.flashfx.app" \
  --add-topic webgpu --add-topic motion-graphics --add-topic animation \
  --add-topic video-editor --add-topic webcodecs --add-topic mograph \
  --add-topic creative-coding --add-topic typescript --add-topic react
```

(Or do it in the GitHub UI: repo home -> the gear next to "About" -> set description, website, topics.)

A pinned, well-written **first issue** labeled `good first issue` or a short roadmap also signals a live
project.

## 5. The technical blog post (converts a spike into lasting stars)

A front-page HN spot is a spike; a deep technical writeup is what people bookmark, share, and star
*later*. Use [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) as the base and expand one angle into a narrative
post (dev.to / your blog, then link it from the HN thread and the subreddits). Strongest single angles:

- **"Frame-purity: making a browser motion engine byte-identical under random scrubbing."** The seeded
  randomness, the baked physics, the pure `resolveFrame`, why export matches preview.
- **"A WebGPU 2D compositor: multipass, premultiplied-over, pooled targets."**
- **"Why naive WebCodecs freezes, and the present-on-clock scheduler that fixes it."**
- **"An AI that outputs editable scenes, not video: a deterministic plan -> compiler pipeline."**

## 6. Build-in-public (ongoing)

Between launches, post the *hard problems* as you solve them - war stories spread among devs. Each of
the blog angles above is also a tweet/Bluesky thread. Short clips of the tool (and of Flash, the
in-editor character) are native, shareable content.

---

## The honest bar

Do not buy or trade stars - the HN/Reddit crowd detects it and it torches credibility. Do not overclaim;
the demo and the code are public, so every claim is checkable. "Technically undeniable" means the thing
actually is good and the writeup proves it - that is the whole strategy.
