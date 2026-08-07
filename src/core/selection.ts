import type { Layer, Vec4, LayerShadow, LayerGlow, LayerBlur } from './types';

// M12 — selection accelerators. Pure selection-model logic:
//  • select-all-with-same (fill / stroke / font / effect / type) — the batch-restyle enabler
//  • deep-select + group-isolation resolvers (plain click = top group, Ctrl/Cmd click = leaf,
//    double-click / Enter descend one level, Shift+Enter ascend).
// Kept dependency-free (only ./types) so scripts/verify-selection.mjs bundles with no engine/DOM
// stub — the graph walks below are re-implemented rather than imported from sceneGraph.ts, which
// pulls in engine/textAtlas. Proven by scripts/verify-selection.mjs.

export type SameAttr = 'type' | 'fill' | 'stroke' | 'font' | 'effect';

// ── tiny pure graph walks ──
function parentOf(id: string, layers: Layer[]): string | null {
  return layers.find((l) => l.id === id)?.parentId ?? null;
}
/** Ancestor ids, innermost parent → outermost root. */
function ancestors(id: string, layers: Layer[]): string[] {
  const map = new Map(layers.map((l) => [l.id, l]));
  const out: string[] = [];
  let cur = map.get(id);
  while (cur?.parentId) { out.push(cur.parentId); cur = map.get(cur.parentId); }
  return out;
}
function childrenOf(pid: string, layers: Layer[]): Layer[] {
  return layers.filter((l) => l.parentId === pid);
}
function isDescendantOf(id: string, ancestorId: string, layers: Layer[]): boolean {
  return ancestors(id, layers).includes(ancestorId);
}
function isGroup(id: string, layers: Layer[]): boolean {
  return layers.find((l) => l.id === id)?.type === 'group';
}

// ── group-path helpers ──
/** The group-ancestor ids of a leaf, OUTERMOST → innermost. */
export function getGroupPath(leafId: string, layers: Layer[]): string[] {
  return ancestors(leafId, layers).filter((id) => isGroup(id, layers)).reverse();
}
/** The outermost group a leaf belongs to (what a plain click selects), or null if ungrouped. */
export function getTopLevelGroupAncestor(leafId: string, layers: Layer[]): string | null {
  return getGroupPath(leafId, layers)[0] ?? null;
}
/** The id ONE level below `scopeGroupId` on the path toward `leafId`. Scope null → the leaf's
 *  top-level group (else the leaf itself); otherwise the ancestor whose parent is the scope. */
export function getChildOnPath(scopeGroupId: string | null, leafId: string, layers: Layer[]): string {
  if (scopeGroupId === null) return getTopLevelGroupAncestor(leafId, layers) ?? leafId;
  let cur = leafId;
  // Walk up from the leaf until we find the node whose parent is the scope.
  for (let guard = 0; guard < 1000; guard++) {
    const p = parentOf(cur, layers);
    if (p === scopeGroupId) return cur;
    if (p === null) break;
    cur = p;
  }
  return leafId; // leaf isn't under scope
}

// ── click / double-click / Enter resolvers ──
export interface ClickResult { selectId: string | null; activeGroupId: string | null; }

/** Resolve a single canvas click. deepSelect (Ctrl/Cmd) picks the leaf directly; plain click
 *  picks the enclosing top-level group; inside an isolation scope it picks the child one level
 *  toward the leaf, or exits if the click landed outside the scope. */
export function resolveCanvasClick(p: {
  leafId: string | null; deepSelect: boolean; activeGroupId: string | null; layers: Layer[];
}): ClickResult {
  const { leafId, deepSelect, activeGroupId, layers } = p;
  if (!leafId) return { selectId: null, activeGroupId: null };
  if (deepSelect) return { selectId: leafId, activeGroupId }; // pick deepest, scope unchanged
  if (activeGroupId) {
    const inScope = leafId === activeGroupId || isDescendantOf(leafId, activeGroupId, layers);
    if (inScope) return { selectId: getChildOnPath(activeGroupId, leafId, layers), activeGroupId };
    return { selectId: getTopLevelGroupAncestor(leafId, layers) ?? leafId, activeGroupId: null }; // exit
  }
  return { selectId: getTopLevelGroupAncestor(leafId, layers) ?? leafId, activeGroupId: null };
}

/** Resolve a double-click: descend exactly ONE nesting level toward the leaf. If the child on
 *  the path is a group, enter it; otherwise (already the deepest leaf) just select, no descend. */
