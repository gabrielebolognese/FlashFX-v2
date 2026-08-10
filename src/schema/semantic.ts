import type { DirectorOutput } from './pipeline';

// The seed of the SEMANTIC validator: cross-panel / cross-field rules that Zod deliberately does not
// express (they are referential or span multiple objects). These run AFTER structural parse, on the
// Director output, and REPORT problems — the caller decides what to do (auto-fix is a later stage).
// The same rules are hard prompt rules; this is their machine enforcement.
//
// Rules covered here:
//   1. Beat alignment — every plan timestamp is an integer multiple of the style-contract beat.
//   2. Contiguity — panels are ordered 0..n-1, start at 0, and are gapless & non-overlapping.
//   3. Duration — the last panel ends exactly at brief.durationMs (the plan sums to the whole).
//   4. Element ownership — an element id is DECLARED once (in the panel where it first appears);
//      carried elements appear only in inbound/outbound present-lists, never re-declared.
//   5. Format mirrors the canvas — brief.format matches the preflight canvas, never invented.

export interface SemanticIssue {
  severity: 'error' | 'warn';
  code: string;
  message: string;
  panelId?: string;
  elementId?: string;
}

export interface DirectorCanvas { width: number; height: number }

export function formatForCanvas(c: DirectorCanvas): 'landscape' | 'portrait' | 'square' {
  if (c.width > c.height) return 'landscape';
  if (c.height > c.width) return 'portrait';
  return 'square';
}

/**
 * Validate a (structurally-parsed) Director output. Pass the preflight `canvas` to also enforce the
 * format-mirror rule. Returns every issue found (does not stop at the first).
 */
export function validateDirectorPlan(director: DirectorOutput, opts: { canvas?: DirectorCanvas } = {}): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const err = (code: string, message: string, extra: Partial<SemanticIssue> = {}) => issues.push({ severity: 'error', code, message, ...extra });

  const beat = director.styleContract.beatMs;
  const duration = director.brief.durationMs;
  const panels = [...director.panelPlan].sort((a, b) => a.order - b.order);

  // 5. format mirrors the canvas.
  if (opts.canvas) {
    const expected = formatForCanvas(opts.canvas);
    if (director.brief.format !== expected) {
      err('format-mismatch', `brief.format '${director.brief.format}' must mirror the ${opts.canvas.width}×${opts.canvas.height} canvas ('${expected}'), not be invented`);
    }
  }

  // 1. beat alignment (durationMs + every panel boundary + every transition duration).
  const aligned = (ms: number) => beat > 0 && ms % beat === 0;
  if (!aligned(duration)) err('duration-off-beat', `brief.durationMs ${duration} is not a multiple of the beat ${beat}`);
  for (const p of panels) {
    if (!aligned(p.startMs)) err('panel-off-beat', `panel '${p.id}' startMs ${p.startMs} is not a multiple of the beat ${beat}`, { panelId: p.id });
    if (!aligned(p.endMs)) err('panel-off-beat', `panel '${p.id}' endMs ${p.endMs} is not a multiple of the beat ${beat}`, { panelId: p.id });
    if (p.transitionIn && !aligned(p.transitionIn.duration)) {
      err('transition-off-beat', `panel '${p.id}' transition duration ${p.transitionIn.duration} is not a multiple of the beat ${beat}`, { panelId: p.id });
    }
  }

  // 2. contiguity: orders 0..n-1 unique, first starts at 0, each end == next start, non-overlapping.
  panels.forEach((p, i) => {
    if (p.order !== i) err('panel-order', `panel '${p.id}' has order ${p.order}; expected ${i} (orders must be 0..n-1, unique, gapless)`, { panelId: p.id });
    if (p.endMs <= p.startMs) err('panel-empty', `panel '${p.id}' end ${p.endMs} <= start ${p.startMs}`, { panelId: p.id });
  });
  if (panels.length && panels[0].startMs !== 0) err('plan-start', `first panel '${panels[0].id}' startMs ${panels[0].startMs} must be 0`, { panelId: panels[0].id });
  for (let i = 0; i < panels.length - 1; i++) {
    if (panels[i].endMs !== panels[i + 1].startMs) {
      err('panel-gap', `seam '${panels[i].id}'→'${panels[i + 1].id}': end ${panels[i].endMs} != next start ${panels[i + 1].startMs} (panels must be contiguous & gapless)`, { panelId: panels[i].id });
    }
  }

  // 3. duration: the plan spans exactly brief.durationMs.
  if (panels.length) {
    const last = panels[panels.length - 1];
    if (last.endMs !== duration) err('duration-mismatch', `last panel '${last.id}' ends at ${last.endMs}, not brief.durationMs ${duration} (the plan must sum to the whole)`, { panelId: last.id });
  }

  // 4. element ownership: each element id is declared in exactly one panel's `elements` list.
  const declaredIn = new Map<string, string>();
  for (const p of panels) {
    for (const el of p.elements) {
      const prev = declaredIn.get(el.id);
      if (prev && prev !== p.id) {
        err('element-double-declared', `element '${el.id}' is declared in both panel '${prev}' and '${p.id}'; declare it once (in its first panel) and carry it via present-lists only`, { panelId: p.id, elementId: el.id });
      } else {
        declaredIn.set(el.id, p.id);
      }
    }
  }

  // 6. element ids are namespaced to the owning (declaring) panel: `p<order>:...`. Carried elements
  //    keep their original namespace, so this only checks each panel's OWN `elements` declarations.
  for (const p of panels) {
    const prefix = `p${p.order}:`;
    for (const el of p.elements) {
      if (!el.id.startsWith(prefix)) {
        err('id-namespace', `element '${el.id}' declared in panel '${p.id}' must be namespaced '${prefix}…'`, { panelId: p.id, elementId: el.id });
      }
    }
  }

  // 7. boundary reconciliation: panel 0 inbound empty; each panel's outbound present-set equals the
  //    next panel's inbound present-set exactly (same shape the assembler reconciles on frames).
  if (panels.length && panels[0].inboundPresent.length) {
    err('boundary-inbound-nonempty', `first panel '${panels[0].id}' inboundPresent must be empty`, { panelId: panels[0].id });
  }
  for (let i = 0; i < panels.length - 1; i++) {
    const out = new Set(panels[i].outboundPresent);
    const inn = new Set(panels[i + 1].inboundPresent);
    const onlyOut = [...out].filter((x) => !inn.has(x));
    const onlyIn = [...inn].filter((x) => !out.has(x));
    if (onlyOut.length || onlyIn.length) {
      err('boundary-mismatch', `seam '${panels[i].id}'→'${panels[i + 1].id}': outbound-only [${onlyOut.join(',')}], inbound-only [${onlyIn.join(',')}] — the two lists must be the same set`, { panelId: panels[i].id });
    }
  }

  // 8. transitions: panel 0 has no transitionIn; a transition's duration ≤ half the shorter of the
  //    two panels it joins (a transition longer than its content becomes the subject).
  if (panels.length && panels[0].transitionIn) {
    err('panel0-transition', `first panel '${panels[0].id}' must not have a transitionIn`, { panelId: panels[0].id });
  }
  for (let i = 1; i < panels.length; i++) {
    const t = panels[i].transitionIn;
    if (!t) continue;
    const shorter = Math.min(panels[i - 1].endMs - panels[i - 1].startMs, panels[i].endMs - panels[i].startMs);
    if (t.duration > shorter / 2) {
      err('transition-too-long', `panel '${panels[i].id}' transition duration ${t.duration}ms exceeds half the shorter joined panel (${shorter / 2}ms)`, { panelId: panels[i].id });
    }
  }

  return issues;
}
