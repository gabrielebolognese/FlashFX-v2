import type { AnimatableProperty, MotionPath, MotionPathLoop, MotionPathNode, Vec2 } from './types';
import { buildKeyframesFromSpecs, easeSpecError, type KeyframeEaseSpec } from './keyframeSpecs';
import { getTotalPathLength, smoothEntirePath } from './motionPath';

// B67 follow-up (found by B66): agents could attach a motion path (editor.addMotionPath) but not give it
// any nodes, so a layer could never travel along a curve through the MCP. This is the pure planner behind
// agent.setMotionPath: it validates the agent's JSON and returns the complete MotionPath to store.

/** One node as an agent writes it: [x, y], or { x, y, in?, out? } with bezier handles RELATIVE to the node. */
export type AgentPathNodeSpec = Vec2 | { x: number; y: number; in?: Vec2; out?: Vec2 };

export interface AgentMotionPathOptions {
  /** Close the loop back to the first node (default false). */
  closed?: boolean;
  /** Auto-smooth nodes that carry no handles (default true; false = straight segments, sharp corners). */
  smooth?: boolean;
  /** Rotate the layer to the path tangent (default false). */
  orientToPath?: boolean;
  /** Progress past the end: none (stop), loop, pingPong (default none). */
  loop?: MotionPathLoop;
  /** First frame of the travel (default the layer in-point). */
  startFrame?: number;
  /** Frame it arrives at the last node (default the layer's last frame). */
  endFrame?: number;
  /** Ease of the travel (any setKeyframes ease, aliases included; default linear = constant speed). */
  ease?: KeyframeEaseSpec;
}

const LOOPS: readonly MotionPathLoop[] = ['none', 'loop', 'pingPong'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec2 = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** Validate + normalise the node list (throws with the index of the first bad node). */
export function parseAgentPathNodes(nodes: unknown, makeId: () => string): { nodes: MotionPathNode[]; hasHandles: boolean } {
  if (!Array.isArray(nodes)) throw new Error('"nodes" must be an array of [x, y] or { x, y, in?: [dx, dy], out?: [dx, dy] } (comp px)');
  let hasHandles = false;
  const out = nodes.map((n, i): MotionPathNode => {
    if (isVec2(n)) return { id: makeId(), position: [n[0], n[1]], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' };
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      const o = n as Record<string, unknown>;
      const pos = isVec2(o.position) ? o.position : (isNum(o.x) && isNum(o.y) ? [o.x, o.y] as Vec2 : null);
      if (!pos) throw new Error(`nodes[${i}] needs x and y numbers (or position [x, y])`);
      const hin = o.in ?? o.handleIn;
      const hout = o.out ?? o.handleOut;
      if (hin !== undefined && !isVec2(hin)) throw new Error(`nodes[${i}].in must be [dx, dy] relative to the node`);
      if (hout !== undefined && !isVec2(hout)) throw new Error(`nodes[${i}].out must be [dx, dy] relative to the node`);
      if (hin !== undefined || hout !== undefined) hasHandles = true;
      const handleIn: Vec2 = isVec2(hin) ? [hin[0], hin[1]] : [0, 0];
      const handleOut: Vec2 = isVec2(hout) ? [hout[0], hout[1]] : [0, 0];
      return { id: makeId(), position: [pos[0], pos[1]], handleIn, handleOut, vertexType: hin !== undefined || hout !== undefined ? 'bezier' : 'corner' };
    }
    throw new Error(`nodes[${i}] must be [x, y] or { x, y, in?, out? }`);
  });
  return { nodes: out, hasHandles };
}

/**
 * The full MotionPath for `layerId`. `base` (the layer's existing path, when there is one) keeps its id,
 * anchor and custom anchor, so a re-run edits the same path. Progress is keyed 0 -> 100 over
 * [startFrame, endFrame] with the given ease.
 */
export function planAgentMotionPath(
  layer: { id: string; inPoint: number; outPoint: number },
  rawNodes: unknown,
  rawOpts: unknown,
  makeId: () => string,
  base?: MotionPath,
): { path: MotionPath; length: number; startFrame: number; endFrame: number } {
  if (rawOpts !== undefined && rawOpts !== null && (typeof rawOpts !== 'object' || Array.isArray(rawOpts))) {
    throw new Error('"options" must be an object { closed?, smooth?, orientToPath?, loop?, startFrame?, endFrame?, ease? }');
  }
  const opts = (rawOpts ?? {}) as Record<string, unknown>;
  const known = new Set(['closed', 'smooth', 'orientToPath', 'loop', 'startFrame', 'endFrame', 'ease']);
  const unknown = Object.keys(opts).filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`unknown option(s) ${unknown.join(', ')}; options are ${[...known].join(', ')}`);
  for (const k of ['closed', 'smooth', 'orientToPath'] as const) {
    if (opts[k] !== undefined && typeof opts[k] !== 'boolean') throw new Error(`"${k}" must be true or false`);
  }
  if (opts.loop !== undefined && !LOOPS.includes(opts.loop as MotionPathLoop)) throw new Error(`"loop" must be one of ${LOOPS.join(', ')}`);
  for (const k of ['startFrame', 'endFrame'] as const) {
    if (opts[k] !== undefined && !isNum(opts[k])) throw new Error(`"${k}" must be a frame number`);
  }
  const easeErr = easeSpecError(opts.ease);
  if (easeErr) throw new Error(`"ease": ${easeErr}`);

  const { nodes, hasHandles } = parseAgentPathNodes(rawNodes, makeId);
  if (nodes.length < 2) throw new Error('a motion path needs at least 2 nodes (pass [] to remove the layer\'s path)');

  const startFrame = Math.round(isNum(opts.startFrame) ? opts.startFrame : layer.inPoint);
  const endFrame = Math.round(isNum(opts.endFrame) ? opts.endFrame : Math.max(layer.inPoint + 1, layer.outPoint - 1));
  if (endFrame <= startFrame) throw new Error(`endFrame (${endFrame}) must be after startFrame (${startFrame})`);

  const closed = opts.closed === true;
  const smooth = opts.smooth === undefined ? !hasHandles : opts.smooth === true;
  let path: MotionPath = {
    id: base?.id ?? makeId(),
    layerId: layer.id,
    nodes,
    closed,
    anchor: base?.anchor ?? 'center',
    customAnchor: base?.customAnchor ?? [0, 0],
    orientToPath: opts.orientToPath === true,
    loop: (opts.loop as MotionPathLoop | undefined) ?? 'none',
    progress: base?.progress ? { ...base.progress } : ({ id: makeId(), name: 'Path Progress', valueType: 'number', defaultValue: 0, keyframes: [] } satisfies AnimatableProperty),
  };
  path.progress = {
    ...path.progress,
    defaultValue: 0,
    keyframes: buildKeyframesFromSpecs(
      [{ frame: startFrame, value: 0, ease: (opts.ease as KeyframeEaseSpec | undefined) ?? 'linear' }, { frame: endFrame, value: 100 }],
      { expected: 'number' },
    ),
  };
  // Smooth only the nodes the agent gave no handles (explicit handles are kept as written).
  if (smooth) {
    const smoothed = smoothEntirePath(path);
    path = { ...path, nodes: path.nodes.map((n, i) => (n.vertexType === 'bezier' ? n : smoothed[i])) };
  }
  return { path, length: getTotalPathLength(path), startFrame, endFrame };
}
