import { create } from 'zustand';
import {
  cleanSegments,
  DEFAULT_CAPTION_OPTIONS,
  type CaptionOptions,
  type CaptionSegment,
} from '../core/captions';
import { extractAudioForCaptions } from '../engine/captions/audioExtraction';
import { generateCaptions, type CaptionBackend } from '../engine/captions/captionService';

export type CaptionStage =
  | 'idle'
  | 'options'
  | 'extracting'
  | 'downloading'
  | 'loading-model'
  | 'transcribing'
  | 'preview'
  | 'error';

interface DownloadInfo {
  file: string;
  progress: number;
  loaded: number;
  total: number;
}

interface CaptionState {
  isOpen: boolean;
  targetLayerId: string | null;
  targetAssetId: string | null;
  targetClipStartFrame: number;
  targetName: string;

  options: CaptionOptions;
  stage: CaptionStage;
  backend: CaptionBackend | null;
  download: DownloadInfo | null;
  statusMessage: string;
  error: string | null;

  previewSegments: CaptionSegment[] | null;
  processingTimeMs: number;

  open: (args: { layerId: string; assetId: string; clipStartFrame: number; name: string }) => void;
  close: () => void;
  setOption: (partial: Partial<CaptionOptions>) => void;
  startGeneration: () => Promise<void>;
  cancel: () => void;
}

let abortController: AbortController | null = null;

const initial = {
  isOpen: false,
  targetLayerId: null,
  targetAssetId: null,
  targetClipStartFrame: 0,
  targetName: '',
  options: { ...DEFAULT_CAPTION_OPTIONS },
  stage: 'idle' as CaptionStage,
  backend: null,
  download: null,
  statusMessage: '',
  error: null,
  previewSegments: null,
  processingTimeMs: 0,
};

export const useCaptionStore = create<CaptionState>((set, get) => ({
  ...initial,

  open: ({ layerId, assetId, clipStartFrame, name }) => {
    set({
      ...initial,
      isOpen: true,
      stage: 'options',
      targetLayerId: layerId,
      targetAssetId: assetId,
      targetClipStartFrame: clipStartFrame,
      targetName: name,
      options: { ...DEFAULT_CAPTION_OPTIONS },
    });
  },

  close: () => {
    abortController?.abort();
    abortController = null;
    set({ ...initial });
  },

  setOption: (partial) => {
    set((s) => ({ options: { ...s.options, ...partial } }));
  },

  cancel: () => {
    abortController?.abort();
    abortController = null;
    set({ stage: 'options', download: null, statusMessage: '' });
  },

  startGeneration: async () => {
    const { targetAssetId, options } = get();
    if (!targetAssetId) return;

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    const startedAt = performance.now();
    set({ stage: 'extracting', error: null, statusMessage: 'Extracting audio', download: null });

    try {
      const audio = await extractAudioForCaptions(targetAssetId);
      if (controller.signal.aborted) return;

      const raw = await generateCaptions(
        audio,
        options,
        {
          onBackend: (backend) => set({ backend }),
          onDownload: (info) =>
            set({
              stage: 'downloading',
              download: info,
              statusMessage: `Downloading model (${info.file})`,
            }),
          onStatus: (stage, message) => set({ stage, statusMessage: message }),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      const cleaned = cleanSegments(raw);
      if (cleaned.length === 0) {
        set({ stage: 'error', error: 'No speech was detected in this clip.' });
        return;
      }

      set({
        stage: 'preview',
        previewSegments: cleaned,
        processingTimeMs: performance.now() - startedAt,
        download: null,
        statusMessage: '',
      });
    } catch (e) {
      if ((e as Error).message === 'Caption generation cancelled') {
        set({ stage: 'options', download: null, statusMessage: '' });
        return;
      }
      set({ stage: 'error', error: (e as Error).message });
    } finally {
      if (abortController === controller) abortController = null;
    }
  },
}));
