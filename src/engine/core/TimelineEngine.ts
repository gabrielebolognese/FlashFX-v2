import type {
  EngineClip, EngineTrack, EngineKeyframe, AnimatableProperty,
  ResolvedProperties, RenderElement, RenderFrame, TimelineConfig,
} from './types';
import { AnimationEvaluator } from './AnimationEvaluator';
import { FrameCache, resolvedPropsPool, type PooledResolvedProps } from './MemoryPool';
import { globalToLocalTime } from '../../animation-engine/types';

export class TimelineEngine {
  private clips: Map<string, EngineClip> = new Map();
  private evaluator: AnimationEvaluator;
  private config: TimelineConfig;
  private frameCache: FrameCache;
  private dirty = false;

  constructor(config: TimelineConfig) {
    this.config = { ...config };
    this.evaluator = new AnimationEvaluator();
    this.frameCache = new FrameCache(120);
  }

  setConfig(config: Partial<TimelineConfig>): void {
    if (config.fps !== undefined) this.config.fps = config.fps;
    if (config.duration !== undefined) this.config.duration = config.duration;
    if (config.loop !== undefined) this.config.loop = config.loop;
  }

  getConfig(): TimelineConfig {
    return { ...this.config };
  }

  getStateAtTime(time: number): Map<string, ResolvedProperties> {
    const frame = Math.floor(time * this.config.fps);

    if (!this.dirty) {
      const cached = this.frameCache.get(frame);
      if (cached) return cached as Map<string, ResolvedProperties>;
    }

    const result = new Map<string, PooledResolvedProps>();

    for (const [elementId, clip] of this.clips) {
      if (clip.muted) continue;

      // Only evaluate clips whose time window contains the current time.
      // Outside the window the element has no animated overrides; it renders
      // at its base property values (and getAnimatedElementState will gate
      // visibility via clip activation checks).
      const clipEnd = clip.clipStart + clip.clipDuration;
      if (time < clip.clipStart || time > clipEnd) continue;

      const pooled = resolvedPropsPool.acquire();
      const localTime = globalToLocalTime(time, clip.clipStart);
      const props = this.evaluator.evaluateClip(clip, localTime, pooled);

      let hasValues = false;
      for (const key in props) {
        if (key === '_pooled') continue;
        if (props[key] !== undefined) {
          hasValues = true;
          break;
        }
      }

      if (hasValues) {
        result.set(elementId, props);
      } else {
        resolvedPropsPool.release(pooled);
      }
    }

    this.frameCache.set(frame, result);
    this.dirty = false;

    return result as Map<string, ResolvedProperties>;
  }

  resolveFrame(
    time: number,
    elements: RenderElement[],
    canvasWidth: number,
    canvasHeight: number,
    background?: RenderFrame['background']
  ): RenderFrame {
    const state = this.getStateAtTime(time);
    const frame = Math.floor(time * this.config.fps);

    const resolvedElements: RenderElement[] = new Array(elements.length);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];

      // Gate visibility by clip activation. Elements whose clip is not active
      // at this time are excluded from the rendered frame. This drives export
      // correctness: only clips spanning the current time produce pixels.
      const clip = this.clips.get(el.id);
      if (clip && !clip.muted) {
        const clipEnd = clip.clipStart + clip.clipDuration;
        if (time < clip.clipStart || time > clipEnd) {
          resolvedElements[i] = { ...el, visible: false, opacity: 0 };
          continue;
        }
      }

      const animated = state.get(el.id);

      if (!animated) {
        resolvedElements[i] = el;
        continue;
      }

      resolvedElements[i] = {
        ...el,
        x: (animated.x as number) ?? el.x,
        y: (animated.y as number) ?? el.y,
        width: (animated.width as number) ?? el.width,
        height: (animated.height as number) ?? el.height,
        rotation: (animated.rotation as number) ?? el.rotation,
        opacity: (animated.opacity as number) ?? el.opacity,
        fill: (animated.fill as string) ?? el.fill,
        stroke: (animated.stroke as string) ?? el.stroke,
        strokeWidth: (animated.strokeWidth as number) ?? el.strokeWidth,
        borderRadius: (animated.borderRadius as number) ?? el.borderRadius,
        scaleX: (animated.scaleX as number) ?? el.scaleX,
        scaleY: (animated.scaleY as number) ?? el.scaleY,
        fontSize: (animated.fontSize as number) ?? el.fontSize,
        letterSpacing: (animated.letterSpacing as number) ?? el.letterSpacing,
        lineHeight: (animated.lineHeight as number) ?? el.lineHeight,
      };

      if (animated.shadowBlur !== undefined || animated.shadowX !== undefined || animated.shadowY !== undefined) {
        resolvedElements[i] = {
          ...resolvedElements[i],
          shadow: {
            blur: (animated.shadowBlur as number) ?? el.shadow?.blur ?? 0,
            color: el.shadow?.color ?? 'rgba(0,0,0,0.3)',
            x: (animated.shadowX as number) ?? el.shadow?.x ?? 0,
            y: (animated.shadowY as number) ?? el.shadow?.y ?? 0,
          },
        };
      }
    }

    return {
      time,
      frame,
      canvasWidth,
      canvasHeight,
      elements: resolvedElements,
      background,
    };
  }

  loadClipsFromAnimations(animations: Record<string, EngineClip>): void {
    this.clips.clear();
    this.evaluator.clearCache();
    this.frameCache.invalidate();
    this.dirty = true;

    for (const key of Object.keys(animations)) {
      const anim = animations[key];
      const clip: EngineClip = {
        elementId: anim.elementId,
        tracks: anim.tracks.map((t) => ({
          property: t.property,
          keyframes: [...t.keyframes].sort((a, b) => a.time - b.time),
          enabled: t.enabled,
        })),
        clipStart: anim.clipStart,
        clipDuration: anim.clipDuration,
        locked: anim.locked,
        muted: anim.muted,
      };
      this.clips.set(key, clip);
    }
  }

  addKeyframe(elementId: string, property: AnimatableProperty, keyframe: EngineKeyframe): void {
    const clip = this.clips.get(elementId);
    if (!clip) return;

    let track = clip.tracks.find((t) => t.property === property);
    if (!track) {
      track = { property, keyframes: [], enabled: true };
      clip.tracks.push(track);
    }

    let lo = 0;
    let hi = track.keyframes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (track.keyframes[mid].time < keyframe.time) lo = mid + 1;
      else hi = mid;
    }
    track.keyframes.splice(lo, 0, keyframe);

    this.evaluator.invalidateElement(elementId);
    this.frameCache.invalidate();
    this.dirty = true;
  }

  removeKeyframe(elementId: string, property: AnimatableProperty, keyframeId: string): void {
    const clip = this.clips.get(elementId);
    if (!clip) return;

    const track = clip.tracks.find((t) => t.property === property);
    if (!track) return;

    track.keyframes = track.keyframes.filter((kf) => kf.id !== keyframeId);
    this.evaluator.invalidateElement(elementId);
    this.frameCache.invalidate();
    this.dirty = true;
  }

  getClip(elementId: string): EngineClip | undefined {
    return this.clips.get(elementId);
  }

  hasClip(elementId: string): boolean {
    return this.clips.has(elementId);
  }

  markDirty(): void {
    this.dirty = true;
    this.frameCache.invalidate();
  }

  destroy(): void {
    this.clips.clear();
    this.evaluator.clearCache();
    this.frameCache.invalidate();
  }
}