export function resolveDoubleClick(p: {
  leafId: string | null; activeGroupId: string | null; layers: Layer[];
}): ClickResult {
  const { leafId, activeGroupId, layers } = p;
  if (!leafId) return { selectId: null, activeGroupId };
  const childId = getChildOnPath(activeGroupId, leafId, layers);
  if (isGroup(childId, layers)) {
    return { selectId: getChildOnPath(childId, leafId, layers), activeGroupId: childId };
  }
  return { selectId: childId, activeGroupId };
}

/** Enter: if the active layer is a group, isolate it and select its first child. Null if the
 *  active layer isn't a group (so the caller falls through to other Enter handlers). */
export function resolveEnterStep(p: { activeId: string | null; layers: Layer[] }): ClickResult | null {
  const { activeId, layers } = p;
  if (!activeId || !isGroup(activeId, layers)) return null;
  return { selectId: childrenOf(activeId, layers)[0]?.id ?? null, activeGroupId: activeId };
}

/** Shift+Enter / ascend: select the parent group of the active node, scope its grandparent.
 *  At the root, exits isolation entirely. */
export function resolveExitStep(p: { activeId: string | null; activeGroupId: string | null; layers: Layer[] }): ClickResult {
  const ref = p.activeId ?? p.activeGroupId;
  const parent = ref ? parentOf(ref, p.layers) : null;
  if (!parent) return { selectId: null, activeGroupId: null };
  return { selectId: parent, activeGroupId: parentOf(parent, p.layers) };
}

// ── attribute extraction + matching (select-all-with-same) ──
export function vec4Eq(a: Vec4 | null, b: Vec4 | null, eps = 1e-4): boolean {
  if (a === null || b === null) return a === b;
  for (let i = 0; i < 4; i++) if (Math.abs((a[i] + 0) - (b[i] + 0)) > eps) return false;
  return true;
}

export function getLayerFill(l: Layer): Vec4 | null {
  if (l.type === 'shape') return l.shape.fillColor;
  if (l.type === 'text') return l.content.spans[0]?.style.color ?? null;
  return null;
}
export function getLayerStroke(l: Layer): Vec4 | null {
  if (l.type === 'shape') return l.shape.strokeColor;
  if (l.type === 'text') return l.content.spans[0]?.style.strokeColor ?? null;
  return null;
}
export function getLayerFont(l: Layer): string | null {
  if (l.type === 'text') return l.content.spans[0]?.style.fontFamily ?? null;
  return null;
}
/** A canonical signature of a layer's ENABLED effects (sorted kinds), '' when it has none. */
export function getLayerEffectSig(l: Layer): string {
  const rec = l as unknown as Record<string, unknown>;
  const s = rec.shadow as LayerShadow | undefined;
  const g = rec.glow as LayerGlow | undefined;
  const b = rec.blur as LayerBlur | undefined;
  const kinds: string[] = [];
  if (s?.enabled) kinds.push('shadow');
  if (g?.enabled) kinds.push('glow');
  if (b?.enabled) kinds.push('blur');
  return kinds.sort().join(',');
}

export function layerMatchesAttr(cand: Layer, ref: Layer, attr: SameAttr): boolean {
  switch (attr) {
    case 'type': return cand.type === ref.type;
    case 'fill': { const r = getLayerFill(ref), c = getLayerFill(cand); return r !== null && c !== null && vec4Eq(r, c); }
    case 'stroke': { const r = getLayerStroke(ref), c = getLayerStroke(cand); return r !== null && c !== null && vec4Eq(r, c); }
    case 'font': { const r = getLayerFont(ref), c = getLayerFont(cand); return r !== null && c !== null && r === c; }
    case 'effect': return getLayerEffectSig(cand) === getLayerEffectSig(ref);
  }
}

/** Which same-attrs the layer can actually provide (drives the context-menu submenu). */
export function availableSameAttrs(l: Layer): SameAttr[] {
  const out: SameAttr[] = ['type'];
  if (getLayerFill(l) !== null) out.push('fill');
  if (getLayerStroke(l) !== null) out.push('stroke');
  if (getLayerFont(l) !== null) out.push('font');
  if (getLayerEffectSig(l) !== '') out.push('effect');
  return out;
}

/** All layer ids sharing `attr` with the reference (which is always included). Skips locked/hidden
 *  layers and any kind that can't provide the attribute. Deterministic (composition order). */
export function selectSameLayers(layers: Layer[], referenceId: string, attr: SameAttr): string[] {
  const ref = layers.find((l) => l.id === referenceId);
  if (!ref) return [];
  const out: string[] = [];
  for (const l of layers) {
    if (l.id === referenceId) { out.push(l.id); continue; }
    if (l.visible === false || l.locked === true) continue;
    if (layerMatchesAttr(l, ref, attr)) out.push(l.id);
  }
  return out;
}
