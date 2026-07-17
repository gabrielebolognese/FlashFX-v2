import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, Download, Group, Ungroup, Search, Code, Layers, Bot, Palette, Save, LogOut, FolderOpen, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, ChevronRight, ChevronDown } from 'lucide-react';
import { DesignElement } from '../../types/design';
import AIChatTab from './AIChatTab';
import PresetsTab from './PresetsTab';
import MediaPoolTab from './MediaPoolTab';
import SavePresetModal from '../modals/SavePresetModal';
import LayerContextMenu from './LayerContextMenu';

interface LayersPanelProps {
  elements: DesignElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  deleteElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  moveElementUp: (id: string) => void;
  moveElementDown: (id: string) => void;
  bringElementToFront: (id: string) => void;
  sendElementToBack: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onOpenJsonEditor: (element: DesignElement) => void;
  onOpenProjectJsonEditor: () => void;
  onOpenLineProperties: () => void;
  onAddElement?: (element: DesignElement) => void;
  onAddMultipleElements?: (elements: DesignElement[]) => void;
  onUpdateElement?: (id: string, updates: Partial<DesignElement>) => void;
  onApplyProject?: (elements: DesignElement[], selectedElements: string[]) => void;
  onSetActiveTool?: (tool: string) => void;
  onSetPendingImageElement?: (element: DesignElement) => void;
  onSetPendingVideoAsset?: (asset: import('../../video/types').VideoAsset) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSavePreset?: (name: string, description: string, elements: DesignElement[]) => Promise<void>;
  userId?: string | null;
  isGuest?: boolean;
  onSaveProject?: () => Promise<void>;
  onExitToHome?: () => void;
  canvasSize?: { width: number; height: number };
  onEnterGroup?: (groupId: string) => void;
  activeGroupId?: string | null;
}

