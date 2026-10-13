import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../hooks/useProjectStore';
import { useAutoSave } from '../hooks/useAutoSave';
import { useEditorStore } from '../../store/editor';
import { Dashboard } from './Dashboard';
import { loadProjectScene, saveProjectPreview } from '../services/projects';
import { useIslandStore } from '../../ui/island/islandStore';
import { mediaAssetManager } from '../../engine/media/assetManager';
import { playbackController } from '../../store/timeline';
import { resolveFrame } from '../../core/interpolation';
import { useTemplateBoot } from '../../templates/useTemplateBoot';
import { TemplateSplash } from '../../templates/TemplateSplash';
import { ProjectLoadingSplash } from './ProjectLoadingSplash';

interface Props {
  editorComponent: React.ComponentType;
}

export function ProjectApp({ editorComponent: EditorComponent }: Props) {
  const view = useProjectStore((s) => s.view);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const loadedRef = useRef<string | null>(null);
  // True from the moment a project opens until its scene + assets + first frame have loaded,
  // so a loader page covers the brief main-thread jank of deserialize/resolve/first-render.
  const [projectLoading, setProjectLoading] = useState(false);
  // Deep-link boot: `/?template=<id>` creates + seeds a project and drops the user into the editor.
  const templateBooting = useTemplateBoot();

  useEffect(() => {
    if (view === 'editor' && activeProjectId && loadedRef.current !== activeProjectId) {
      loadedRef.current = activeProjectId;
      setProjectLoading(true);

      // Isolate caches across projects.
      playbackController.getRenderer()?.flushTextureCaches();

      (async () => {
        const comp = await loadProjectScene(activeProjectId);
        if (!comp) {
          // Scene record is present (openProject probed it) but unreadable -> surface it here, the
          // one place that actually deserializes.
          setProjectLoading(false);
          useIslandStore.getState().error("Couldn't open this project. The file may be corrupted or missing.");
          return;
        }
        // PROCEDURAL LOAD: install the document FIRST so the whole interface + every vector layer
        // (shapes, text, layout, the timeline) paints immediately. Media (photos / video / audio) is
        // restored AFTER and streamed in, so a big project no longer blocks the editor behind every
        // asset decode (the old `await loadProjectAssets` before install was the time-to-interactive
        // wall, and decoding all images/audio up front was the OOM risk).
        loadDocument(comp);
        // Drop the loader only after the first frame has rendered: render on the next frame (vector
        // content, media still blank), then lift the splash on the frame after.
        requestAnimationFrame(() => {
          playbackController.renderCurrentFrame();
          requestAnimationFrame(() => setProjectLoading(false));
        });
        // Restore media WITHOUT blocking the paint; re-render once it lands so images/video appear.
        // The renderer already draws nothing for a not-yet-loaded asset, so the interim frames are
        // simply media-less rather than broken.
        mediaAssetManager.loadProjectAssets(activeProjectId)
          .then(() => {
            if (useProjectStore.getState().activeProjectId === activeProjectId) {
              playbackController.renderCurrentFrame();
            }
          })
          .catch((e) => console.warn('[open] asset restore failed:', e));
        // Refresh the project-card thumbnail with a random frame (renderer warm, media loaded by
        // then). Replaces the old preview blob (IDB put overwrites -> the old one is freed).
        captureRandomThumbnail(activeProjectId);
      })();
    }
    if (view === 'dashboard') {
      loadedRef.current = null;
      setProjectLoading(false);
    }
  }, [view, activeProjectId, loadDocument]);

  // The splash OVERLAYS the app (rather than replacing it) so the editor mounts and its WebGPU
  // renderer warms up behind it - launchTemplate pre-rolls frames, then lifts the splash into a
  // smoothly-playing scene.
  return (
    <>
      {view === 'dashboard'
        ? <Dashboard />
        : <EditorWithAutoSave EditorComponent={EditorComponent} />}
      {/* Loader while the opened project's scene/assets/first frame load (main-thread jank). */}
      {view === 'editor' && projectLoading && <ProjectLoadingSplash />}
      {templateBooting && <TemplateSplash />}
    </>
  );
}

// Grab a random frame from the just-opened scene and save it as the project-card thumbnail.
// Renders off-screen on the live renderer (no flash on the visible canvas) and replaces the
// previous preview. Fire-and-forget; a couple seconds' delay lets the renderer warm up and
// media load so the captured frame isn't blank.
function captureRandomThumbnail(projectId: string): void {
  window.setTimeout(() => {
    void (async () => {
      // Bail if the user already navigated away from this project.
      if (useProjectStore.getState().activeProjectId !== projectId) return;
      const renderer = playbackController.getRenderer();
      if (!renderer) return;
      const editor = useEditorStore.getState();
      const comp = editor.composition;
      if (!comp) return;
      const dur = Math.max(1, comp.settings.durationFrames);
      const randomFrame = Math.floor(Math.random() * dur);
      try {
        const frameData = resolveFrame(comp, randomFrame, {
          getComposition: (id) => editor.getComposition(id),
          getStyle: (id) => editor.styles[id],
          depth: 0,
          visited: new Set(),
        });
        const blob = await renderer.captureThumbnail(
          frameData,
          comp.settings.width,
          comp.settings.height
        );
        // Guard again - the async render may have outlived the project being open.
        if (blob && useProjectStore.getState().activeProjectId === projectId) {
          await saveProjectPreview(projectId, blob);
        }
      } catch (e) {
        console.warn('[thumbnail] random-frame capture failed:', e);
      }
    })();
  }, 2000);
}

function EditorWithAutoSave({ EditorComponent }: { EditorComponent: React.ComponentType }) {
  useAutoSave();
  return <EditorComponent />;
}
