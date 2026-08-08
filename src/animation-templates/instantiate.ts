import type { Layer, AnimatableProperty } from '../core/types';
import type { AnimationTemplate } from './types';

// Pure instantiation: build a template's layers and rebase their (0-based) keyframes + clip ranges to
// the playhead, rescaling if the comp fps differs from the authoring fps. Returns ready-to-insert
// layers (group first). No store/DOM/renderer imports — harness-testable.

function isProp(v: unknown): v is AnimatableProperty {
  return !!v && typeof v === 'object'
    && Array.isArray((v as { keyframes?: unknown }).keyframes)
    && typeof (v as { valueType?: unknown }).valueType === 'string';
}

/** Visit every AnimatableProperty reachable in a layer (transform, shape geometry, animOverrides, …). */
function walkProps(node: unknown, fn: (p: AnimatableProperty) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) walkProps(x, fn);
    return;
  }
  if (isProp(node)) {
    fn(node); // a property's keyframes hold plain values — don't descend into it
    return;
  }
  for (const key of Object.keys(node)) walkProps((node as Record<string, unknown>)[key], fn);
}

export interface InstantiateOpts {
  playhead: number;
  frameRate: number;
  center: [number, number];
}

export function instantiateTemplate(tpl: AnimationTemplate, opts: InstantiateOpts): Layer[] {
  const layers = tpl.build({ center: opts.center, frameRate: opts.frameRate });
  const scale = opts.frameRate / tpl.authorFps;
  const rebase = (f: number) => Math.round(opts.playhead + f * scale);

  for (const layer of layers) {
    walkProps(layer, (p) => {
      p.keyframes = p.keyframes.map((k) => ({ ...k, frame: rebase(k.frame) }));
    });
    layer.inPoint = rebase(layer.inPoint);
    layer.outPoint = rebase(layer.outPoint);
  }
  return layers;
}