const LayersPanel: React.FC<LayersPanelProps> = ({
  elements,
  selectedElements,
  setSelectedElements,
  updateElement,
  deleteElement,
  duplicateElement,
  moveElementUp,
  moveElementDown,
  bringElementToFront,
  sendElementToBack,
  onGroup,
  onUngroup,
  onOpenJsonEditor,
  onOpenLineProperties,
  onOpenProjectJsonEditor,
  onAddElement,
  onAddMultipleElements,
  onUpdateElement,
  onApplyProject,
  onSetActiveTool,
  onSetPendingImageElement,
  onSetPendingVideoAsset,
  isCollapsed = false,
  onToggleCollapse,
  onSavePreset,
  userId = null,
  isGuest = false,
  onSaveProject,
  onExitToHome,
  canvasSize = { width: 3840, height: 2160 },
  onEnterGroup,
  activeGroupId = null,
}) => {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'layers' | 'ai' | 'presets' | 'media' | 'json'>('layers');
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [autosaveCountdown, setAutosaveCountdown] = useState(60);
  const [isSaving, setIsSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layer: DesignElement } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const handleElementClick = (id: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      // Multi-select with Ctrl+Click
      if (selectedElements.includes(id)) {
        setSelectedElements(selectedElements.filter(selId => selId !== id));
      } else {
        setSelectedElements([...selectedElements, id]);
      }
    } else {
      setSelectedElements([id]);
    }
  };

  const handleLayerContextMenu = (e: React.MouseEvent, element: DesignElement) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      layer: element
    });
  };

  const handleCenterLayer = (id: string) => {
    const element = elements.find(el => el.id === id);
    if (!element) return;

    const centerX = (canvasSize.width - element.width) / 2;
    const centerY = (canvasSize.height - element.height) / 2;

    updateElement(id, { x: centerX, y: centerY });
  };

  const handleSaveAsPreset = () => {
    if (selectedElements.length === 0) return;

    const selectedGroup = elements.find(el => el.id === selectedElements[0] && el.type === 'group');
    if (!selectedGroup) {
      alert('Please select a group to save as preset');
      return;
    }

    setShowSavePresetModal(true);
  };

  const handlePresetSave = async (name: string, description: string) => {
    const selectedGroup = elements.find(el => el.id === selectedElements[0] && el.type === 'group');
    if (!selectedGroup || !onSavePreset) return;

    const presetElements = selectedGroup.children || [];
    await onSavePreset(name, description, presetElements);
  };

  const handleManualSave = async () => {
    if (isSaving || !onSaveProject) return;
    setIsSaving(true);
    try {
      await onSaveProject();
      setAutosaveCountdown(60);
    } catch (error) {
      console.error('Error saving project:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExit = () => {
    if (!onExitToHome) return;

    const shouldSave = confirm('Do you want to save your changes before exiting?');
    if (shouldSave && onSaveProject) {
      onSaveProject().then(() => {
        onExitToHome();
      }).catch((error) => {
        console.error('Error saving before exit:', error);
        const forceExit = confirm('Failed to save. Exit anyway?');
        if (forceExit) {
          onExitToHome();
        }
      });
    } else {
      onExitToHome();
    }
  };

  // Autosave countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setAutosaveCountdown((prev) => {
        if (prev <= 1) {
          // Trigger autosave
          if (onSaveProject && !isSaving) {
            onSaveProject().catch(console.error);
          }
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onSaveProject, isSaving]);


  const renderElement = (element: DesignElement, depth = 0, isChildOfGroup = false, parentGroupId?: string) => {
    const isSelected = selectedElements.includes(element.id);
    const hasChildren = element.type === 'group' && element.children && element.children.length > 0;
    const isCollapsed = collapsedGroups.has(element.id);
    const isActiveGroup = activeGroupId === element.id;

    if (searchTerm && !element.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return null;
    }

    const handleClick = (e: React.MouseEvent) => {
      if (isChildOfGroup && parentGroupId && onEnterGroup) {
        onEnterGroup(parentGroupId);
      }
      handleElementClick(element.id, e.ctrlKey);
    };

    return (
      <div key={element.id}>
        <div
          className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
            isSelected
              ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-400'
              : isActiveGroup
              ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
              : 'bg-gray-700/30 border-gray-600/30 text-gray-300 hover:bg-gray-600/40'
          }`}
          style={{ marginLeft: depth * 16 }}
          onClick={handleClick}
          onContextMenu={(e) => handleLayerContextMenu(e, element)}
        >
          <div className="flex items-center justify-between mb-1.5">
            {editingName === element.id ? (
              <input
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={() => handleNameSubmit(element.id)}
                onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit(element.id)}
                className="bg-gray-600 text-white px-1.5 py-0.5 rounded text-xs flex-1 mr-1.5"
                autoFocus
              />
            ) : (
              <div className="flex items-center flex-1 min-w-0">
                {hasChildren && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedGroups(prev => {
                        const next = new Set(prev);
                        if (next.has(element.id)) {
                          next.delete(element.id);
                        } else {
                          next.add(element.id);
                        }
                        return next;
                      });
                    }}
                    className="p-0.5 mr-1 rounded hover:bg-gray-600/50 flex-shrink-0"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 text-yellow-400" />
                      : <ChevronDown className="w-3 h-3 text-yellow-400" />
                    }
                  </button>
                )}
                {hasChildren && (
                  <Group className="w-3 h-3 mr-1.5 text-yellow-400 flex-shrink-0" />
                )}
                <span
                  className="font-medium truncate flex-1 text-xs"
                  onDoubleClick={() => handleNameEdit(element.id, element.name)}
                >
                  {element.name}
                </span>
              </div>
            )}
            
            <div className="flex items-center space-x-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(element.id, { visible: !element.visible });
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
              >
                {element.visible ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-gray-500" />
                )}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(element.id, { locked: !element.locked });
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
              >
                {element.locked ? (
                  <Lock className="w-3 h-3 text-yellow-400" />
                ) : (
                  <Unlock className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 capitalize">
              {element.type.replace('-', ' ')}
              {hasChildren && ` (${element.children!.length} items)`}
            </span>
            
            <div className="flex items-center space-x-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  bringElementToFront(element.id);
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title="Bring to Front"
              >
                <ChevronsUp className="w-2.5 h-2.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  moveElementUp(element.id);
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title="Move Forward"
              >
                <ArrowUp className="w-2.5 h-2.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  moveElementDown(element.id);
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title="Move Backward"
              >
                <ArrowDown className="w-2.5 h-2.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  sendElementToBack(element.id);
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title="Send to Back"
              >
                <ChevronsDown className="w-2.5 h-2.5" />
              </button>

              <div className="w-px h-3 bg-gray-600 mx-0.5"></div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (element.type === 'line') {
                    onOpenLineProperties();
                  } else {
                    onOpenJsonEditor(element);
                  }
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title={element.type === 'line' ? 'Open Line Properties' : 'Edit JSON'}
              >
                <Code className="w-2.5 h-2.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateElement(element.id);
                }}
                className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                title="Duplicate"
              >
                <Copy className="w-2.5 h-2.5" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElement(element.id);
                }}
                className="p-0.5 rounded hover:bg-red-600/50 transition-colors text-red-400"
                title="Delete"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Render children for groups */}
        {hasChildren && !isCollapsed && element.children!.map(child =>
          renderElement(child, depth + 1, true, element.id)
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="h-full bg-gray-800/50 backdrop-blur-xl flex flex-col items-center py-4 border-r border-gray-700/50">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200 mb-2"
          title="Expand Layers Panel"
        >
          <Layers className="w-5 h-5 text-gray-300" />
        </button>
        <button
          onClick={() => {
            onToggleCollapse?.();
            setActiveTab('ai');
          }}
          className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-all duration-200"
          title="Open AI Assistant"
        >
          <Bot className="w-5 h-5 text-blue-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-800/50 backdrop-blur-xl flex flex-col overflow-hidden min-h-0" data-tutorial-target="layers-panel">
      {/* Tab Navigation */}
      <div className="p-2 border-b border-gray-700/50">
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center space-x-1 text-xs">
            <span className="text-gray-500">Autosave:</span>
            <span className="font-mono text-yellow-400 font-semibold">{autosaveCountdown}s</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-0.5 bg-gray-700/30 rounded p-0.5 text-xs">
          <button
            onClick={() => setActiveTab('layers')}
            className={`flex-1 flex items-center justify-center space-x-1 px-1 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'layers'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Layers className="w-2.5 h-2.5" />
            <span>Layers</span>
          </button>

          <button
            onClick={() => setActiveTab('media')}
            data-tutorial-target="media-tab"
            className={`flex-1 flex items-center justify-center space-x-1 px-1 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'media'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <FolderOpen className="w-2.5 h-2.5" />
            <span>Media</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            data-tutorial-target="ai-tab"
            className={`flex-1 flex items-center justify-center space-x-1 px-1 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'ai'
                ? 'bg-gradient-to-r from-violet-500/20 to-pink-500/20 text-violet-400 border border-violet-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Bot className="w-2.5 h-2.5" />
            <span>AI</span>
          </button>

          <button
            onClick={() => setActiveTab('presets')}
            data-tutorial-target="presets-tab"
            className={`flex-1 flex items-center justify-center space-x-1 px-1 py-1 rounded font-medium transition-all duration-200 ${
              activeTab === 'presets'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Palette className="w-2.5 h-2.5" />
            <span>Presets</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'layers' && (
          <div className="h-full flex flex-col layers-panel">
            <div className="p-2 border-b border-gray-700/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-white">Layers</h3>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onOpenProjectJsonEditor}
                    disabled={!onOpenProjectJsonEditor}
                    className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                    title="Open Project JSON Editor (Ctrl+E)"
                    aria-label="Open project JSON editor"
                  >
                    <Code className="w-3 h-3 text-gray-400 hover:text-yellow-400" />
                  </button>
                  {onToggleCollapse && (
                    <button
                      onClick={onToggleCollapse}
                      className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
                      title="Collapse Panel"
                    >
                      <Layers className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Search */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search layers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/50"
                />
              </div>

              {/* Group/Ungroup Actions */}
              <div className="flex items-center space-x-1 mb-2">
                <button
                  onClick={onGroup}
                  disabled={selectedElements.length < 2}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-all duration-200 ${
                    selectedElements.length >= 2
                      ? 'bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30'
                      : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Group Selected (Ctrl+G)"
                >
                  <Group className="w-3 h-3 mx-auto" />
                </button>

                <button
                  onClick={onUngroup}
                  disabled={selectedElements.length !== 1 || !elements.find(el => el.id === selectedElements[0] && el.type === 'group')}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-all duration-200 ${
                    selectedElements.length === 1 && elements.find(el => el.id === selectedElements[0] && el.type === 'group')
                      ? 'bg-orange-400/20 text-orange-400 hover:bg-orange-400/30'
                      : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Ungroup Selected (Ctrl+Shift+G)"
                >
                  <Ungroup className="w-3 h-3 mx-auto" />
                </button>

                <button
                  onClick={handleSaveAsPreset}
                  disabled={selectedElements.length !== 1 || !elements.find(el => el.id === selectedElements[0] && el.type === 'group')}
                  className={`flex-1 px-2 py-1 rounded text-xs transition-all duration-200 ${
                    selectedElements.length === 1 && elements.find(el => el.id === selectedElements[0] && el.type === 'group')
                      ? 'bg-gradient-to-r from-blue-400/20 to-purple-400/20 text-blue-400 hover:from-blue-400/30 hover:to-purple-400/30'
                      : 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                  }`}
                  title="Save as Preset"
                >
                  <Save className="w-3 h-3 mx-auto" />
                </button>
              </div>
              
              <div className="text-xs text-gray-400">
                {elements.length} element{elements.length !== 1 ? 's' : ''}
                {selectedElements.length > 0 && ` • ${selectedElements.length} selected`}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="overflow-x-auto min-w-0">
                {elements.length === 0 ? (
                  <div className="p-3 text-center text-gray-500">
                    No elements yet. Add shapes or UI components to get started.
                  </div>
                ) : (
                  <div className="p-1.5 space-y-1 min-w-[200px]">
                    {[...elements].reverse().map((element) => renderElement(element))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && onAddElement && (
          <AIChatTab
            onAddElement={onAddElement}
            onAddMultipleElements={onAddMultipleElements}
            onUpdateElement={onUpdateElement}
          />
        )}

        {activeTab === 'presets' && onAddMultipleElements && (
          <PresetsTab
            userId={userId}
            isGuest={isGuest}
            onAddPreset={onAddMultipleElements}
            selectedElementId={selectedElements.length === 1 ? selectedElements[0] : null}
          />
        )}

        {activeTab === 'media' && onAddElement && (
          <MediaPoolTab
            onAddElement={onAddElement}
            elements={elements}
            onSetActiveTool={onSetActiveTool}
            onSetPendingImageElement={onSetPendingImageElement}
            onSetPendingVideoAsset={onSetPendingVideoAsset}
          />
        )}
      </div>

      <SavePresetModal
        isOpen={showSavePresetModal}
        onClose={() => setShowSavePresetModal(false)}
        onSave={handlePresetSave}
        elementCount={
          selectedElements.length === 1
            ? (elements.find(el => el.id === selectedElements[0])?.children?.length || 0)
            : 0
        }
      />

      {contextMenu && (
        <LayerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          layer={contextMenu.layer}
          onClose={() => setContextMenu(null)}
          onToggleVisibility={(id) => updateElement(id, { visible: !contextMenu.layer.visible })}
          onToggleLock={(id) => updateElement(id, { locked: !contextMenu.layer.locked })}
          onMoveUp={moveElementUp}
          onMoveDown={moveElementDown}
          onBringToFront={bringElementToFront}
          onSendToBack={sendElementToBack}
          onCenterLayer={handleCenterLayer}
          onDelete={deleteElement}
        />
      )}
    </div>
  );
};

export default LayersPanel;