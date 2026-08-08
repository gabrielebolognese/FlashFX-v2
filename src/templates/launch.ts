import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useEditorStore } from '../store/editor';
import { useTimelineStore } from '../store/timeline';
import { TEMPLATES, type TemplateId } from './registry';

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
  });

  await waitForSceneLoad(before);
  await sleep(60); // let the first post-load render settle before mutating

  tpl.apply(useEditorStore.getState());

  if (tpl.autoplay) {
    const t = useTimelineStore.getState();
    t.seekTo(0);
    t.play();
  }
}
