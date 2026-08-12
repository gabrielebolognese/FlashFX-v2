import { create } from 'zustand';
import {
  buildCaptionLayers,
  captionClipWindow,
  cleanSegments,
  DEFAULT_CAPTION_OPTIONS,
  type CaptionOptions,
} from '../core/captions';
import type { AudioLayer, TextLayer } from '../core/types';
import { extractClipAudioForCaptions } from '../engine/captions/clipAudio';
import { generateCaptions, type CaptionBackend } from '../engine/captions/captionService';
import { useEditorStore } from './editor';

// Batch, non-blocking auto-captioning of one or more selected audio clips. Each clip is transcribed
// in turn (the worker runs one job at a time), its transcript timestamps are placed at the clip's
// GLOBAL timeline position, and all phrases are committed onto one shared "Subtitles" track. The UI
// (AutoCaptionProgress) shows a small "Transcribing clip N of M…" chip; the editor stays interactive.

/** Pinned options for the batch flow: Whisper Small, deterministic decode (temperature 0 is set in
 *  the worker), phrase-level captions. Callers may override (e.g. position/style/language). */
export const AUTO_CAPTION_OPTIONS: CaptionOptions = {
  ...DEFAULT_CAPTION_OPTIONS,
  model: 'Xenova/whisper-small',
};

export interface ClipCaptionJob {
  assetId: string;
  name: string;
  /** Played source window of the clip (seconds) — startOffset/fps and (out-in)/fps. */
  startSec: number;
  spanSec: number;
  /** The clip's global in-point (frames): the offset added to clip-local transcript timings. */
  clipStartFrame: number;
}

interface AutoCaptionState {
  active: boolean;
  index: number; // 1-based clip currently transcribing
  total: number;
  label: string;
  download: { file: string; progress: number } | null;
  backend: CaptionBackend | null;
  error: string | null;
  run: (clips: ClipCaptionJob[], options?: CaptionOptions) => Promise<void>;
  dismissError: () => void;
  cancel: () => void;
}

let abortController: AbortController | null = null;

export const useAutoCaptionStore = create<AutoCaptionState>((set, get) => ({
  active: false,
  index: 0,
  total: 0,
  label: '',
  download: null,
  backend: null,
  error: null,

  run: async (clips, options = AUTO_CAPTION_OPTIONS) => {
    if (clips.length === 0 || get().active) return;

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    set({ active: true, index: 0, total: clips.length, label: 'Preparing…', download: null, backend: null, error: null });

    // Snapshot comp settings for building caption layers (comp settings don't change mid-run).
    const settings = useEditorStore.getState().composition.settings;
    const allLayers: TextLayer[] = [];

    try {
      for (let i = 0; i < clips.length; i++) {
        if (controller.signal.aborted) return;
        const clip = clips[i];
        set({ index: i + 1, label: `Transcribing clip ${i + 1} of ${clips.length}…`, download: null });

        let audio: Float32Array;
        try {
          audio = await extractClipAudioForCaptions(clip.assetId, clip.startSec, clip.spanSec);
        } catch {
          continue; // a clip with no audio in its range — skip it, keep going
        }
        if (controller.signal.aborted) return;

        const raw = await generateCaptions(
          audio,
          options,
          {
            onBackend: (backend) => set({ backend }),
            onDownload: (info) =>
              set({
                download: { file: info.file, progress: info.progress },
                label: `Downloading speech model… ${Math.round(info.progress)}%`,
              }),
            onStatus: (_stage, message) => set({ label: `${message} — clip ${i + 1} of ${clips.length}`, download: null }),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        const cleaned = cleanSegments(raw);
        if (cleaned.length === 0) continue;

        allLayers.push(
          ...buildCaptionLayers({
            segments: cleaned,
            compWidth: settings.width,
            compHeight: settings.height,
            frameRate: settings.frameRate,
            position: options.position,
            style: options.style,
            clipStartOffsetFrames: clip.clipStartFrame,
          }),
        );
      }

      if (controller.signal.aborted) return;

      if (allLayers.length === 0) {
        set({ active: false, label: '', download: null, error: 'No speech was detected in the selected clip(s).' });
        return;
      }

      useEditorStore.getState().addSubtitleClips(allLayers);
      set({ active: false, label: '', download: null, backend: null, error: null });
    } catch (e) {
      if ((e as Error).message === 'Caption generation cancelled') {
        set({ active: false, label: '', download: null });
        return;
      }
      set({ active: false, label: '', download: null, error: (e as Error).message });
    } finally {
      if (abortController === controller) abortController = null;
    }
  },

  dismissError: () => set({ error: null }),

  cancel: () => {
    abortController?.abort();
    abortController = null;
    set({ active: false, label: '', download: null });
  },
}));

/**
 * Convenience trigger: build jobs from the given layer ids (audio layers only), mapping each clip's
 * trim + timeline position into the played source window + global start, then start the batch.
 */
export function autoCaptionAudioLayers(layerIds: string[]): void {
  const { composition } = useEditorStore.getState();
  const fps = composition.settings.frameRate;
  const jobs: ClipCaptionJob[] = composition.layers
    .filter((l): l is AudioLayer => l.type === 'audio' && layerIds.includes(l.id))
    .map((l) => ({
      assetId: l.audio.assetId,
      name: l.name,
      ...captionClipWindow(l.audio.startOffset ?? 0, l.inPoint, l.outPoint, fps),
    }));
  if (jobs.length > 0) void useAutoCaptionStore.getState().run(jobs);
}

