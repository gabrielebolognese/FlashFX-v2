import type { AnimationState, ElementAnimation, PropertyTrack, Keyframe, EasingType } from '../../animation-engine/types';
import { globalToLocalTime } from '../../animation-engine/types';
import type { KeyframesFile, SerializedElementAnimation, SerializedPropertyTrack, SerializedKeyframe } from '../types';
import { FORMAT_VERSION } from '../types';

function isLegacyGlobalTimeFormat(formatVersion: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [fMaj, fMin] = parse(formatVersion);
  const [tMaj, tMin] = parse('1.1.0');
  if (fMaj !== tMaj) return fMaj < tMaj;
  return fMin < tMin;
}

export function serializeKeyframes(animationState: AnimationState): KeyframesFile {
  const collections: Record<string, SerializedElementAnimation> = {};

  for (const [, anim] of Object.entries(animationState.animations)) {
    collections[anim.elementId] = serializeElementAnimation(anim);
  }

  return {
    formatVersion: FORMAT_VERSION,
    keyframeCollections: collections,
  };
}

function serializeElementAnimation(anim: ElementAnimation): SerializedElementAnimation {
  return {
    elementId: anim.elementId,
    tracks: anim.tracks.map(serializeTrack),
    clipStart: anim.clipStart,
    clipDuration: anim.clipDuration,
    locked: anim.locked,
    muted: anim.muted,
  };
}

function serializeTrack(track: PropertyTrack): SerializedPropertyTrack {
  return {
    property: track.property,
    keyframes: track.keyframes.map(serializeKeyframe),
    enabled: track.enabled,
  };
}

function serializeKeyframe(kf: Keyframe): SerializedKeyframe {
  const serialized: SerializedKeyframe = {
    id: kf.id,
    time: kf.time,
    value: kf.value,
    easing: kf.easing,
  };
  if (kf.handleIn) serialized.handleIn = kf.handleIn;
  if (kf.handleOut) serialized.handleOut = kf.handleOut;
  return serialized;
}

export function deserializeKeyframes(
  file: KeyframesFile
): Record<string, ElementAnimation> {
  const animations: Record<string, ElementAnimation> = {};
  const needsMigration = isLegacyGlobalTimeFormat(file.formatVersion ?? '1.0.0');

  for (const [elementId, serialized] of Object.entries(file.keyframeCollections)) {
    const anim = deserializeElementAnimation(serialized);
    if (needsMigration && anim.clipStart !== 0) {
      anim.tracks = anim.tracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.map((kf) => ({
          ...kf,
          time: globalToLocalTime(kf.time, anim.clipStart),
        })),
      }));
    }
    animations[elementId] = anim;
  }

  return animations;
}

function deserializeElementAnimation(serialized: SerializedElementAnimation): ElementAnimation {
  return {
    elementId: serialized.elementId,
    tracks: (serialized.tracks ?? []).map(deserializeTrack),
    clipStart: serialized.clipStart ?? 0,
    clipDuration: serialized.clipDuration ?? 5,
    locked: serialized.locked ?? false,
    muted: serialized.muted ?? false,
  };
}

function deserializeTrack(serialized: SerializedPropertyTrack): PropertyTrack {
  return {
    property: serialized.property as PropertyTrack['property'],
    keyframes: (serialized.keyframes ?? []).map(deserializeKeyframe),
    enabled: serialized.enabled ?? true,
  };
}

function deserializeKeyframe(serialized: SerializedKeyframe): Keyframe {
  return {
    id: serialized.id,
    time: serialized.time,
    value: serialized.value,
    easing: (serialized.easing as EasingType) ?? 'ease-out',
    handleIn: serialized.handleIn,
    handleOut: serialized.handleOut,
  };
}
