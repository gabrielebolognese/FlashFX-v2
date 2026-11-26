// Chrome / Chromium / Edge finder shared by the MCP server (headless mode) and the gpu:* harnesses
// (scripts/lib/headless-gpu.mjs re-exports it). Lives in mcp/ so the packaged server (packages/flashfx-mcp)
// bundles without reaching into scripts/.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A Chrome/Chromium/Edge binary, or null. `CHROME_PATH` wins. */
export function findChrome() {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}
