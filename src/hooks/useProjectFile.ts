import { useState, useCallback, useRef } from 'react';
import { DesignElement } from '../types/design';
import { ProjectCanvas } from '../types/projectFile';
import { projectExporter } from '../project/ProjectExporter';
import { projectImporter } from '../project/ProjectImporter';
import type { ExportOptions, ImportResult, AutosaveSnapshot } from '../project/types';
import { AUTOSAVE_STORAGE_KEY, AUTOSAVE_VERSION } from '../project/types';
import type { AnimationState } from '../animation-engine/types';

export interface UseProjectFileOptions {
  onProjectLoaded?: (
    elements: DesignElement[],
    canvas: ProjectCanvas,
    animationState: AnimationState,
    projectName: string
  ) => void;
}

export function useProjectFile(options?: UseProjectFileOptions) {
  const [currentProjectName, setCurrentProjectName] = useState('Untitled Project');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveProgressLabel, setSaveProgressLabel] = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadProgressLabel, setLoadProgressLabel] = useState('');
  const onProjectLoadedRef = useRef(options?.onProjectLoaded);
  onProjectLoadedRef.current = options?.onProjectLoaded;

  const saveProject = useCallback(
    async (exportOptions: ExportOptions): Promise<void> => {
      setIsSaving(true);
      setSaveProgress(0);
      setSaveProgressLabel('Preparing…');
      try {
        const blob = await projectExporter.exportProject({
          ...exportOptions,
          onProgress: (pct, label) => {
            setSaveProgress(pct);
            setSaveProgressLabel(label);
          },
        });
        await projectExporter.saveToFile(blob, exportOptions.projectName);
        setCurrentProjectName(exportOptions.projectName);
      } catch (error) {
        console.error('Failed to save project:', error);
        throw error;
      } finally {
        setIsSaving(false);
        setSaveProgress(0);
        setSaveProgressLabel('');
      }
    },
    []
  );

  const loadProject = useCallback(async (file: File): Promise<ImportResult> => {
    setIsLoading(true);
    setLoadProgress(0);
    setLoadProgressLabel('Preparing…');
    try {
      const result = await projectImporter.importProject(file, (pct, label) => {
        setLoadProgress(pct);
        setLoadProgressLabel(label);
      });

      if (result.success && result.data) {
        const { elements, canvas, animationState, projectName } = result.data;
        onProjectLoadedRef.current?.(elements, canvas, animationState, projectName);
        setCurrentProjectName(projectName);
      }

      return result;
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    } finally {
      setIsLoading(false);
      setLoadProgress(0);
      setLoadProgressLabel('');
    }
  }, []);

  const saveAutosnapshot = useCallback(
    (
      elements: DesignElement[],
      canvas: ProjectCanvas,
      animationState: AnimationState,
      projectName: string
    ) => {
      try {
        const snapshot: AutosaveSnapshot = {
          version: AUTOSAVE_VERSION,
          savedAt: new Date().toISOString(),
          projectName,
          canvas,
          elements,
          animationState,
        };
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        /* ignore storage errors silently */
      }
    },
    []
  );

  const loadAutosnapshot = useCallback((): AutosaveSnapshot | null => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
      if (!raw) return null;
      const snap: AutosaveSnapshot = JSON.parse(raw);
      if (snap.version !== AUTOSAVE_VERSION) return null;
      return snap;
    } catch {
      return null;
    }
  }, []);

  const clearAutosnapshot = useCallback(() => {
    try {
      localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    saveProject,
    loadProject,
    currentProjectName,
    setCurrentProjectName,
    isSaving,
    isLoading,
    saveProgress,
    saveProgressLabel,
    loadProgress,
    loadProgressLabel,
    saveAutosnapshot,
    loadAutosnapshot,
    clearAutosnapshot,
  };
}
