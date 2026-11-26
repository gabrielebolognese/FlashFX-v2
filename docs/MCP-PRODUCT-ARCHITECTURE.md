# FlashFX MCP: product architecture and paywall path (Nov 2026)

**Question:** how will real users, most of them not developers, plug their own Claude into FlashFX, so that
Claude builds the animation, FlashFX renders it and the result stays fully editable, and so that the MCP can be
paywalled later?

**Hard constraint:** users run it on **their own Claude subscription** (Claude Desktop, Claude Code, later
claude.ai custom connectors). **FlashFX never holds or pays for an Anthropic key on this path.** In every option
below the model runs inside the user's Claude client. Our code only exposes tools; it never calls the Claude API.
The managed AI client in the editor (`src/ai/managedClient.ts`, the Flash panel, which runs on our key) is
**not** part of this product and must not be revived for it. Per the strategy decision, the Flash panel points
to the MCP and the founding page instead.

---

## Decision

**Build option B, "FlashFX Link": a local stdio MCP shim plus an editor-tab bridge.** The user's own
`editor.flashfx.app` tab, in their normal browser, connects by WebSocket to the shim on `127.0.0.1`. It is
paired by a one-time token and needs no CDP and no second Chrome. Ship it as **one package with two
installers**:

1. **`flashfx.mcpb`**, a Claude Desktop extension (double-click to install; Claude Desktop ships its own
   Node runtime, so the user installs nothing else), for Mac and Windows.
2. **`npx -y flashfx-mcp`** for Claude Code: `claude mcp add flashfx -- npx -y flashfx-mcp`.

