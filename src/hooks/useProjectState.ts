import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DesignElement } from '../types/design';
import { ProjectFile, ProjectChangeLogEntry, ProjectValidationError, ProjectApplyResult } from '../types/project';
import { CURRENT_SCHEMA_VERSION } from '../utils/projectSchema';

interface ProjectStateHook {
  projectFile: ProjectFile;
  updateProjectFile: (newProject: ProjectFile) => void;
  serializeProject: (elements: DesignElement[], selectedElements: string[]) => string;
  deserializeProject: (jsonString: string) => { elements: DesignElement[]; selectedElements: string[] };
  createNewProject: (name?: string) => ProjectFile;
  addChangeLogEntry: (summary: string, diff?: any) => void;
  isProjectDirty: boolean;
  lastValidProject: ProjectFile | null;
}

export const useProjectState = (
  initialElements: DesignElement[] = [],
  initialSelected: string[] = []
): ProjectStateHook => {
  const [projectFile, setProjectFile] = useState<ProjectFile>(() => 
    createInitialProject(initialElements, initialSelected)
  );
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const lastValidProjectRef = useRef<ProjectFile | null>(null);

  // Track changes for dirty state
  const updateProjectFile = useCallback((newProject: ProjectFile) => {
    const updatedProject = {
      ...newProject,
      updatedAt: new Date().toISOString()
    };
    
    setProjectFile(updatedProject);
    lastValidProjectRef.current = updatedProject;
    setIsProjectDirty(true);
    
    // Auto-save to localStorage
    try {
      localStorage.setItem('flashfx-project', JSON.stringify(updatedProject));
    } catch (error) {
      console.warn('Failed to save project to localStorage:', error);
    }
  }, []);

  const addChangeLogEntry = useCallback((summary: string, diff?: any) => {
    const entry: ProjectChangeLogEntry = {
      id: uuidv4(),
      ts: new Date().toISOString(),
      summary,
      diff
    };

    setProjectFile(prev => ({
      ...prev,
      changeLog: [...(prev.changeLog || []), entry].slice(-100), // Keep last 100 entries
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const serializeProject = useCallback((elements: DesignElement[], selectedElements: string[]) => {
    // Convert elements array to byId + order structure
    const elementsById: Record<string, DesignElement> = {};
    const elementOrder: string[] = [];
    
    elements.forEach(element => {
      elementsById[element.id] = {
        ...element,
        // Round numeric values for consistency
        x: Math.round(element.x * 100) / 100,
        y: Math.round(element.y * 100) / 100,
        width: Math.round(element.width * 100) / 100,
        height: Math.round(element.height * 100) / 100,
        rotation: Math.round((element.rotation ?? 0) * 100) / 100,
        opacity: Math.round((element.opacity ?? 1) * 100) / 100,
        strokeWidth: Math.round((element.strokeWidth ?? 0) * 100) / 100,
        borderRadius: Math.round((element.borderRadius ?? 0) * 100) / 100,
        shadow: element.shadow ? {
          ...element.shadow,
          blur: Math.round(element.shadow.blur * 100) / 100,
          x: Math.round(element.shadow.x * 100) / 100,
          y: Math.round(element.shadow.y * 100) / 100
        } : { blur: 0, x: 0, y: 0, color: '#000000' }
      };
      elementOrder.push(element.id);
    });

    const updatedProject: ProjectFile = {
      ...projectFile,
      elements: {
        byId: elementsById,
        order: elementOrder,
        groups: projectFile.elements.groups
      },
      updatedAt: new Date().toISOString()
    };

    return JSON.stringify(updatedProject, null, 2);
  }, [projectFile]);

  const deserializeProject = useCallback((jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString) as ProjectFile;
      
      // Convert byId + order structure back to elements array
      const elements: DesignElement[] = [];
      
      parsed.elements.order.forEach(id => {
        const element = parsed.elements.byId[id];
        if (element) {
          elements.push(element);
        }
      });

      // Use existing selection or empty array
      const selectedElements = projectFile.elements.order.filter(id => 
        parsed.elements.byId[id]
      );

      // Update project file state
      setProjectFile(parsed);
      lastValidProjectRef.current = parsed;
      
      return {
        elements,
        selectedElements: selectedElements.length > 0 ? selectedElements : []
      };
    } catch (error) {
      throw new Error(`Failed to parse project JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [projectFile.elements.order]);

  const createNewProject = useCallback((name?: string) => {
    return createInitialProject([], [], name);
  }, []);

  return {
    projectFile,
    updateProjectFile,
    serializeProject,
    deserializeProject,
    createNewProject,
    addChangeLogEntry,
    isProjectDirty,
    lastValidProject: lastValidProjectRef.current
  };
};

// Helper function to create initial project structure
function createInitialProject(
  elements: DesignElement[] = [],
  selectedElements: string[] = [],
  name?: string
): ProjectFile {
  const now = new Date().toISOString();
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Convert elements to byId + order structure
  const elementsById: Record<string, DesignElement> = {};
  const elementOrder: string[] = [];
  
  elements.forEach(element => {
    elementsById[element.id] = element;
    elementOrder.push(element.id);
  });

  return {
    proj_id: projectId,
    name: name || 'Untitled Project',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    author: {
      id: 'local-user',
      name: 'Local User'
    },
    canvas: {
      width: 3840,
      height: 2160,
      fps: 60,
      background: '#1F2937',
      unit: 'px',
      grid: {
        enabled: true,
        size: 40,
        snap: true
      }
    },
    elements: {
      byId: elementsById,
      order: elementOrder,
      groups: {}
    },
    animations: {
      byId: {},
      order: []
    },
    assets: {
      images: {},
      audio: {},
      fonts: {}
    },
    settings: {
      defaultEasing: 'easeOutCubic',
      exportDefaults: {
        format: 'webm',
        quality: 0.8
      },
      autosaveIntervalMs: 30000,
      editor: {
        gridSnap: true,
        showRulers: false
      }
    },
    metadata: {
      tags: [],
      description: '',
      thumbnail: null,
      protected: false,
      versionLabel: '1.0.0'
    },
    changeLog: [],
    sync: {
      remoteId: null,
      lastSyncedAt: null,
      revision: 0
    }
  };
}