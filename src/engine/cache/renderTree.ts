// Cached Render Tree — node model and invalidation engine.
//
// Every renderable layer is represented as a node. A node holds a *content
// signature* describing only its local geometry / appearance (path, fill,
// stroke, corner radius, text content, font, mask) and explicitly EXCLUDING its
// world transform (position, rotation, scale, anchor, opacity). When a node's
// content signature changes — or a new node appears — the node is marked dirty,
// meaning its cached GPU artifact must be regenerated. World-transform changes
// never alter the signature, so they never dirty the node: the renderer reuses
// the cached texture/geometry and simply applies a different transform matrix.
//
// Dirtiness propagates up the hierarchy: if a child changes, every ancestor
// (group / compound clip) is also dirty because its composited output changed.
//
// The tree itself owns no GPU resources. It is the bookkeeping layer that tells
// the renderer and the LruCache which nodes are clean (reuse cache), which are
// dirty (regenerate), and which are culled (offscreen / hidden — skip drawing).

import type { ResolvedLayer, Vec4 } from '../../core/types';

export type RenderNodeKind = 'vector' | 'text' | 'image' | 'video' | 'group' | 'compound' | 'future';

export interface RenderNodeInput {
  id: string;
  kind: RenderNodeKind;
  parentId: string | null;
  visible: boolean;
  // Local geometry / appearance signature — MUST exclude world transform.
  contentSig: string;
}

export interface RenderNode {
  id: string;
  kind: RenderNodeKind;
  parentId: string | null;
  childIds: string[];
  visible: boolean;
  contentSig: string;
  dirty: boolean;
  // Estimated bytes of the node's cached GPU artifact (0 until known).
  cacheBytes: number;
  lastUsed: number;
}

export interface RenderTreeStats {
  nodes: number;
  dirtyNodes: number;
  cleanNodes: number;
  culledNodes: number;
}

function colorSig(c: Vec4): string {
  return `${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)},${c[3].toFixed(3)}`;
}

// Build the transform-independent content signature for a resolved layer. Only
// local geometry / appearance is included; transform.positionX, rotation,
// scaleX/Y, anchorX/Y and opacity are deliberately omitted.
export function contentSignatureFor(layer: ResolvedLayer): string {
  const s = layer.shape;
  if (s) {
    let sig = `shape:${s.renderType}|${s.width}x${s.height}|r${s.radius}|br${s.borderRadius}`;
    sig += `|pts${s.points}|or${s.outerRadius}|ir${s.innerRadius}`;
    sig += `|sw${s.strokeWidth}|${s.lineCap}|${s.lineJoin}|c${s.closed ? 1 : 0}`;
    sig += `|f${colorSig(s.fillColor)}|k${colorSig(s.strokeColor)}`;
    if (s.renderType === 'polygon') {
      for (const v of s.vertices) {
        sig += `|${v.position[0]},${v.position[1]},${v.handleIn[0]},${v.handleIn[1]},${v.handleOut[0]},${v.handleOut[1]}`;
      }
    }
    return sig;
  }
  const t = layer.text;
  if (t) {
    return (
      `text:${t.content}|${t.fontFamily}|${t.fontWeight}|${t.fontStyle}|${t.fontSize}` +
      `|lh${t.lineHeight}|ls${t.letterSpacing}|al${t.textAlign}|m${t.mode}` +
      `|bw${t.boxWidth}|bh${t.boxHeight}|u${t.underline ? 1 : 0}|st${t.strikethrough ? 1 : 0}` +
      `|sw${t.strokeWidth}|f${colorSig(t.fillColor)}|k${colorSig(t.strokeColor)}`
    );
  }
  if (layer.image) {
    const i = layer.image;
    return `image:${i.assetId}|${i.sourceWidth}x${i.sourceHeight}|${JSON.stringify(i.filters)}|${JSON.stringify(i.colorCorrection)}`;
  }
  if (layer.video) {
    const v = layer.video;
    // Source frame changes the pixels, so it is part of the content signature.
    return `video:${v.assetId}|f${v.sourceFrame}|${v.sourceWidth}x${v.sourceHeight}`;
  }
  return `${layer.layerType}:${layer.id}`;
}

function kindFor(layer: ResolvedLayer): RenderNodeKind {
  switch (layer.layerType) {
    case 'shape':
      return 'vector';
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    default:
      return 'future';
  }
}

