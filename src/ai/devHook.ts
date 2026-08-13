// DEV-ONLY visual hook. Import once from main.tsx (guarded by import.meta.env.DEV). Then, in the
// browser console with a project open:
//     __aiCompile()            // compiles + commits the 'showreel' fixture into the active comp
//     __aiCompile('showreel')  // same, explicit
// It commits as ONE undo step (Ctrl+Z reverts). The compiled report is logged so you can read what
// assembly did and could not do. This is the "look at it on the canvas" deliverable's trigger.

import { compile } from './index';
import { commitAiComposition } from './commit';
import { FIXTURES } from './fixtures';

declare global {
  interface Window {
    __aiCompile?: (name?: string) => void;
    __aiFixtures?: string[];
  }
}

export function installAiDevHook(): void {
  if (typeof window === 'undefined') return;
  window.__aiFixtures = Object.keys(FIXTURES);
  window.__aiCompile = (name = 'showreel') => {
    const fx = FIXTURES[name];
    if (!fx) { console.error(`[ai] no fixture '${name}'. Try: ${Object.keys(FIXTURES).join(', ')}`); return; }
    const result = compile(fx.director, fx.fragments, { fps: 30, tier: 'pro', seed: 1 });
    console.log(`[ai] compiled '${name}':`, result.report);
    if (result.report.issues.length) console.table(result.report.issues);
    commitAiComposition(result.composition, result.styles, result.aiMeta as unknown as Record<string, unknown>);
    console.log(`[ai] committed '${name}' — ${result.report.stats.layers} layers, ${result.report.stats.clonersBuilt} cloner(s). Ctrl+Z to undo.`);
  };
  console.log(`[ai] dev hook ready — __aiCompile(${Object.keys(FIXTURES).map((n) => `'${n}'`).join(' | ')})`);
}
