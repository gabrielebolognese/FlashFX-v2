import { create } from 'zustand';
import {
  DEFAULT_SILENCE_SETTINGS,
  detectSilenceRegions,
  ANALYSIS_WINDOW_SEC,
  type SilenceSettings,
  type RmsAnalysis,
} from '../core/silenceDetection';
import { buildCutPlan, type ClipSourceMapping, type CutPlan } from '../core/silenceCutPlan';
import { extractMonoAudio } from '../engine/silence/audioForSilence';
import { analyzeAudioLoudness } from '../engine/silence/silenceService';
import { useEditorStore } from './editor';
import { useProjectStore } from '../project-system/hooks/useProjectStore';

export type SilenceStage =
  | 'idle'
  | 'config'
  | 'analyzing'
  | 'detecting'
  | 'preview'
  | 'applying'
  | 'done'
  | 'error';

interface ApplyStats {
  cuts: number;
  removedFrames: number;
  removedSec: number;
}

interface SilenceState {
  isOpen: boolean;
  targetLayerId: string | null;
  targetName: string;

  settings: SilenceSettings;
  stage: SilenceStage;
  progress: number;
  error: string | null;

  // Cached once-per-clip RMS curve; re-tuning sliders re-runs only the cheap
  // grouping below, never the worker.
  analysis: RmsAnalysis | null;
  mapping: ClipSourceMapping | null;
  plan: CutPlan | null;
  stats: ApplyStats | null;

  open: (layerId: string) => void;
  close: () => void;
  setSetting: (partial: Partial<SilenceSettings>) => void;
  runAnalysis: () => Promise<void>;
  apply: () => Promise<void>;
  cancel: () => void;
}

let abortController: AbortController | null = null;

const initial = {
  isOpen: false,
  targetLayerId: null,
  targetName: '',
  settings: { ...DEFAULT_SILENCE_SETTINGS },
  stage: 'idle' as SilenceStage,
  progress: 0,
  error: null,
  analysis: null,
  mapping: null,
  plan: null,
  stats: null,
};

function buildMapping(layerId: string): { assetId: string; mapping: ClipSourceMapping; name: string } | null {
  const layer = useEditorStore.getState().composition.layers.find((l) => l.id === layerId);
  if (!layer || (layer.type !== 'video' && layer.type !== 'audio')) return null;
  const frameRate = useEditorStore.getState().composition.settings.frameRate;
  if (layer.type === 'video') {
    return {
      assetId: layer.video.assetId,
      name: layer.name,
      mapping: {
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
        startOffset: layer.video.startOffset,
        playbackRate: layer.video.playbackRate || 1,
        frameRate,
      },
    };
  }
  return {
    assetId: layer.audio.assetId,
    name: layer.name,
    mapping: {
      inPoint: layer.inPoint,
      outPoint: layer.outPoint,
      startOffset: layer.audio.startOffset ?? 0,
      playbackRate: 1,
      frameRate,
    },
  };
}

// Recompute the cut plan from the cached RMS curve + current settings. Cheap
// enough to run on every slider change, so the preview overlay updates live
// with no re-decode and no worker round-trip.
function recompute(set: (partial: Partial<SilenceState>) => void, get: () => SilenceState): void {
  const { analysis, mapping, settings } = get();
  if (!analysis || !mapping) return;
  const regions = detectSilenceRegions(analysis, settings);
  const plan = buildCutPlan(regions, mapping, settings);
  set({ plan });
}

export const useSilenceStore = create<SilenceState>((set, get) => ({
  ...initial,

  open: (layerId) => {
    const resolved = buildMapping(layerId);
    if (!resolved) return;
    set({
      ...initial,
      isOpen: true,
      stage: 'config',
      targetLayerId: layerId,
      targetName: resolved.name,
      mapping: resolved.mapping,
      settings: { ...DEFAULT_SILENCE_SETTINGS },
    });
  },

  close: () => {
    abortController?.abort();
    abortController = null;
    set({ ...initial });
  },

  cancel: () => {
    abortController?.abort();
    abortController = null;
    set({ stage: 'config', progress: 0 });
  },

  setSetting: (partial) => {
    set((s) => ({ settings: { ...s.settings, ...partial } }));
    recompute(set, get);
  },

  runAnalysis: async () => {
    const { targetLayerId } = get();
    if (!targetLayerId) return;
    const resolved = buildMapping(targetLayerId);
    if (!resolved) {
      set({ stage: 'error', error: 'This clip can no longer be analyzed.' });
      return;
    }

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    set({ stage: 'analyzing', progress: 0, error: null, mapping: resolved.mapping });

    try {
      const { samples, sampleRate } = await extractMonoAudio(resolved.assetId);
      if (controller.signal.aborted) return;

      if (samples.length === 0) {
        set({ stage: 'error', error: 'No audio data found in this clip.' });
        return;
      }

      const analysis = await analyzeAudioLoudness(
        samples,
        sampleRate,
        ANALYSIS_WINDOW_SEC,
        { onProgress: (fraction) => set({ progress: fraction }) },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      set({ stage: 'detecting', analysis });
      recompute(set, get);
      set({ stage: 'preview' });
    } catch (e) {
      if ((e as Error).message === 'Silence analysis cancelled') {
        set({ stage: 'config', progress: 0 });
        return;
      }
      set({ stage: 'error', error: (e as Error).message || 'Audio analysis failed unexpectedly.' });
    } finally {
      if (abortController === controller) abortController = null;
    }
  },

  apply: async () => {
    const { targetLayerId, plan, mapping } = get();
    if (!targetLayerId || !plan || !mapping) return;
    if (plan.segments.length === 0) return;

    set({ stage: 'applying' });

    try {
      const editorState = useEditorStore.getState();
      const layer = editorState.composition.layers.find((l) => l.id === targetLayerId);
      if (!layer || (layer.type !== 'video' && layer.type !== 'audio')) {
        set({ stage: 'error', error: 'The target clip no longer exists or is not a media clip.' });
        return;
      }

      const stripSilence = editorState.stripSilence;
      const newIds = stripSilence(targetLayerId, plan.segments);
      if (newIds.length === 0) {
        set({ stage: 'error', error: 'Silence stripping produced no valid segments.' });
        return;
      }

      try {
        await useProjectStore.getState().saveCurrentProject();
      } catch {
        // Best-effort save
      }

      set({
        stage: 'done',
        stats: {
          cuts: plan.cuts,
          removedFrames: plan.removedFrames,
          removedSec: plan.removedFrames / mapping.frameRate,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during silence stripping.';
      set({ stage: 'error', error: msg });
    }
  },
}));
