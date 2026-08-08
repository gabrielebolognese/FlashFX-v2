import { useEffect, useRef } from 'react';
import { useProjectStore } from '../hooks/useProjectStore';
import { useAutoSave } from '../hooks/useAutoSave';
import { useEditorStore } from '../../store/editor';
import { Dashboard } from './Dashboard';
import { loadProjectScene, saveProjectPreview } from '../services/projects';
import { mediaAssetManager } from '../../engine/media/assetManager';
import { playbackController } from '../../store/timeline';
import { useTemplateBoot } from '../../templates/useTemplateBoot';
import { TemplateSplash } from '../../templates/TemplateSplash';

interface Props {
  editorComponent: React.ComponentType;
}

export function ProjectApp({ editorComponent: EditorComponent }: Props) {
  const view = useProjectStore((s) => s.view);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const loadedRef = useRef<string | null>(null);
  // Deep-link boot: `/?template=<id>` creates + seeds a project and drops the user into the editor.
  const templateBooting = useTemplateBoot();

  useEffect(() => {
    if (view === 'editor' && activeProjectId && loadedRef.current !== activeProjectId) {
      loadedRef.current = activeProjectId;

      // Isolate caches across projects.
      playbackController.getRenderer()?.flushTextureCaches();

      (async () => {
        const comp = await loadProjectScene(activeProjectId);
        await mediaAssetManager.loadProjectAssets(activeProjectId);
        if (comp) {
          loadDocument(comp);
          requestAnimationFrame(() => {
            playbackController.renderCurrentFrame();
          });
        }
      })();
    }
    if (view === 'dashboard') {
      loadedRef.current = null;
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
      {templateBooting && <TemplateSplash />}
    </>
  );
}

function EditorWithAutoSave({ EditorComponent }: { EditorComponent: React.ComponentType }) {
  useAutoSave();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Capture preview on unmount (when leaving editor)
  useEffect(() => {
    return () => {
      if (!activeProjectId) return;
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) return;

      try {
        canvas.toBlob((blob) => {
          if (blob) saveProjectPreview(activeProjectId, blob);
        }, 'image/webp', 0.7);
      } catch {
        // Canvas may be tainted or WebGPU canvas - skip preview
      }
    };
  }, [activeProjectId]);

  return <EditorComponent />;
}
