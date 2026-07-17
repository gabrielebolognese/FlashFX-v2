import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, Download } from 'lucide-react';
import { DesignElement } from '../../types/design';

interface LayersListProps {
  elements: DesignElement[];
  selectedElement: string | null;
  setSelectedElement: (id: string | null) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  deleteElement: (id: string) => void;
  duplicateElement: (id: string) => void;
}

const LayersList: React.FC<LayersListProps> = ({
  elements,
  selectedElement,
  setSelectedElement,
  updateElement,
  deleteElement,
  duplicateElement
}) => {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const handleNameEdit = (id: string, currentName: string) => {
    setEditingName(id);
    setEditingValue(currentName);
  };

  const handleNameSubmit = (id: string) => {
    if (editingValue.trim()) {
      updateElement(id, { name: editingValue.trim() });
    }
    setEditingName(null);
    setEditingValue('');
  };

  const exportElement = async (element: DesignElement) => {
    try {
      // Find the actual DOM element by ID
      const domElement = document.querySelector(`[data-element-id="${element.id}"]`) as HTMLElement;
      
      if (!domElement) {
        console.error(`Element with ID ${element.id} not found in DOM`);
        return;
      }

      // Create a temporary container for export
      const exportContainer = document.createElement('div');
      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '-9999px';
      exportContainer.style.top = '-9999px';
      exportContainer.style.width = `${element.width}px`;
      exportContainer.style.height = `${element.height}px`;
      exportContainer.style.backgroundColor = 'transparent';
      
      // Clone the element
      const clonedElement = domElement.cloneNode(true) as HTMLElement;
      
      // Reset position for export
      clonedElement.style.position = 'relative';
      clonedElement.style.left = '0';
      clonedElement.style.top = '0';
      clonedElement.style.transform = 'none';
      
      exportContainer.appendChild(clonedElement);
      document.body.appendChild(exportContainer);

      // Import toPng dynamically
      const { toPng } = await import('html-to-image');

      // Export as PNG
      const dataUrl = await toPng(exportContainer, {
        cacheBust: true,
        backgroundColor: 'transparent',
        pixelRatio: 2,
        width: element.width,
        height: element.height
      });

      // Clean up
      document.body.removeChild(exportContainer);

      // Download
      const link = document.createElement('a');
      link.download = `${element.name.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-gray-700/50">
        <h3 className="text-lg font-semibold text-white mb-2">Layers</h3>
        <div className="text-sm text-gray-400">
          {elements.length} element{elements.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {elements.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No elements yet. Add shapes or UI components to get started.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {elements.map((element) => (
              <div
                key={element.id}
                className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                  selectedElement === element.id
                    ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-400'
                    : 'bg-gray-700/30 border-gray-600/30 text-gray-300 hover:bg-gray-600/40'
                }`}
                onClick={() => setSelectedElement(element.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  {editingName === element.id ? (
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => handleNameSubmit(element.id)}
                      onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit(element.id)}
                      className="bg-gray-600 text-white px-2 py-1 rounded text-sm flex-1 mr-2"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="font-medium truncate flex-1"
                      onDoubleClick={() => handleNameEdit(element.id, element.name)}
                    >
                      {element.name}
                    </span>
                  )}
                  
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement(element.id, { visible: !element.visible });
                      }}
                      className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                    >
                      {element.visible ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement(element.id, { locked: !element.locked });
                      }}
                      className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                    >
                      {element.locked ? (
                        <Lock className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 capitalize">
                    {element.type.replace('-', ' ')}
                  </span>
                  
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportElement(element);
                      }}
                      className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                      title="Export as PNG"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateElement(element.id);
                      }}
                      className="p-1 rounded hover:bg-gray-600/50 transition-colors"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement(element.id);
                      }}
                      className="p-1 rounded hover:bg-red-600/50 transition-colors text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayersList;