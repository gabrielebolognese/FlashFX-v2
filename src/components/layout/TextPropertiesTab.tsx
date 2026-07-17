import React from 'react';
import { DesignElement } from '../../types/design';
import AdvancedTextSettingsPanel from '../design-tool/AdvancedTextSettingsPanel';

interface TextPropertiesTabProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  onApplyTextAnimationControl?: (elementId: string) => void;
}

const TextPropertiesTab: React.FC<TextPropertiesTabProps> = ({
  selectedElements,
  updateElement,
  onApplyTextAnimationControl
}) => {
  if (selectedElements.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xs">No text elements selected</p>
        </div>
      </div>
    );
  }

  const selectedElement = selectedElements[0];
  const isMultiSelect = selectedElements.length > 1;

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      selectedElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="flex-1 overflow-y-auto p-3">
        <AdvancedTextSettingsPanel
          element={selectedElement}
          onUpdate={handleUpdate}
          onApplyTextAnimationControl={onApplyTextAnimationControl}
        />
      </div>
    </div>
  );
};

export default TextPropertiesTab;
