# FlashFX Link (flashfx-mcp)

Connect your own Claude to the FlashFX motion-graphics editor. Claude builds the animation, FlashFX renders
it, and the project stays fully editable in your editor.

- Install guide for everyone (Claude Desktop and Claude Code, Mac and Windows): `docs/MCP-QUICKSTART.md`
  in the FlashFX repository (published at flashfx.app/mcp).
- Runs on **your own Claude plan**. FlashFX never holds, sees or pays for an Anthropic key.
- Claude Code: `claude mcp add flashfx -- npx -y flashfx-mcp`
- Claude Desktop: double-click `flashfx.mcpb`.

This folder is generated: `npm run mcp:package` in the repo bundles `mcp/` into `server/index.mjs`, copies the
taste docs, recipes, skill and access allowlist, and zips `flashfx.mcpb`. Only `package.json`,
`manifest.json`, this README and `.gitignore` are committed.

License: PolyForm Noncommercial 1.0.0 for the source (see LICENSING.md in the repo). Commercial use needs a
FlashFX commercial license (the Founding Member seat).
