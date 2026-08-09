import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../hooks/useProjectStore';
import { useAutoSave } from '../hooks/useAutoSave';
import { useEditorStore } from '../../store/editor';
import { Dashboard } from './Dashboard';
import { loadProjectScene, saveProjectPreview } from '../services/projects';
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
        await mediaAssetManager.loadProjectAssets(activeProjectId);
        if (comp) {
          loadDocument(comp);
          // Drop the loader only after the first (heavy) frame has actually rendered: render on
          // the next frame, then lift the splash on the frame after so the editor is painted
          // with content underneath before it's revealed.
          requestAnimationFrame(() => {
            playbackController.renderCurrentFrame();
            requestAnimationFrame(() => setProjectLoading(false));
          });
          // Refresh the project-card thumbnail with a random frame from this scene so tens of
          // projects stay visually distinguishable. Runs a couple seconds after open (renderer
          // warm, media loaded) and replaces the old preview blob (IDB put overwrites → the old
          // one is freed).
          captureRandomThumbnail(activeProjectId);
        } else {
          setProjectLoading(false);
        }
      })();
    }
    if (view === 'dashboard') {
      loadedRef.current = null;
      setProjectLoading(false);
    }
  }, [view, activeProjectId, loadDocument]);

  // The splash OVERLAYS the app (rather than replacing it) so the editor mounts and its WebGPU
  // renderer warms up behind it — launchTemplate pre-rolls frames, then lifts the splash into a
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
        // Guard again — the async render may have outlived the project being open.
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
