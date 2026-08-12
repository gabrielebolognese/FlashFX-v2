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
import { useTasksStore } from './tasks';
import { useSubtitleReviewStore } from './subtitleReview';

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

    const tasks = useTasksStore.getState();
    tasks.push({ title: 'Auto-caption started', detail: `${clips.length} clip${clips.length > 1 ? 's' : ''} queued`, status: 'info' });

    set({ active: true, index: 0, total: clips.length, label: 'Preparing…', download: null, backend: null, error: null });

    // Snapshot comp settings for building caption layers (comp settings don't change mid-run).
    const settings = useEditorStore.getState().composition.settings;
    const allLayers: TextLayer[] = [];
    // The model downloads once for the batch; track its single log line + progress across clips.
    let downloadTaskId: string | null = null;
    let downloadDone = false;

    try {
      for (let i = 0; i < clips.length; i++) {
        if (controller.signal.aborted) return;
        const clip = clips[i];
        set({ index: i + 1, label: `Transcribing clip ${i + 1} of ${clips.length}…`, download: null });
        const clipTaskId = tasks.push({ title: `Transcribing clip ${i + 1} of ${clips.length}`, detail: clip.name || 'audio', status: 'running', progress: null });

        let audio: Float32Array;
        try {
          audio = await extractClipAudioForCaptions(clip.assetId, clip.startSec, clip.spanSec);
        } catch {
          tasks.update(clipTaskId, { status: 'info', detail: 'No audio in the played range' });
          continue; // a clip with no audio in its range: skip it, keep going
        }
        if (controller.signal.aborted) return;

        const raw = await generateCaptions(
          audio,
          options,
          {
            onBackend: (backend) => set({ backend }),
            onDownload: (info) => {
              set({
                download: { file: info.file, progress: info.progress },
                label: `Downloading speech model… ${Math.round(info.progress)}%`,
              });
              if (downloadTaskId === null) {
                downloadTaskId = tasks.push({ title: 'Downloading speech model', detail: info.file, progress: info.progress, status: 'running' });
              } else {
                tasks.update(downloadTaskId, { progress: info.progress, detail: info.file });
              }
            },
            onStatus: (_stage, message) => {
              set({ label: `${message} (clip ${i + 1} of ${clips.length})`, download: null });
              if (downloadTaskId !== null && !downloadDone) {
                tasks.update(downloadTaskId, { status: 'done', progress: 100, detail: 'Cached for offline use' });
                downloadDone = true;
              }
            },
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        const cleaned = cleanSegments(raw);
        if (cleaned.length === 0) {
          tasks.update(clipTaskId, { status: 'info', detail: 'No speech detected' });
          continue;
        }
        tasks.update(clipTaskId, { status: 'done', detail: `${cleaned.length} caption${cleaned.length > 1 ? 's' : ''} generated` });

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
        tasks.push({ title: 'Auto-caption finished', detail: 'No speech was detected in the selected clip(s).', status: 'info' });
        set({ active: false, label: '', download: null, error: 'No speech was detected in the selected clip(s).' });
        return;
      }

      // Hand the built captions to the non-modal review panel; the user edits the text there and
      // places them (or cancels). Committing happens in useSubtitleReviewStore.place().
      tasks.push({ title: 'Transcription complete', detail: `${allLayers.length} caption${allLayers.length > 1 ? 's' : ''} ready to review`, status: 'done' });
      useSubtitleReviewStore.getState().begin(allLayers);
      set({ active: false, label: '', download: null, backend: null, error: null });
    } catch (e) {
      if ((e as Error).message === 'Caption generation cancelled') {
        tasks.push({ title: 'Auto-caption cancelled', status: 'info' });
        set({ active: false, label: '', download: null });
        return;
      }
      tasks.push({ title: 'Auto-caption failed', detail: (e as Error).message, status: 'error' });
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

