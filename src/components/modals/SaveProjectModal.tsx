import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, CheckCircle, AlertCircle, Save } from 'lucide-react';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (projectName: string) => Promise<void>;
  currentProjectName?: string;
  isSaving?: boolean;
  saveProgress?: number;
  saveProgressLabel?: string;
}

const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentProjectName = 'Untitled Project',
  isSaving: externalIsSaving = false,
  saveProgress = 0,
  saveProgressLabel = '',
}) => {
  const [projectName, setProjectName] = useState(currentProjectName);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProjectName(currentProjectName);
      setSaveStatus('idle');
      setErrorMessage('');
    }
  }, [isOpen, currentProjectName]);

  const handleSave = async () => {
    if (!projectName.trim()) {
      setErrorMessage('Project name cannot be empty');
      setSaveStatus('error');
      return;
    }

    setSaveStatus('idle');
    setErrorMessage('');

    try {
      await onSave(projectName.trim());
      setSaveStatus('success');
      setTimeout(() => {
        onClose();
        setSaveStatus('idle');
      }, 1200);
    } catch (error) {
      setSaveStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save project');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !externalIsSaving) {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Save className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Save Project</h2>
          </div>
          <button
            onClick={onClose}
            disabled={externalIsSaving}
            className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={externalIsSaving}
              placeholder="Enter project name..."
              className="w-full px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              autoFocus
            />
          </div>

          {externalIsSaving && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{saveProgressLabel || 'Saving…'}</span>
                <span className="text-gray-400 font-mono">{saveProgress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-200"
                  style={{ width: `${saveProgress}%` }}
                />
              </div>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          {saveStatus === 'success' && (
            <div className="flex items-center space-x-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-400">Project saved successfully!</p>
            </div>
          )}

          {!externalIsSaving && saveStatus === 'idle' && (
            <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
              <p className="text-sm text-gray-300 mb-2">
                Downloads a <span className="font-mono text-blue-400">.ffxproj</span> file containing:
              </p>
              <ul className="text-xs text-gray-400 space-y-1 ml-4">
                <li>• All canvas elements and layer properties</li>
                <li>• Animation keyframes and timeline data</li>
                <li>• Embedded image assets (as binary files)</li>
                <li>• Canvas settings, background, and grid config</li>
                <li>• Sequences and timeline markers</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={onClose}
            disabled={externalIsSaving}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={externalIsSaving || saveStatus === 'success'}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {externalIsSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving…</span>
              </>
            ) : saveStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Save & Download</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveProjectModal;
