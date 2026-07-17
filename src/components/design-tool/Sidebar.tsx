import React from 'react';
import LayersList from './LayersList';
import PropertiesPanel from './PropertiesPanel';
import { DesignElement } from '../../types/design';

interface SidebarProps {
  elements: DesignElement[];
  selectedElement: string | null;
  setSelectedElement: (id: string | null) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  deleteElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  selectedElementData: DesignElement | undefined;
}

const Sidebar: React.FC<SidebarProps> = ({
  elements,
  selectedElement,
  setSelectedElement,
  updateElement,
  deleteElement,
  duplicateElement,
  selectedElementData
}) => {
  return (
    <div className="w-80 bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 flex flex-col">
      <div className="flex-1 flex flex-col min-h-0">
        <LayersList
          elements={elements}
          selectedElement={selectedElement}
          setSelectedElement={setSelectedElement}
          updateElement={updateElement}
          deleteElement={deleteElement}
          duplicateElement={duplicateElement}
        />
        
        <PropertiesPanel
          selectedElement={selectedElementData}
          updateElement={updateElement}
        />
      </div>
    </div>
  );
};

export default Sidebar;