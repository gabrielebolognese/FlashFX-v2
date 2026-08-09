import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useEditorStore } from '../store/editor';
import { useTimelineStore, playbackController } from '../store/timeline';
import { TEMPLATES, type TemplateId } from './registry';
import { getTemplate as getAnimationTemplate } from '../animation-templates/catalog';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// After createAndOpenProject flips to the editor, ProjectApp's effect asynchronously loads the new
// scene and replaces the editor store's composition. Seeding before that lands on the wrong doc and
// gets overwritten — so wait until the composition reference actually changes (bounded, then apply
// anyway as a fallback).
async function waitForSceneLoad(prevComposition: unknown): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (useEditorStore.getState().composition !== prevComposition) return;
    await sleep(50);
  }
}

// The silky-start sequence. The caller keeps the "Loading editor…" splash up until this resolves,
// while the WebGPU renderer comes online and we pre-roll a few frames (compiling shaders + warming
// the particle sim) BEFORE starting playback. The heaviest first frames happen behind the splash, so
// when it lifts the animation is already running smoothly instead of stuttering on first play.
async function warmUpAndPlay(): Promise<void> {
  const t = useTimelineStore.getState();
  for (let i = 0; i < 80; i++) {           // wait for the renderer to exist (editor mounted + device up)
    if (playbackController.getRenderer()) break;
    await sleep(50);
  }
  await sleep(150);
  for (let f = 0; f <= 8; f++) { t.seekTo(f); await sleep(45); } // pre-roll: compile shaders, warm the sim
  t.seekTo(0);
  await sleep(80);
  t.play();
  await sleep(160);                        // let a few frames run behind the splash before it lifts
}

/**
 * Open a fresh project seeded from a named template, then (optionally) start playback. Always a NEW
 * project so every deep-link click yields a clean demo scene.
 */
export async function launchTemplate(id: TemplateId): Promise<void> {
  const tpl = TEMPLATES[id];
  if (!tpl) return;

  const before = useEditorStore.getState().composition;
  await useProjectStore.getState().createAndOpenProject({
    name: tpl.name,
    width: tpl.width,
    height: tpl.height,
    videoFormat: tpl.videoFormat,
    ...(tpl.durationFrames ? { durationFrames: tpl.durationFrames } : {}),
  });

  await waitForSceneLoad(before);
  await sleep(60); // let the first post-load render settle before mutating

  tpl.apply(useEditorStore.getState());

  if (tpl.autoplay) {
    await warmUpAndPlay();
  }
}

/**
 * Open a NEW project seeded from one of the animation-template library entries (the dashboard
 * "Templates" tab), then autoplay it. Same create→wait→seed→warm-up flow as the deep-link
 * templates, but the scene is built by the animation-template (inserted at the playhead) rather
 * than a deep-link `apply`. The project persists, so it shows up under Recents like any project.
 */
export async function launchAnimationTemplate(animationTemplateId: string): Promise<void> {
  const tpl = getAnimationTemplate(animationTemplateId);
  if (!tpl) return;

  const before = useEditorStore.getState().composition;
  await useProjectStore.getState().createAndOpenProject({
    name: tpl.name,
    width: 1920,
    height: 1080,
    videoFormat: 'long',
    durationFrames: tpl.durationFrames,
  });

  await waitForSceneLoad(before);
  await sleep(60);

  useEditorStore.getState().insertAnimationTemplate(tpl.id);

  await warmUpAndPlay();
}
