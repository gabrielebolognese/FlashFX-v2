import { ElementAnimation } from '../animation-engine/types';
import { EngineClip, EngineTrack, EngineKeyframe } from './core/types';
import { DesignElement } from '../types/design';
import { RenderElement } from './core/types';

export interface UseEngineOptions {
  fps: number;
  duration: number;
  loop: boolean;
}

export interface EngineHandle {
  getStateAtTime: (time: number) => Map<string, Record<string, number | string | undefined>>;
}

export function animationsToEngineClips(
  animations: Record<string, ElementAnimation>
): Record<string, EngineClip> {
  return Object.fromEntries(
    Object.entries(animations).map(([elementId, anim]) => [
      elementId,
      {
        elementId: anim.elementId,
        clipStart: anim.clipStart,
        clipDuration: anim.clipDuration,
        locked: anim.locked,
        muted: anim.muted,
        tracks: anim.tracks.map((track): EngineTrack => ({
          property: track.property,
          enabled: track.enabled,
          keyframes: track.keyframes.map((kf): EngineKeyframe => ({
            id: kf.id,
            time: kf.time,
            value: kf.value,
            easing: kf.easing,
            handleIn: kf.handleIn,
            handleOut: kf.handleOut,
          })),
        })),
      } satisfies EngineClip,
    ])
  );
}

export function designElementToRenderElement(element: DesignElement): RenderElement {
  const effectiveFill = element.type === 'text'
    ? (element.textColor || element.fill || '#000000')
    : (element.fill || '#000000');

  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation || 0,
    opacity: element.opacity ?? 1,
    fill: effectiveFill,
    stroke: element.stroke || 'transparent',
    strokeWidth: element.strokeWidth || 0,
    borderRadius: element.borderRadius || 0,
    scaleX: 1,
    scaleY: 1,
    visible: element.visible,
    locked: element.locked,
    name: element.name,
    shadow: element.shadow,
    blendMode: element.blendMode,
    text: element.text,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    fontWeight: element.fontWeight,
    fontStyle: element.fontStyle,
    textAlign: element.textAlign,
    letterSpacing: element.letterSpacing,
    lineHeight: element.lineHeight,
    textVerticalAlign: element.textVerticalAlign,
    imageData: element.imageData,
    points: element.points,
    children: element.children?.map(designElementToRenderElement),
    animationTargetLevel: element.animationTargetLevel,
    stagger: element.stagger,
    order: element.order,
    masking: element.masking,
    textGradientEnabled: element.textGradientEnabled,
    textGradientType: element.textGradientType,
    textGradientColors: element.textGradientColors,
    textGradientAngle: element.textGradientAngle,
  };
}

export function useEngine(_options: UseEngineOptions): EngineHandle | null {
  return null;
}
