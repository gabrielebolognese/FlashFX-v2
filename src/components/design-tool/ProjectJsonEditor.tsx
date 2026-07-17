import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Code, Save, Download, Upload, RotateCcw, AlertCircle, CheckCircle, Loader2, X, Maximize2, Minimize2 } from 'lucide-react';
import { DesignElement } from '../../types/design';
import { ProjectFile } from '../../types/project';
import { useProjectValidation } from '../../hooks/useProjectValidation';

interface ProjectJsonEditorProps {
  isOpen: boolean;
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onApplyProject: (elements: DesignElement[], selectedElements: string[]) => void;
  serializeProject: (elements: DesignElement[], selectedElements: string[]) => string;
  deserializeProject: (jsonString: string) => { elements: DesignElement[]; selectedElements: string[] };
  projectElements: DesignElement[];
  selectedElements: string[];
}

const ProjectJsonEditor: React.FC<ProjectJsonEditorProps> = ({
  isOpen,
  onClose,
  isFullscreen,
  onToggleFullscreen,
  onApplyProject,
  serializeProject,
  deserializeProject,
  projectElements,
  selectedElements
}) => {
  const [jsonContent, setJsonContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [lastAppliedJson, setLastAppliedJson] = useState('');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'validating' | 'applying' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  
  const { validateProject, isValidating, lastValidationErrors } = useProjectValidation();

  // Initialize JSON content when opening or when elements change
  useEffect(() => {
    if (isOpen) {
      const serialized = serializeProject(projectElements, selectedElements);
      setJsonContent(serialized);
      setLastAppliedJson(serialized);
      setHasChanges(false);
    }
  }, [isOpen, projectElements, selectedElements, serializeProject]);

  // Debounced validation and application for live mode
  const debouncedApply = useCallback(() => {
    if (!isLiveMode || !hasChanges) return;
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce for 300ms
    debounceRef.current = setTimeout(() => {
      handleApplyChanges();
    }, 300);
  }, [isLiveMode, hasChanges]);

  // Update content and trigger debounced apply
  const handleContentChange = useCallback((newContent: string) => {
    setJsonContent(newContent);
    setHasChanges(newContent !== lastAppliedJson);
    
    if (isLiveMode) {
      debouncedApply();
    }
  }, [lastAppliedJson, isLiveMode, debouncedApply]);

  // Apply changes to project state
  const handleApplyChanges = useCallback(async () => {
    if (!hasChanges) return;
    
    setApplyStatus('validating');
    setStatusMessage('Validating project JSON...');
    
    try {
      // Step 1: Validate
      const validationResult = validateProject(jsonContent);
      
      if (!validationResult.success) {
        setApplyStatus('error');
        setStatusMessage(`Validation failed: ${validationResult.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
        return;
      }
      
      // Step 2: Apply to project state
      setApplyStatus('applying');
      setStatusMessage('Applying changes to canvas...');
      
      const { elements, selectedElements: newSelected } = deserializeProject(jsonContent);
      
      // Step 3: Update canvas
      onApplyProject(elements, newSelected);
      
      // Step 4: Success
      setLastAppliedJson(jsonContent);
      setHasChanges(false);
      setApplyStatus('success');
      const changesCount = elements.length;
      setStatusMessage(`Project applied successfully - ${changesCount} elements`);
      
      // Flash canvas border to indicate update
      const canvas = document.getElementById('canvas-artboard');
      if (canvas) {
        canvas.style.boxShadow = '0 0 0 3px #10B981';
        setTimeout(() => {
          canvas.style.boxShadow = '';
        }, 150);
      }
      
      // Clear success status after 3 seconds
      setTimeout(() => {
        setApplyStatus('idle');
        setStatusMessage('');
      }, 3000);
      
    } catch (error) {
      setApplyStatus('error');
      setStatusMessage(`Apply failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [hasChanges, jsonContent, validateProject, deserializeProject, onApplyProject]);

  // Manual apply for staged mode
  const handleManualApply = useCallback(() => {
    handleApplyChanges();
  }, [handleApplyChanges]);

  // Reset to last valid state
  const handleReset = useCallback(() => {
    setJsonContent(lastAppliedJson);
    setHasChanges(false);
    setApplyStatus('idle');
    setStatusMessage('');
  }, [lastAppliedJson]);

  // Download project JSON
  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'project.flashfx.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [jsonContent]);

  // Upload project JSON
  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.flashfx.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
            handleContentChange(content);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [handleContentChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if ((e.ctrlKey || e.metaKey)) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            handleApplyChanges();
            break;
          case 'e':
            e.preventDefault();
            onClose();
            break;
          case 'enter':
            if (!isLiveMode) {
              e.preventDefault();
              handleApplyChanges();
            }
            break;
        }
      }
      
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleApplyChanges, onClose, isLiveMode]);

  // Auto-format JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonContent);
      const formatted = JSON.stringify(parsed, null, 2);
      handleContentChange(formatted);
    } catch (error) {
      // Don't format if JSON is invalid
    }
  }, [jsonContent, handleContentChange]);

  if (!isOpen) return null;

  const getStatusColor = () => {
    switch (applyStatus) {
      case 'validating':
      case 'applying':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (applyStatus) {
      case 'validating':
      case 'applying':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Code className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col bg-gray-900 border-t border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/50 bg-gray-800/30">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className="text-sm font-medium text-white">Project JSON</span>
          </div>
          
          {/* Status indicator */}
          {(applyStatus !== 'idle' || statusMessage) && (
            <div className={`flex items-center space-x-2 text-xs ${getStatusColor()}`}>
              {statusMessage && <span>{statusMessage}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-1">
          {/* Live mode toggle */}
          <div className="flex items-center space-x-2 text-xs">
            <label className="text-gray-400">Live:</label>
            <button
              onClick={() => setIsLiveMode(!isLiveMode)}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                isLiveMode ? 'bg-yellow-400' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  isLiveMode ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Apply button for staged mode */}
          {!isLiveMode && hasChanges && (
            <button
              onClick={handleManualApply}
              disabled={isValidating}
              className="flex items-center space-x-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
            >
              <Save className="w-3 h-3" />
              <span>Apply</span>
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Close Editor (Esc)"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/20 border-b border-gray-800/30">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleUpload}
            className="flex items-center space-x-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors"
            title="Upload JSON file"
          >
            <Upload className="w-3 h-3" />
            <span>Import</span>
          </button>
          
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors"
            title="Download project JSON"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>
          
          <button
            onClick={formatJson}
            className="flex items-center space-x-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors"
            title="Format JSON"
          >
            <Code className="w-3 h-3" />
            <span>Format</span>
          </button>

          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
              hasChanges
                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            title="Reset to last applied state"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {hasChanges && (
            <div className="flex items-center space-x-1 text-yellow-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <span>Unsaved</span>
            </div>
          )}
          
          <span className="text-gray-500">
            {jsonContent.length.toLocaleString()} chars
          </span>
        </div>
      </div>

      {/* JSON Editor */}
      <div className="flex-1 relative min-h-0">
        <textarea
          ref={textareaRef}
          value={jsonContent}
          onChange={(e) => handleContentChange(e.target.value)}
          className={`absolute inset-0 w-full h-full p-3 bg-gray-950 text-gray-100 font-mono text-xs resize-none focus:outline-none border-0 ${
            lastValidationErrors.length > 0 ? 'border-l-2 border-red-500' : ''
          }`}
          placeholder="Project JSON will appear here..."
          spellCheck={false}
          style={{
            fontFamily: 'Monaco, Menlo, "SF Mono", Consolas, "Liberation Mono", monospace',
            lineHeight: '1.6',
            tabSize: 2
          }}
        />
        
        {/* Validation errors overlay */}
        {lastValidationErrors.length > 0 && (
          <div className="absolute top-3 right-3 max-w-xs">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 backdrop-blur-sm">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400 font-medium">Validation Errors</span>
              </div>
              <div className="space-y-1">
                {lastValidationErrors.slice(0, 3).map((error, index) => (
                  <div key={index} className="text-xs text-red-300">
                    <span className="font-medium">{error.path}:</span> {error.message}
                  </div>
                ))}
                {lastValidationErrors.length > 3 && (
                  <div className="text-xs text-red-400">
                    ...and {lastValidationErrors.length - 3} more errors
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success indicator */}
        {applyStatus === 'success' && (
          <div className="absolute top-3 right-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 backdrop-blur-sm">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Applied Successfully</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-800/30 border-t border-gray-800/30">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-4">
            <span className="text-gray-400">
              Mode: {isLiveMode ? 'Live (300ms)' : 'Staged (Ctrl+Enter)'}
            </span>
            <span className="text-gray-400">
              Schema: v{JSON.parse(jsonContent || '{"schemaVersion": 1}').schemaVersion || 1}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">Ctrl+S: Apply</span>
            <span className="text-gray-500">Esc: Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectJsonEditor;