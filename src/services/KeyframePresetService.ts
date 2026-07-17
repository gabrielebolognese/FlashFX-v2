import { v4 as uuidv4 } from 'uuid';
import {
  KeyframeAnimationPreset,
  KeyframeAnimationPresetCreateInput,
  KeyframePresetTrack,
  KeyframePresetKeyframe,
} from '../types/preset';
import { ElementAnimation, AnimatableProperty, Keyframe } from '../animation-engine/types';

const LOCAL_STORAGE_KEY = 'keyframe_animation_presets';

export class KeyframePresetService {
  static saveToLocalStorage(presets: KeyframeAnimationPreset[]): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(presets));
    } catch (err) {
      console.error('Error saving keyframe presets to localStorage:', err);
    }
  }

  static loadFromLocalStorage(): KeyframeAnimationPreset[] {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as KeyframeAnimationPreset[];
    } catch (err) {
      console.error('Error loading keyframe presets from localStorage:', err);
      return [];
    }
  }

  static createPreset(input: KeyframeAnimationPresetCreateInput): KeyframeAnimationPreset {
    const preset: KeyframeAnimationPreset = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      tracks: input.tracks,
      duration: input.duration,
      keyframeCount: input.keyframeCount,
      created_at: new Date().toISOString(),
    };

    const existing = this.loadFromLocalStorage();
    this.saveToLocalStorage([preset, ...existing]);
    window.dispatchEvent(new CustomEvent('keyframe-preset-saved'));
    return preset;
  }

  static deletePreset(presetId: string): void {
    const existing = this.loadFromLocalStorage();
    this.saveToLocalStorage(existing.filter((p) => p.id !== presetId));
  }

  static buildPresetFromSelectedKeyframes(
    animation: ElementAnimation,
    selectedKeyframeIds: string[]
  ): KeyframeAnimationPresetCreateInput | null {
    if (!animation || selectedKeyframeIds.length === 0) return null;

    const selectedIdSet = new Set(selectedKeyframeIds);

    const matchingTracks: KeyframePresetTrack[] = [];
    let minTime = Infinity;

    animation.tracks.forEach((track) => {
      const matchingKfs = track.keyframes.filter((kf) => selectedIdSet.has(kf.id));
      if (matchingKfs.length > 0) {
        matchingKfs.forEach((kf) => {
          if (kf.time < minTime) minTime = kf.time;
        });
        matchingTracks.push({
          property: track.property,
          keyframes: matchingKfs as KeyframePresetKeyframe[],
        });
      }
    });

    if (matchingTracks.length === 0) return null;

    const baseTime = minTime === Infinity ? 0 : minTime;
    let maxRelativeTime = 0;
    let totalKeyframeCount = 0;

    const normalizedTracks: KeyframePresetTrack[] = matchingTracks.map((track) => {
      const normalizedKfs: KeyframePresetKeyframe[] = track.keyframes.map((kf) => {
        const relativeTime = kf.time - baseTime;
        if (relativeTime > maxRelativeTime) maxRelativeTime = relativeTime;
        totalKeyframeCount++;
        return {
          id: uuidv4(),
          relativeTime,
          value: kf.value,
          easing: kf.easing,
          handleIn: (kf as Keyframe).handleIn,
          handleOut: (kf as Keyframe).handleOut,
        };
      });

      return {
        property: track.property,
        keyframes: normalizedKfs,
      };
    });

    return {
      name: '',
      description: '',
      tracks: normalizedTracks,
      duration: maxRelativeTime,
      keyframeCount: totalKeyframeCount,
    };
  }

  static applyPresetToElement(
    preset: KeyframeAnimationPreset,
    elementId: string,
    clipStart: number,
    playheadTime: number,
    addKeyframe: (
      elementId: string,
      property: AnimatableProperty,
      time: number,
      value: number | string,
      easing?: import('../animation-engine/types').EasingType
    ) => void
  ): void {
    const localPlayhead = playheadTime - clipStart;

    preset.tracks.forEach((track) => {
      track.keyframes.forEach((kfTemplate) => {
        const localTime = localPlayhead + kfTemplate.relativeTime;
        addKeyframe(
          elementId,
          track.property as AnimatableProperty,
          localTime,
          kfTemplate.value,
          kfTemplate.easing
        );
      });
    });
  }
}
