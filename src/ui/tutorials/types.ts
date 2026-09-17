// A per-panel tutorial: the copy shown in the Tutorial panel + the one-click "See example" action.
// One TutorialDef per inspector/global panel, registered in ./registry. The `seeExample` action
// creates ONE meaningful demo for that panel via the editor store (undoable), so a user can see the
// feature in action immediately after reading.

export interface TutorialDef {
  /** Stable id (kebab-case), e.g. 'material'. Referenced by the panel's Tutorial button. */
  id: string;
  /** Button label suffix — the button reads "Tutorial: How to use {label}". e.g. 'Materials'. */
  label: string;
  /** Heading shown at the top of the tutorial panel. e.g. 'Fill & Stroke Materials'. */
  title: string;
  /** Caption under the (placeholder) video — the future clip's filename. e.g. 'materials.mp4'. */
  videoCaption: string;
  /** One or two intro sentences describing what the panel is for. */
  intro: string;
  /** "What you can do" bullet points (concise, user-facing). */
  bullets: string[];
  /** Label for the See Example button, e.g. 'Create example shapes'. */
  exampleLabel: string;
  /** Build ONE meaningful demo for this panel via useEditorStore.getState() actions (undoable). */
  seeExample: () => void;
}