export class RenderTree {
  private nodes = new Map<string, RenderNode>();
  private culled = new Set<string>();
  // Number of nodes that changed content (incl. propagation) in the last sync —
  // surfaced as the "dirty nodes" debug counter for the current frame.
  private lastDirtyCount = 0;

  // Reconcile the tree against the current frame's layers. Returns the set of
  // node ids whose content changed this frame (dirty), with dirtiness already
  // propagated to ancestors. Nodes absent from the input are removed.
  sync(inputs: RenderNodeInput[]): Set<string> {
    const dirty = new Set<string>();
    const seen = new Set<string>();

    // Reset child lists; they are rebuilt from parent pointers below.
    for (const node of this.nodes.values()) node.childIds = [];

    for (const input of inputs) {
      seen.add(input.id);
      let node = this.nodes.get(input.id);
      if (!node) {
        node = {
          id: input.id,
          kind: input.kind,
          parentId: input.parentId,
          childIds: [],
          visible: input.visible,
          contentSig: input.contentSig,
          dirty: true,
          cacheBytes: 0,
          lastUsed: 0,
        };
        this.nodes.set(input.id, node);
        dirty.add(input.id);
      } else {
        node.kind = input.kind;
        node.parentId = input.parentId;
        node.visible = input.visible;
        if (node.contentSig !== input.contentSig) {
          node.contentSig = input.contentSig;
          node.dirty = true;
          dirty.add(input.id);
        }
      }
    }

    // Drop nodes that no longer exist in the frame.
    for (const id of [...this.nodes.keys()]) {
      if (!seen.has(id)) this.nodes.delete(id);
    }

    // Rebuild child relationships.
    for (const node of this.nodes.values()) {
      if (node.parentId && this.nodes.has(node.parentId)) {
        this.nodes.get(node.parentId)!.childIds.push(node.id);
      }
    }

    // Hierarchical propagation: a dirty child dirties every ancestor.
    for (const id of [...dirty]) {
      let parentId = this.nodes.get(id)?.parentId ?? null;
      while (parentId && this.nodes.has(parentId)) {
        const parent = this.nodes.get(parentId)!;
        if (!dirty.has(parentId)) {
          parent.dirty = true;
          dirty.add(parentId);
        }
        parentId = parent.parentId;
      }
    }

    this.lastDirtyCount = dirty.size;
    return dirty;
  }

  // Convenience: sync directly from resolved layers (flat hierarchy — resolved
  // frames are already flattened, so parentId is null for each).
  syncFromLayers(layers: ResolvedLayer[]): Set<string> {
    return this.sync(
      layers.map((l) => ({
        id: l.id,
        kind: kindFor(l),
        parentId: null,
        visible: l.visible,
        contentSig: contentSignatureFor(l),
      }))
    );
  }

  // Mark a node clean once its cache has been (re)generated this frame.
  markClean(id: string, cacheBytes: number, frameClock: number): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.dirty = false;
    if (cacheBytes > 0) node.cacheBytes = cacheBytes;
    node.lastUsed = frameClock;
  }

  isDirty(id: string): boolean {
    return this.nodes.get(id)?.dirty ?? true;
  }

  // Pass 2 (render) complete: every node's cache is now valid for this frame.
  markAllClean(frameClock: number): void {
    for (const node of this.nodes.values()) {
      node.dirty = false;
      node.lastUsed = frameClock;
    }
  }

  setCulled(ids: Iterable<string>): void {
    this.culled = new Set(ids);
  }

  isCulled(id: string): boolean {
    return this.culled.has(id);
  }

  get(id: string): RenderNode | undefined {
    return this.nodes.get(id);
  }

  clear(): void {
    this.nodes.clear();
    this.culled.clear();
  }

  stats(): RenderTreeStats {
    return {
      nodes: this.nodes.size,
      dirtyNodes: this.lastDirtyCount,
      cleanNodes: Math.max(0, this.nodes.size - this.lastDirtyCount),
      culledNodes: this.culled.size,
    };
  }
}

// Axis-aligned viewport-cull test. A node is culled when its world-space
// bounding box lies entirely outside the composition rect [0,0,w,h]. The
// renderer supplies bounds; nodes without reliable bounds are never culled.
export function isOutsideViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportW: number,
  viewportH: number
): boolean {
  return bounds.maxX < 0 || bounds.maxY < 0 || bounds.minX > viewportW || bounds.minY > viewportH;
}
