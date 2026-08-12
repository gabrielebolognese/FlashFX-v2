import { create } from 'zustand';
import type { TextLayer } from '../core/types';
import { useEditorStore } from './editor';
import { useTasksStore } from './tasks';

// A non-modal review step between transcription and placement: the auto-caption flow builds the
// caption layers, hands them here, and the SubtitleReviewPanel lets the user edit each line's text
// before committing. Timing/style stay on the pre-built layers; only the text is editable.

interface SubtitleReviewState {
  open: boolean;
  layers: TextLayer[]; // pre-built caption layers (source of truth for timing + style)
  texts: string[]; // editable text per layer, parallel to `layers`
  begin: (layers: TextLayer[]) => void;
  setText: (index: number, text: string) => void;
  /** Apply the edited texts (dropping any emptied lines) and commit to the Subtitles track. */
  place: () => void;
  cancel: () => void;
}

export const useSubtitleReviewStore = create<SubtitleReviewState>((set, get) => ({
  open: false,
  layers: [],
  texts: [],

  begin: (layers) => set({
    open: true,
    layers,
    texts: layers.map((l) => l.content.spans[0]?.text ?? ''),
  }),

  setText: (index, text) => set((s) => {
    const texts = [...s.texts];
    texts[index] = text;
    return { texts };
  }),

  place: () => {
    const { layers, texts } = get();
    const edited = layers
      .map((l, i) => {
        const span = l.content.spans[0];
        return { ...l, content: { ...l.content, spans: span ? [{ ...span, text: texts[i] ?? '' }] : l.content.spans } };
      })
      .filter((l) => (l.content.spans[0]?.text ?? '').trim().length > 0);

    if (edited.length > 0) {
      useEditorStore.getState().addSubtitleClips(edited);
      useTasksStore.getState().push({
        title: 'Captions added',
        detail: `${edited.length} subtitle clip${edited.length > 1 ? 's' : ''} on the Subtitles track`,
        status: 'done',
      });
    }
    set({ open: false, layers: [], texts: [] });
  },

  cancel: () => {
    useTasksStore.getState().push({ title: 'Subtitles discarded', detail: 'Review cancelled before placing', status: 'info' });
    set({ open: false, layers: [], texts: [] });
  },
}));
