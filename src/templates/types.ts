import type { useEditorStore } from '../store/editor';

// A deep-link template: a named starter scene the app owns. The landing page links to
// `/?template=<id>`; the app creates a fresh project and runs `apply` to seed it with real editor
// actions (same approach as the tutorial director), so the result is a normal, editable, saved
// project. Whitelist-only — an unknown id is ignored, never trusted as scene data.

export type TemplateEditor = ReturnType<typeof useEditorStore.getState>;

export interface Template {
  /** Project name shown in the dashboard. */
  name: string;
  width: number;
  height: number;
  videoFormat: 'long' | 'short';
  /** Start playback once seeded (nice for motion demos like particles). */
  autoplay?: boolean;
  /** Seed the freshly-opened, loaded scene via store actions. */
  apply: (editor: TemplateEditor) => void;
}
