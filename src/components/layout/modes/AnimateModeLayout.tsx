import React from 'react';
import DesignModeLayout from './DesignModeLayout';
import { DesignElement } from '../../../types/design';

interface AnimateModeLayoutProps {
  elements: DesignElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  deleteElement: (id: string) => void;
  reparentToBox?: (elementId: string, containerId: string) => void;
  duplicateElement: (id: string) => void;
  onAddElement: (element: DesignElement) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onExportDesign?: () => void;
  onRenderSequence?: () => void;
  onExportLayers?: () => void;
  onDownloadProject?: () => void;
  editorMode?: boolean;
  onBackToMain?: () => void;
}

const AnimateModeLayout: React.FC<AnimateModeLayoutProps> = (props) => {
  return (
    <div className="h-full">
      <div className="h-full">
        <DesignModeLayout
          elements={props.elements}
          selectedElements={props.selectedElements}
          setSelectedElements={props.setSelectedElements}
          updateElement={props.updateElement}
          deleteElement={props.deleteElement}
          reparentToBox={props.reparentToBox}
          duplicateElement={props.duplicateElement}
          onAddElement={props.onAddElement}
          zoom={props.zoom}
          setZoom={props.setZoom}
          pan={props.pan}
          setPan={props.setPan}
          showGrid={props.showGrid}
          setShowGrid={props.setShowGrid}
          snapEnabled={props.snapEnabled}
          setSnapEnabled={props.setSnapEnabled}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
          onGroup={props.onGroup}
          onUngroup={props.onUngroup}
          onExportDesign={props.onExportDesign}
          onRenderSequence={props.onRenderSequence}
          onExportLayers={props.onExportLayers}
          onDownloadProject={props.onDownloadProject}
          editorMode={false}
          onBackToMain={undefined}
        />
      </div>
    </div>
  );
};

export default AnimateModeLayout;
