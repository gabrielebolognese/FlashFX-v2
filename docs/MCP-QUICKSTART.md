# FlashFX Link: connect Claude to FlashFX (quickstart)

FlashFX Link lets **your own Claude** build motion graphics in **your own FlashFX editor**. You type what you
want in Claude ("a 5-second gold title that says Hello World"), Claude builds it in the FlashFX tab in your
browser, and you can watch, pause, and change anything by hand. The result is a normal FlashFX project:
every layer and keyframe stays editable.

- **It runs on your Claude plan.** FlashFX never asks for, holds or pays for a Claude or Anthropic key. Claude
  does the thinking on your account; FlashFX only provides the tools and the motion recipes.
- **Your projects stay yours.** They are saved in your browser's FlashFX project list, like any project you make
  by hand. Exports (MP4 videos and editable `.ffx` project files) go to a folder on your computer.
- **About 10 minutes** the first time.

---

## What you need

| | Mac | Windows |
| --- | --- | --- |
| Claude | Claude Desktop (any plan, Free works; Pro or Max recommended for long builds) or Claude Code | same |
| Browser | Google Chrome or Microsoft Edge (Safari and Firefox are not supported yet) | Chrome or Edge (Edge is already installed on every Windows PC) |
| FlashFX | The free editor at [editor.flashfx.app](https://editor.flashfx.app), no account needed | same |
| Access code | Optional. Without one, FlashFX Link runs in personal mode (see the table below) | same |

---

## Option 1: Claude Desktop (recommended, no technical steps)

1. **Install Claude Desktop** from [claude.ai/download](https://claude.ai/download) and sign in.
2. **Download FlashFX Link**: the file `flashfx.mcpb` (from the link in your FlashFX welcome email, or from
   flashfx.app/mcp).
3. **Install it**: double-click `flashfx.mcpb`. If that does not open Claude, open Claude Desktop, go to
   **Settings > Extensions** and drag the file into the window. Click **Install**.
   - Claude may say the extension is not from its directory. That is expected (FlashFX distributes it
     directly): click **Install** anyway.
4. **Settings** (in the same window, you can change them later in Settings > Extensions > FlashFX Link):
   - **FlashFX access code**: paste the code from your email, or leave it empty for personal mode.
   - **Output folder**: where your videos and project files are saved. The default is `FlashFX/exports` in your
     home folder.
5. **Start a new chat** in Claude and type:

   > Use FlashFX to make a 5-second title that says Hello World, gold on black.

6. **Connect**: Claude opens FlashFX in your browser. A card appears in the bottom-right corner: **Connect
   Claude to this editor**. Click **Connect**.
   - Your browser may ask to let the page **access apps or devices on your local network / this device**.
     Click **Allow**. You only do this once.
7. **Watch it build.** A small banner says *Claude is building in this editor*. When Claude is done, the
   project is in your FlashFX project list. Ask Claude for changes ("make it faster", "add my logo") or edit
   it yourself. Ask Claude to **export the MP4** and **save the project file** when you are happy.

## Option 2: Claude Code (terminal)

You need [Node.js 22 or newer](https://nodejs.org) and Claude Code.

**Mac** (Terminal):

```bash
claude mcp add flashfx -e FLASHFX_ACCESS_CODE=your-code -- npx -y flashfx-mcp --mode auto
```

**Windows** (PowerShell or Command Prompt):

```bash
claude mcp add flashfx -e FLASHFX_ACCESS_CODE=your-code -- cmd /c npx -y flashfx-mcp --mode auto
```

Leave out `-e FLASHFX_ACCESS_CODE=your-code` for personal mode. Then start `claude` and ask the same thing
as in step 5 above; steps 6 and 7 are the same.

Optional extras:

- Pick the output folder: add `-e FLASHFX_OUTPUT_DIR=/path/to/folder`.
- Install the FlashFX motion skill so Claude plans pieces the FlashFX way: copy the `skill/flashfx-motion`
  folder of the package (or `mcp/skill/flashfx-motion` in the FlashFX repo) to `~/.claude/skills/`.
- Slash commands: `/mcp__flashfx__motion-brief` (brief to finished video) and `/mcp__flashfx__taste`.

## Option 3: from the FlashFX source (developers)

```bash
git clone https://github.com/gabrielebolognese/FlashFX-v2 && cd FlashFX-v2 && npm ci
claude mcp add flashfx -- node "$PWD/mcp/flashfx-mcp.mjs" --mode tab
```

`--mode headless` (the default from source) launches its own Chrome instead of using your tab; see
`mcp/README.md`. The source is licensed for personal, non-commercial use (LICENSING.md).

---

## Personal mode and early access

| | Personal mode (no code) | Early access (with a code) |
| --- | --- | --- |
| Build in your editor (create projects, every editor action, undo / redo) | Yes | Yes |
| Look at the result (`screenshot`) | Yes | Yes |
| Export MP4 and save the editable project | Yes | Yes |
| Motion recipes | 3 starters: background, kinetic title, pop-in | All 12 (blur-in, type-on, prompt bar, scene camera, shape morph, transitions, end card, ...) |
| Full-resolution frame checks (`render_frame`, `render_strip`) | No | Yes |
| Commercial use | No (personal projects) | Yes |

Ask Claude "what is my FlashFX Link status?" at any time: it shows the connection, your access mode and the
output folder.

---

## Safety: what FlashFX Link can and cannot do

- It only talks to the FlashFX tab on **your computer** (a local connection on `127.0.0.1`). Nothing is
  exposed to the internet.
- It only accepts the real FlashFX editor page, and only after **you** click Connect. The connection link
  works once.
- Claude can only use FlashFX's own editor actions (the same ones the buttons use). It cannot run code in
  your browser or read other tabs.
- It only writes files inside your **output folder**.
- **Pause** (in the banner) stops Claude's actions instantly; **Disconnect** ends the connection.
- No Claude or Anthropic key is involved, and FlashFX does not see your chats.
- Privacy: in this early-access version the access code is checked on your computer. When the online
  check is switched on, FlashFX Link will send your code and its version once a day (no project content) so
  we can count active builders; this page will say so before it happens.

---

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No FlashFX tab opened | Ask Claude for "the FlashFX Link status": it gives you the connection link. Open it in Chrome or Edge. |
| The Connect card does not appear | Make sure the tab is `editor.flashfx.app` and reload it. Ask Claude for a fresh link if needed. |
| "Could not reach FlashFX Link on this computer" | Your browser blocked the local connection. Click the icon at the left of the address bar, open **Site settings**, allow access to apps on this device (local network), then ask Claude to connect again. |
| "This connection link has expired" | Each link works once. Ask Claude to connect again; it makes a new link. |
| "Claude is already connected to another FlashFX tab" | Use the tab that is already connected, or click Disconnect there first. |
| Claude says the tab did not answer | Bring the FlashFX tab to the front (a minimised window can be slowed down by the browser). |
| "The connected FlashFX editor is older" | Reload the editor tab. |
| Safari or Firefox | Not supported yet. Use Chrome or Edge; FlashFX Link can also open its own FlashFX window if no tab connects within 2 minutes. |
| Uninstall | Claude Desktop: Settings > Extensions > FlashFX Link > Uninstall. Claude Code: `claude mcp remove flashfx`. |

---

## For the FlashFX team (release notes, not for users)

- Status (2026-11-26): v1 is implemented behind feature flags and proven end to end by `npm run gpu:bridge`
  (see the result in the task artifacts). It is **not live** until a release does all of: build the editor
  with `VITE_FFX_LINK=1` (Netlify environment variable) and deploy it to editor.flashfx.app; publish
  `packages/flashfx-mcp` to npm as `flashfx-mcp`; host `flashfx.mcpb` at flashfx.app/mcp with its checksum.
  All three are owner-approved release actions.
- Build the package: `npm run mcp:package` (writes `packages/flashfx-mcp/server/`, `recipes/`, `skill/`,
  `access/` and `flashfx.mcpb`).
- Issue an access code: `node scripts/mcp-access-code.mjs --kind early --label early-01 --add`, rebuild the
  package, send the printed code to the user once. Labels are public: never an email. The Supabase
  `mcp_access` table and `mcp-entitlement` function exist in the repo but are not deployed; once they are,
  set `FLASHFX_ENTITLEMENT_URL` in the package to switch from the bundled allowlist to the online check.
- Not verified yet: Chrome's Local Network Access prompt from the public `https://editor.flashfx.app` origin
  to `ws://127.0.0.1` (the harness runs the editor on localhost, where no prompt applies), Claude Desktop's
  exact install screens for a self-distributed `.mcpb`, and a cold install on a Mac.
