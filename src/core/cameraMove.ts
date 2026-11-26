// B53 - one-call camera moves for agents: "at frame F, take DURATION frames to move the camera to this
// eye / point of interest / zoom / orientation, with this ease". Pure: builds the new keyframe lists for
// the touched camera properties with core/keyframeSpecs (the same builder as editor.setKeyframes) and
// returns the updated camera layer; the store wraps it in ONE undo step (editor.cameraMove). The start
// pose is the camera's evaluated value at `frame` (injected evaluator, so this module never imports the
// interpolation engine). Verified by verify:camera-move and, on the real renderer, gpu:camera-cards.

import type { AnimatableProperty, CameraLayer, Keyframe, Vec2 } from './types';
import { buildKeyframesFromSpecs, easeSpecError, type KeyframeEaseSpec, type KeyframeSpec } from './keyframeSpecs';

export interface CameraMoveTarget {
  /** Eye position in comp px: [x, y] or [x, y, z]. z < 0 is in front of the comp plane (the default
   *  camera sits at z = -zoom, which frames the comp 1:1). */
  position?: readonly number[];
  /** Two-node aim point in comp px: [x, y] or [x, y, z]. */
  pointOfInterest?: readonly number[];
  /** AE zoom in px (the lens: larger = narrower, more telephoto). */
  zoom?: number;
  /** One-node aim: [rotationX, rotationY, rotationZ] in degrees. */
  orientation?: readonly number[];
}

export type CameraPropEvaluator = (prop: AnimatableProperty, frame: number) => number | Vec2;

export interface CameraMoveResult {
  layer: CameraLayer;
  /** The property paths that were keyed (e.g. "transform.position", "camera.zoom"). */
  paths: string[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function vec(v: unknown, name: string, allowZ: boolean): number[] {
  if (!Array.isArray(v) || (v.length !== 2 && !(allowZ && v.length === 3)) || !v.every(finite)) {
    throw new Error(`${name} must be ${allowZ ? '[x, y] or [x, y, z]' : '[x, y]'} (numbers)`);
  }
  return v as number[];
}

/**
 * Plan the move. With `durationFrames` > 0 each touched property gets a key at `frame` holding its
 * current value (carrying `ease`) and a key at `frame + durationFrames` with the target; keys strictly
 * inside that span are dropped (the move owns it). With 0 / undefined it is a single key at `frame`
 * (the camera arrives there from its previous key). Other keys are kept. Throws on invalid input.
 */
export function planCameraMove(
  cam: CameraLayer,
  frame: number,
  to: CameraMoveTarget,
  durationFrames: number | undefined,
  ease: KeyframeEaseSpec | undefined,
  evaluate: CameraPropEvaluator,
): CameraMoveResult {
  if (!cam || cam.type !== 'camera') throw new Error('cameraMove needs a camera layer id (editor.addCameraLayer returns one)');
  if (!finite(frame)) throw new Error('frame must be a number');
  const dur = durationFrames === undefined || durationFrames === null ? 0 : durationFrames;
  if (!finite(dur) || dur < 0) throw new Error('durationFrames must be a number >= 0');
  const err = easeSpecError(ease);
  if (err) throw new Error(`ease: ${err}`);
  if (!to || typeof to !== 'object') throw new Error('target must be an object { position?, pointOfInterest?, zoom?, orientation? }');
  const known = new Set(['position', 'pointOfInterest', 'zoom', 'orientation']);
  for (const k of Object.keys(to)) if (!known.has(k)) throw new Error(`unknown camera target "${k}" (use position, pointOfInterest, zoom, orientation)`);

  // [path, property getter, target value]
  const channels: { path: string; value: number | Vec2 }[] = [];
  if (to.position !== undefined) {
    const p = vec(to.position, 'position', true);
    channels.push({ path: 'transform.position', value: [p[0], p[1]] });
    if (p.length === 3) channels.push({ path: 'transform.positionZ', value: p[2] });
  }
  if (to.pointOfInterest !== undefined) {
    if (cam.camera.mode !== 'two-node') throw new Error('pointOfInterest needs a two-node camera (this one is one-node: aim it with orientation)');
    const p = vec(to.pointOfInterest, 'pointOfInterest', true);
    channels.push({ path: 'camera.pointOfInterest', value: [p[0], p[1]] });
    if (p.length === 3) channels.push({ path: 'camera.pointOfInterestZ', value: p[2] });
  }
  if (to.zoom !== undefined) {
    if (!finite(to.zoom) || to.zoom <= 0) throw new Error('zoom must be a number > 0 (px)');
    channels.push({ path: 'camera.zoom', value: to.zoom });
  }
  if (to.orientation !== undefined) {
    if (cam.camera.mode !== 'one-node') throw new Error('orientation aims a one-node camera (this one is two-node: use pointOfInterest)');
    const o = to.orientation;
    if (!Array.isArray(o) || o.length !== 3 || !o.every(finite)) throw new Error('orientation must be [rotationX, rotationY, rotationZ] in degrees');
    channels.push({ path: 'transform.rotationX', value: o[0] }, { path: 'transform.rotationY', value: o[1] }, { path: 'transform.rotation', value: o[2] });
  }
  if (channels.length === 0) throw new Error('nothing to move: give at least one of position, pointOfInterest, zoom, orientation');

  const getProp = (c: CameraLayer, path: string): AnimatableProperty | undefined => {
    switch (path) {
      case 'transform.position': return c.transform.position;
      case 'transform.positionZ': return c.transform.positionZ;
      case 'transform.rotationX': return c.transform.rotationX;
      case 'transform.rotationY': return c.transform.rotationY;
      case 'transform.rotation': return c.transform.rotation;
      case 'camera.pointOfInterest': return c.camera.pointOfInterest;
      case 'camera.pointOfInterestZ': return c.camera.pointOfInterestZ;
      case 'camera.zoom': return c.camera.zoom;
      default: return undefined;
    }
  };

  const start = Math.round(frame);
  const end = Math.round(frame + dur);
  const transform = { ...cam.transform };
  const camera = { ...cam.camera };
  for (const ch of channels) {
    const prop = getProp(cam, ch.path);
    if (!prop) throw new Error(`this camera has no ${ch.path} property`);
    const specs: KeyframeSpec[] = end > start
      ? [{ frame: start, value: evaluate(prop, start), ease }, { frame: end, value: ch.value }]
      : [{ frame: start, value: ch.value, ...(ease !== undefined ? { ease } : {}) }];
    const existing: Keyframe[] = end > start ? prop.keyframes.filter((k) => k.frame <= start || k.frame >= end) : prop.keyframes;
    const keyframes = buildKeyframesFromSpecs(specs, { expected: Array.isArray(ch.value) ? 'vec2' : 'number', existing, merge: true });
    const next: AnimatableProperty = { ...prop, keyframes };
    const [group, key] = ch.path.split('.') as ['transform' | 'camera', string];
    if (group === 'transform') (transform as unknown as Record<string, AnimatableProperty>)[key] = next;
    else (camera as unknown as Record<string, AnimatableProperty>)[key] = next;
  }
  return { layer: { ...cam, transform, camera }, paths: channels.map((c) => c.path) };
}
