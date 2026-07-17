import React, { useState } from 'react';
import SaveProjectModal from '../modals/SaveProjectModal';
import LoadProjectModal from '../modals/LoadProjectModal';
import { DesignElement } from '../../types/design';
import { ProjectCanvas } from '../../types/projectFile';
import { useProjectFile } from '../../hooks/useProjectFile';
import type { AnimationState } from '../../animation-engine/types';
import type { ExportOptions } from '../../project/types';
import type { ImportResult } from '../../project/types';

interface ProjectManagerProps {
  elements: DesignElement[];
  canvas: ProjectCanvas;
  animationState: AnimationState;
  userId?: string | null;
  userName?: string | null;
  onProjectLoaded: (
    elements: DesignElement[],
    canvas: ProjectCanvas,
    animationState: AnimationState,
    projectName: string
  ) => void;
  children: (handlers: {
    handleSaveClick: () => void;
    handleLoadClick: () => void;
    currentProjectName: string;
  }) => React.ReactNode;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
  elements,
  canvas,
  animationState,
  userId,
  userName,
  onProjectLoaded,
  children,
}) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  const {
    saveProject,
    loadProject,
    currentProjectName,
    isSaving,
    saveProgress,
    saveProgressLabel,
    loadProgress,
    loadProgressLabel,
  } = useProjectFile({ onProjectLoaded });

  const handleSave = async (projectName: string) => {
    const exportOptions: ExportOptions = {
      projectName,
      elements,
      canvas,
      animationState,
      userId: userId || undefined,
      userName: userName || undefined,
    };
    await saveProject(exportOptions);
  };

  const handleLoad = async (file: File): Promise<ImportResult> => {
    return loadProject(file);
  };

  const handleSaveClick = () => setShowSaveModal(true);
  const handleLoadClick = () => setShowLoadModal(true);

  return (
    <>
      {children({ handleSaveClick, handleLoadClick, currentProjectName })}

      <SaveProjectModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSave}
        currentProjectName={currentProjectName}
        isSaving={isSaving}
        saveProgress={saveProgress}
        saveProgressLabel={saveProgressLabel}
      />

      <LoadProjectModal
        isOpen={showLoadModal}
        onClose={() => setShowLoadModal(false)}
        onLoad={handleLoad}
        loadProgress={loadProgress}
        loadProgressLabel={loadProgressLabel}
      />
    </>
  );
};

export default ProjectManager;