**Keep option A (today's `mcp/`, which launches its own Chrome over CDP) inside the same package as
`--mode headless`**, for three jobs: automation (our own content pipeline, CI, `gpu:*` harnesses), the
fallback when the tab bridge cannot connect (browser without WebGPU, a blocked localhost prompt), and the
**phase 0 bridge to the Dec 2 cold-install gate** (see v1 scope). **Option C (a hosted remote MCP server
over Streamable HTTP, plus an editor-tab relay and Supabase OAuth) is v2.** It is the hard-enforced paid tier
and the claude.ai connector. It reuses B's in-page bridge protocol and tool registry, so B is most of the work C needs (estimate),
not a detour.

Phased:

| Phase | When | What ships | Who uses it |
| --- | --- | --- | --- |
| 0 | Nov 27 to Dec 1 | Today's A, packaged as `flashfx.mcpb` + `npx`, pointed at `https://editor.flashfx.app`, persistent profile, early-access code | Founding members on setup calls; the Dec 2 cold-install gate |
| 1 (v1) | Dec 2 to Dec 7 | B (tab bridge) becomes the default mode in the same package; A stays as `--mode headless` | Founding members, 10 invited early users (milestone `mcp-early-users`) |
| 2 | Once accounts + Paddle are live | Signed entitlement checked by the editor page at pairing; free tier quota; premium recipe packs served by entitlement | Everyone (free + Pro) |
| 3 (v2) | Trigger in "Paywall path" | C: `https://mcp.flashfx.app/mcp`, Supabase OAuth 2.1, relay to the signed-in editor tab | claude.ai and Claude Desktop connector users, locked-down machines |

---

## Reasoning

1. **Non-developers are the buyers, and A is a developer install.** The strategy's primary buyer is a
   Claude-paying creator who "cannot easily set up a local MCP alone" (BUSINESS-STRATEGY.md, Primary offer).
   Today's install needs Node 22, Chrome or Edge, a cloned repo and a terminal command or hand-edited JSON
   (`mcp/README.md`: "Requires Node 22+ and Chrome/Chromium/Edge"; registration uses an absolute repo path).
   Install pain is already a top-5 business risk (risk 4) with its own kill trigger (T5) and a gate: "first
   rendered MP4 in under 20 minutes of hands-on time" (launch gate 2). B packaged as `.mcpb` removes Node,
   the repo, the terminal and JSON editing. What remains is one download, a double-click, a pasted access
   code and one browser "Allow".
2. **The editability guarantee is the product claim, and only B (and C) keep the work in the user's own
   editor.** A runs FlashFX in a separate Chrome with its own profile. By default it is a temp profile,
   **deleted on exit** (`mcp/lib/session.mjs:509`, `rmSync(this.profileDir...)`), so a project Claude built is
   gone when the Claude session ends unless Claude exported a `.ffx`. The user then has to import that file into
   their real editor. Chrome 136+ also refuses `--remote-debugging-port` on the default user profile
   (Chrome blog, see Evidence), so A can **never** drive the user's everyday browser profile, where their
   projects live. With B, Claude builds directly in the user's tab: the project autosaves to their own
   IndexedDB project list, every action is one undo step in their own history, and they can grab the timeline
   mid-build.
3. **B is cheap to build because the runtime is already transport-agnostic.** Everything the MCP does goes
   through `window.__ffxAgent` (`src/agent/runtime.ts`: `listFeatures`, `getState`, `run`, `readExport`,
   `writeUpload`), a whitelist with no eval. The MCP server touches the browser through only **13 session
   methods** (`run` x17 call sites, `state`, `manifest`, `renderFrame`, `renderStrip`, `screenshot`,
   `exportMp4`, `exportProject`, `importFile`, `importFileChunked`, `closeBrowser`, `shutdown`,
   `recentLogs`; counted in `mcp/flashfx-mcp.mjs`). All but `screenshot` already resolve to `__ffxAgent`
   calls. `screenshot` maps to the in-page `agent.renderFrame`, which is the better image anyway (MCP-AUDIT
   F17, B48). So B is a second implementation of one small interface, plus a page-side relay of maybe 200 lines.
   The tool layer, recipes, resources and prompts are untouched.
4. **C is the best end state but the wrong first step.** It has the lowest setup friction (paste a URL into
   Claude's Connectors, available on every Claude plan including Free with one connector) and the only hard
   paywall. But it needs things that do not exist yet: user accounts (the Supabase auth layer is built but
   **dormant**, `docs/AUTH-PLAN.md`), an OAuth 2.1 server (Supabase's is in **beta**), a stateful relay
   (Supabase Edge Functions have wall-clock limits and are not a persistent WebSocket hub), a consent UI, a
   privacy-policy and DPA update (project data would transit our servers), and abuse limits. That is 3 to 4
   weeks, against a first sale due Dec 9 and a cold-install gate due Dec 2. And **C still needs an editor tab
   open on a desktop**, because rendering is client-side WebGPU. Without a cloud GPU farm (rejected below), C's
   advantage over B is "no local install", not "no browser".
5. **The weighted score backs this, and it says when to switch.** See the matrix in Evidence. B 3.90, C 3.85,
   A 2.45. B and C are nearly tied. The gap comes only from time to v1, and C overtakes B as soon as time to v1
   stops mattering. That is exactly the phase 3 trigger.

---

## Evidence

### Internal (files in this repo and the task artifacts)

| # | Fact | Source |
| --- | --- | --- |
| E1 | The MCP works end to end for clean 2D motion: 3 real builds through MCP stdio only, 1080p MP4 + editable `.ffx`, all re-opened. `gpu:mcp` 13 checks, `gpu:agent-runtime` 8/8 | `docs/MCP-AUDIT.md` sections 1-2 |
| E2 | Cold start on the dev server: `create_project` 29-34 s; steady state 25-50 ms per action, export 5-12 s for 4 s of 1080p | MCP-AUDIT F19 |
| E3 | Install requirements today: Node 22+, Chrome/Edge, repo path, `claude mcp add flashfx -- node mcp/flashfx-mcp.mjs` | `mcp/README.md` "Add it to Claude Code" |
| E4 | A's Chrome uses a temp profile deleted on exit unless `--profile` is passed; `--remote-debugging-port` + `--user-data-dir` flags | `mcp/lib/session.mjs:280-291, 509` |
| E5 | Browser surface = 13 session methods; every mutation goes through `window.__ffxAgent.run` (whitelist, no eval) | `mcp/flashfx-mcp.mjs`, `src/agent/runtime.ts:977-990` |
| E6 | The MCP already serves the taste layer: resources `flashfx://taste`, `flashfx://authoring`, `flashfx://recipes`, `flashfx://recipe/{id}`; prompts `motion-brief`, `taste`, `authoring`; tools `list_recipes`, `apply_recipe`; an `instructions` string at initialize | `mcp/flashfx-mcp.mjs:27-38, 593-640`, `mcp/README.md` |
| E7 | Repo-relative coupling that packaging must remove: `session.mjs` imports `../../scripts/lib/headless-gpu.mjs`; `--server dev/dist` assume the repo | `mcp/lib/session.mjs:17` |
| E8 | Production lags the branch: 97 actions live vs 121 on the branch (37 commits behind) | BUSINESS-STRATEGY.md E2 |
| E9 | Accounts: real Supabase Auth + Paddle billing + `subscriptions` table exist but are dormant until env vars are set | `docs/AUTH-PLAN.md` "What actually exists" |
| E10 | Business constraints: primary buyer = non-developer Claude creators; install pain = risk 4; T5 kill trigger; launch gate 2 (cold install < 20 min); north star = weekly active MCP builders | BUSINESS-STRATEGY.md |
| E11 | License: the repo incl. `mcp/` is PolyForm Noncommercial 1.0.0; commercial MCP use needs a commercial license (the founding seat) | `LICENSING.md` on main (commit b2767d7) |
| E12 | npm names `flashfx-mcp`, `flashfx` and `@flashfx/mcp` return 404 (unclaimed packages) on 2026-11-26; the `@flashfx` org itself is unverified | `npm view` run in this step |

### External (checked 2026-11-26)

| # | Fact | Source |
| --- | --- | --- |
| X1 | Chrome 136+ ignores `--remote-debugging-port` on the default user data directory; a non-standard `--user-data-dir` is required | [Chrome blog: remote debugging switches](https://developer.chrome.com/blog/remote-debugging-port) |
| X2 | Chrome Local Network Access: a public site reaching loopback (127.0.0.0/8, localhost) is gated behind a permission prompt (launched Chrome 142). WebSockets are in scope per Chrome's guidance; one third-party post puts WS enforcement at Chrome 147 (unverified). Request it from a user gesture and explain it first | [Chrome LNA guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [Chrome blog](https://developer.chrome.com/blog/local-network-access), [blink-dev Intent to Ship: LNA for WebSockets](https://groups.google.com/a/chromium.org/g/blink-dev/c/O6GMKt44Ups) |
| X3 | claude.ai custom connectors (remote MCP) are available on Free (1 connector), Pro, Max, Team and Enterprise; Claude connects from Anthropic's cloud, so the server must be publicly reachable | [Claude support: custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) |
| X4 | Claude Desktop extensions (`.mcpb`): a zip with the server + `manifest.json`, installed by double-click or drag; Node.js ships with Claude Desktop on macOS and Windows; the extension directory no longer accepts submissions (self-distribution) | [Anthropic: Desktop extensions](https://www.anthropic.com/engineering/desktop-extensions), [MCPB docs](https://claude.com/docs/connectors/building/mcpb), [modelcontextprotocol/mcpb](https://github.com/modelcontextprotocol/mcpb) |
| X5 | Supabase Auth can act as an OAuth 2.1 server with dynamic client registration for MCP; it is in beta and free during beta | [Supabase OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server), [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) |
| X6 | WebGPU: Chrome/Edge (Mac + Windows), Safari 26, Firefox 141 Windows, Firefox 145 macOS on Apple Silicon only | [web.dev: WebGPU in major browsers](https://web.dev/blog/webgpu-supported-major-browsers) |

### Scoring matrix

Scores are 1 (worst) to 5 (best). The weights reflect the goal: non-technical buyers in 14 days, editability
as the core claim.

| Criterion (weight) | A: npx + own Chrome over CDP | B: stdio shim + editor-tab bridge | C: hosted remote MCP + relay |
| --- | --- | --- | --- |
| Non-technical setup friction (25%) | **1**: install Node 22, terminal or JSON, a second Chrome window pops up | **4**: download `.mcpb`, double-click, paste code, click "Allow" once (~5 min) | **5**: paste a URL into Connectors, sign in, open the editor |
| Mac and Windows (10%) | **3**: Chrome/Edge needed; harnesses only proven on Windows; headless WebGPU on Mac unproven | **4**: Desktop bundles Node on both; any WebGPU browser in principle (Chrome/Edge supported, Safari 26 untested) | **5**: any OS with a WebGPU browser, no install |
| Security (15%) | **3**: unauthenticated CDP port on 127.0.0.1 = full control of that Chrome by any local process; isolated profile limits the blast radius | **4**: loopback only, Origin + Host checks, one-time 128-bit token, explicit Allow, visible "connected" banner, same whitelist | **3**: internet-facing endpoint, OAuth tokens, multi-tenant relay; standard but the biggest surface and data leaves the machine |
| Paywall enforceability (15%) | **1**: public source, local process, nothing we serve | **3**: local shim (soft), but the editor page we serve can refuse pairing without a signed entitlement (phase 2) | **5**: every call is server-side and authenticated |
| Running cost (5%) | **5**: EUR 0 | **5**: EUR 0 (static file on Netlify, entitlement function within Supabase free tier) | **3**: an always-on relay plus Realtime/messages quotas; tens of EUR/month at small scale, more as builders grow |
| Time to v1 (15%) | **5**: exists; packaging ~1 day | **3**: ~6 dev days (see v1 scope) | **1**: ~3-4 weeks plus legal/privacy updates |
| Editability guarantee (15%) | **2**: project lives in a separate (by default throwaway) profile; needs a `.ffx` round trip | **5**: built in the user's own tab, autosaved to their project list, native undo | **4**: same as B, but only while a signed-in tab is open; a closed tab = failed calls |
| **Weighted total** | **2.45** | **3.90** | **3.85** |

Sensitivity: if time to v1 weighs 0 (its 15% spread evenly over the others), C scores about 4.33 and B about
4.08, so C wins. That is why C is v2 and why B is built so that C reuses it.

---

## Rejected options

- **A as the product (today's `mcp/` behind `npx`).** Rejected as the default because of friction score 1, the
  temp-profile editability gap (E4) and X1 (it can never drive the user's real browser profile). Kept as
  `--mode headless` and as phase 0, because it exists and works (E1).
- **C as v1.** Rejected for now: it needs dormant accounts (E9), a beta OAuth server (X5), a stateful relay
  and a privacy update, which is 3-4 weeks against Dec 2 / Dec 9. It still needs a desktop tab (rendering is
  WebGPU in the browser). It is v2 with an explicit trigger.
- **Cloud rendering (headless Chrome + GPU servers run the editor for the user).** Rejected: GPU instances
  cost money per user-minute, which breaks "profitable even on thin margins". The user also loses the
  live-in-my-editor experience. It is only worth revisiting for batch "render farm" jobs.
- **A browser extension (Chrome extension + native messaging host).** Rejected: a store review per browser,
  and a native-messaging host still needs a local installer. That is more friction than `.mcpb`, for no
  security gain over an Origin-checked loopback socket.
- **Claude in Chrome / computer use clicking the editor UI.** Rejected: slow, brittle, burns the user's usage
  on screenshots. It also bypasses the action whitelist and the one-undo-step-per-action guarantee. The
  `__ffxAgent` runtime exists precisely to avoid DOM driving.
- **Anything on a FlashFX-held Anthropic key (a "FlashFX AI" that calls Claude for the user).** Rejected by
  the constraint: our cost per build, rate-limit exposure and a collision with the Hera "AI motion designer"
  positioning (strategy decision on the Flash character). The user's subscription pays for the thinking; we
  provide tools and taste.
- **Gumroad's license-key API as the entitlement check.** Rejected as the core: it ties entitlement to the
  fallback payment rail, which Paddle replaces (strategy T1). Our own access codes work for any rail.
  A Gumroad key can be swapped for a FlashFX code by hand.

---

## Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation | What would change the decision |
| --- | --- | --- | --- | --- |
| R1 | Chrome's Local Network Access prompt for `https://editor.flashfx.app` to `ws://127.0.0.1` confuses users or gets denied (X2) | High / medium | The page connects only after the user clicks **Connect Claude** (user gesture); a card explains "your browser will ask to let this page talk to Claude on this computer: click Allow"; if denied, show the exact site-settings path and offer headless mode | If cold installs show more than 1 in 5 users stuck here, move phase 3 (C, no loopback) forward |
| R2 | Background-tab throttling: an editor tab in the background stalls `seek` / `requestAnimationFrame`, so tool calls hang | Medium / high | The bridge uses the offscreen `agent.renderFrame` path for images; the shim time-outs with a clear message ("bring the FlashFX tab to the front"); the `gpu:bridge` harness tests a hidden tab | If offscreen paths still stall in hidden tabs, open the editor as a separate small window (`window.open`) the user leaves visible |
| R3 | Production lags the branch (E8): the tab bridge and the 24 newer actions need a release | High until release / high | The bridge handshake compares the page's manifest version and action list to what the shim needs, then tells Claude "the editor is older, reload or wait"; the release step ships before the gate | None: release is a dependency, not a design choice |
| R4 | Phase 0 / v1 slips past the Dec 2 cold-install gate | Medium / high | Phase 0 (A in `.mcpb`, ~1 day) is enough for the gate; B swaps in through an extension update | If phase 0 also fails the gate, T5 applies: stop selling seats to strangers; setup calls only |
| R5 | The local paywall is bypassable (public repo, local code) | Certain / low-medium | We sell the commercial license (E11), the packaged one-click Link, the setup call, premium recipe updates, and later the hosted connector. Phase 2 moves the check into the page we serve. Pretending local DRM is strong would be dishonest | If bypass shows up in commercial use, enforce the license (it is a license breach) and move Pro features server-side (C) |
| R6 | A malicious site or local process abuses the bridge | Low / medium | The shim binds 127.0.0.1 only and accepts only `Origin: https://editor.flashfx.app` (plus `http://localhost:*` in dev builds). A Host check blocks DNS rebinding. A 128-bit single-use token travels in the URL **fragment** (never sent to Netlify logs). One connection at a time. The page dials only `127.0.0.1` / `localhost` literal ports. Commands stay on the existing whitelist (no eval). The shim restricts writes to the chosen output folder | A security review finding that breaks the Origin model: then require a pairing code typed by the user |
| R7 | `.mcpb` warnings: self-distributed extensions are not in Anthropic's directory (X4), so Claude Desktop may show an "unverified" notice; Windows SmartScreen does not apply (it is a zip opened by Claude) | Medium / low | Host on `flashfx.app/mcp` with a checksum; the install guide shows the notice as expected; sign the bundle when MCPB signing is available | None |
| R8 | npm scope / package names taken before we publish | Low / low | `flashfx-mcp` is unclaimed today (E12); publishing is an owner action (see v1 scope) | Use `flashfx-link` |
| R9 | The user edits while Claude builds and interleaves undo history | Medium / low | A "Claude is building" banner; Claude's actions stay one undo step each; a "Pause Claude" button in the banner drops the pairing | None |
| R10 | Safari / Firefox users: WebSocket-to-loopback or WebGPU behaviour differs (X6) | Medium / low | v1 officially supports Chrome and Edge on Mac and Windows; others fall back to headless mode (which launches Chrome/Edge) | Safari 26 passing `gpu:bridge` adds it to supported |
| R11 | Legal: no lawyer has reviewed PolyForm + hosted-editor terms; access-code data (email + code) is personal data | Medium / medium | Store only the email + a code hash, disclosed in the privacy policy; owner gets a commercialista/lawyer review before billing (phase 2) | A legal opinion that the license split does not hold |

---

## v1 scope

### Phase 0 (Nov 27 to Dec 1, about 1 dev day): today's A, made installable

- `packages/flashfx-mcp/`: esbuild-bundle `mcp/flashfx-mcp.mjs` + `mcp/lib/*` + the Chrome finder into one
  file (removes the `../../scripts` import, E7); ship `TASTE.md`, `AUTHORING.md`, `recipes/`, the skill.
- Defaults: `--url https://editor.flashfx.app --headed`, a **persistent** profile at
  `~/FlashFX/link-profile` (so projects survive), output folder `~/FlashFX/exports`.
- `manifest.json` for `.mcpb` with a `user_config` field "FlashFX access code" (sensitive) and the output folder.
- The early-access check (below), with a 7-day offline grace.

### v1 (Dec 2 to Dec 7, about 6 dev days): B becomes the default mode

| Work item | Est. |
| --- | --- |
| `src/agent/bridge.ts` (page side): reads `#ffx-link=<port>.<token>` from the URL fragment, shows the **Connect Claude** card, dials `ws://127.0.0.1:<port>`, `hello` handshake (bridge version, manifest version, action ids), relays calls to `window.__ffxAgent`, binary chunks for `readExport` / `writeUpload`, "Claude connected / Pause" banner. Installed from `src/main.tsx` next to `installAgentRuntime` | 1.5 d |
| `mcp/lib/tab-session.mjs` (shim side): hand-rolled RFC 6455 server (text + binary frames, no extensions, keeping the zero-dependency rule of `mcp/`), Origin/Host/token checks, a `TabSession` implementing the 13 session methods; opens the default browser at `https://editor.flashfx.app/#ffx-link=...` when no tab is paired | 1.5 d |
| `--mode tab\|headless\|auto` in `flashfx-mcp.mjs`; `auto` = tab, falling back to headless after a clear message | 0.5 d |
| Package + `.mcpb` + `npx` bin (from phase 0) updated | 0.5 d |
| Entitlement stub (Supabase table + edge function + shim check) | 0.5 d |
| `npm run gpu:bridge`: headless Chrome loads the built editor, pairs with the shim, runs the `gpu:mcp` checks over the tab transport, incl. a hidden-tab case; a cold install on one Windows and one Mac machine | 1 d |
| Install guide page `flashfx.app/mcp` + `mcp/INSTALL.md` | 0.5 d |

**Not in v1:** C, accounts, quotas, page-side entitlement verification, premium recipe server, Safari/Firefox
support, Linux.

### Early-access gate (the entitlement stub now)

- Supabase table `mcp_access (code_hash text primary key, email text, kind text check (kind in
  ('founding','early','team')), created_at timestamptz, revoked_at timestamptz)`. RLS: no client access; only
  the edge function (service role) reads it. The founder issues codes by hand for each founding seat and each
  invited early user (milestone `mcp-early-users`).
- Edge function `mcp-entitlement`: `POST {code, client: 'link', version}` returns
  `{ok, kind, features: ['core','recipes','commercial'], minVersion, checkedAt}`. It also logs a daily
  anonymous ping `(code_hash, version, day)`. That ping is the **north-star metric** (weekly active MCP
  builders), disclosed in the install guide.
- The shim checks at startup. If the check passes it caches the result for 7 days (offline grace, so a paying
  user is never locked out by a network blip). With no or invalid code it starts in **personal mode** (see
  the free surface) and tells Claude to tell the user how to get a code. A `minVersion` above the shim's own
  version tells the user to update.

### Setup path for a non-technical user (v1, Claude Desktop, Mac or Windows)

1. Install **Claude Desktop** from claude.ai/download and sign in with your Claude plan (Free works; Pro or Max
   recommended for long builds).
2. Install **Chrome** or **Edge** if you only use Safari or Firefox (Edge is already on every Windows PC).
3. Open the welcome email from FlashFX and click **Download FlashFX Link** (`flashfx.mcpb` from
   `flashfx.app/mcp`).
4. **Double-click** `flashfx.mcpb`. Claude Desktop opens an install window. Click **Install**. (If Claude says the
   extension is not from its directory, that is expected: click Install anyway.)
5. In the same window, paste your **FlashFX access code** from the email and click **Save**.
6. Start a new chat in Claude and type: *"Use FlashFX to make a 5-second title that says Hello World, gold on
   black."*
7. Claude opens `editor.flashfx.app` in your browser. On the **Connect Claude** card, click **Connect**. Your
   browser asks to let the page talk to apps on this device: click **Allow** (once).
8. Watch Claude build it in your editor. When it is done it is in your project list like any project. Change
   anything by hand, or ask Claude for changes. Claude can export the MP4 to your `FlashFX/exports` folder.

Target: under 10 minutes of hands-on time (launch gate 2 allows 20).

**Claude Code (developers):** `claude mcp add flashfx -e FLASHFX_ACCESS_CODE=xxxx -- npx -y flashfx-mcp`,
then the same steps 6-8. Optional: copy `mcp/skill/flashfx-motion` to `~/.claude/skills/`.

**claude.ai in the browser:** not in v1. It needs C (phase 3): *Customize > Connectors > Add custom connector >
`https://mcp.flashfx.app/mcp`*, sign in to FlashFX, keep an editor tab open.

### Taste layer delivery (works in any Claude client)

The taste layer (`mcp/TASTE.md`, `mcp/AUTHORING.md`, the 12 recipes, the `flashfx-motion` skill) goes out
on every MCP channel. Clients differ in which channels they show to the model, so it ships through several:

| Channel | What | Why |
| --- | --- | --- |
| `initialize.instructions` | A generated "taste core" (about 1-2k tokens: ease families as cubic-bezier, durations in frames, stagger, overshoot, margins, type scale, "check with `render_strip` before export, always save the `.ffx`"), built from `TASTE.md` by a script so it never drifts | Clients that honour server instructions (Claude Code does) apply taste without the user doing anything |
| **Tools** `list_recipes` / `apply_recipe` (exist) + a new `get_taste {topic?}` | Recipes as executable moves; taste sections on demand | Tools are the one channel every client exposes to the model, including claude.ai connectors |
| **Resources** `flashfx://taste`, `flashfx://authoring`, `flashfx://recipes`, `flashfx://recipe/{id}` (exist) | Full docs | Users can attach them in Claude Desktop / claude.ai; Claude Code can read them |
| **Prompts** `motion-brief`, `taste`, `authoring` (exist) | Brief-to-video workflow | Slash commands in Claude Code, prompt picker in Desktop / claude.ai |
| **Skill** `flashfx-motion` | Plan, build via recipes, check frames, export | Claude Code (`~/.claude/skills`) and claude.ai custom skills, optional |

All of it is bundled in the package (works offline). From phase 2, **premium recipe packs** are fetched from an
entitlement-gated endpoint and cached. Updates are the paid value; the starter set stays bundled.

---

## Paywall path

### Free vs paid surface

| Surface | Free | Paid (Founding Member now, Pro later) |
| --- | --- | --- |
| Editor at editor.flashfx.app | Everything, commercial use included | Same |
| MCP source in the public repo (`mcp/`, A from source) | Personal, non-commercial (PolyForm, E11) | Commercial license |
| FlashFX Link (packaged, tab bridge) | **Phase 0-1:** personal mode only: core tools (`get_state`, `run_action(s)`, `screenshot`, `export_project`, `export_mp4`) + 3 starter recipes (`background`, `kinetic-title`, `pop-in`) + the taste core. **Phase 2:** the same, plus a monthly quota of paired sessions | All tools incl. `render_frame` / `render_strip`, all 12 recipes + premium packs, commercial license, the setup call, the founders' channel |
| Hosted connector (C) | No | Yes (phase 3) |

Why this split: the owner's model is "free editor, paid MCP". The repo is public, so the free surface must be
honest and useful (it is the top of the funnel for r/ClaudeAI and HN). The paid surface must be things that
cannot be copied by reading the repo: the license, the founder's time, server-delivered recipes and the hosted
connector.

### Enforcement, stage by stage

1. **Now to billing live (phases 0-1): license + access codes.** Commercial use is a license matter. The
   packaged Link's paid tools check the access code (stub above). This is a soft check by design.
2. **Accounts + Paddle live (phase 2): the editor page enforces.** Switch on the dormant Supabase Auth and
   Paddle (`src/auth`, `src/billing`, `subscriptions` table, E9). At pairing, the signed-in tab calls
   `mcp-entitlement` with its Supabase JWT. It receives a short-lived **signed** entitlement (Ed25519; the
   public key is in the page and the shim), hands it to the shim over the pairing channel, and accepts only the
   tools that entitlement allows. Access codes become unnecessary: the signed-in editor *is* the login. Session
   quotas for free users are counted server-side at pairing. Bypassing this means self-hosting the editor from
   source, which the license allows only for non-commercial use.
3. **Phase 3 (C): hard enforcement.** `https://mcp.flashfx.app/mcp` (Streamable HTTP) with Supabase OAuth 2.1
   (dynamic client registration, X5). Every tool call is authenticated and metered server-side. The relay
   routes calls to that user's signed-in editor tab, reusing the v1 bridge protocol (`hello`, `call`, `result`,
   binary chunks). Pro only.

**Phase 3 trigger (any one):** accounts + Paddle are live, **and** either (a) 25 paying MCP users, (b) 5 or more
lost or blocked buyers who could not install a local extension (claude.ai-only, locked-down work machines,
Chromebooks), or (c) the loopback prompt fails more than 1 in 5 cold installs (R1).

**Never:** a FlashFX-held Anthropic key, metered Claude usage billed by us, or a feature that only works through
our model access. If a future feature seems to need one, it is out of scope for the MCP product.

### What would make us change this decision

- Cold installs of B (phase 1) take longer than 20 minutes or fail more than 1 in 5 times: move C forward.
- Anthropic changes `.mcpb` (for example blocks self-distributed extensions): lead with C plus `npx` for Claude
  Code.
- Chrome blocks public-site to loopback WebSockets outright (beyond a prompt): C becomes v1.
- Buyers say they mainly use claude.ai in the browser (pre-sale interviews, T4 b): C becomes the next
  engineering slot after v1.
