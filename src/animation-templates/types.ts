import type { Layer } from '../core/types';

// A ready-made animation the user inserts into the current composition ("Use this"). Each template is
// a BUILDER FUNCTION that assembles ordinary shape/text/group layers with real keyframes + easing,
// authored 0-based (frame 0 = animation start) around a given centre. On insert we rebase the
// keyframes to the playhead. Because build() uses the factories, every id is already fresh and every
// child is parent-linked to the group it makes — no cloning / id-regen needed.

export type TemplateCategory =
  | 'calendar'
  | 'titles'
  | 'lists'
  | 'charts'
  | 'logo';

export interface BuildCtx {
  /** Where to place the animation, in composition space (comp centre, or the drop point). */
  center: [number, number];
  frameRate: number;
}

export interface AnimationTemplate {
  /** Stable slug — the id the UI/store use. */
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  /** Template length, in the authoring fps. Every clip spans this. */
  durationFrames: number;
  /** fps the keyframes were authored at (rebased/rescaled on insert). */
  authorFps: number;
  /** Assemble the layers: fresh ids, parent-linked to a root group, 0-based keyframes. */
  build: (ctx: BuildCtx) => Layer[];
}
