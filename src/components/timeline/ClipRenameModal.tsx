import React, { useState } from 'react';
import { X, Edit3 } from 'lucide-react';

interface ClipRenameModalProps {
  currentName: string;
  onClose: () => void;
  onRename: (newName: string) => void;
}

const ClipRenameModal: React.FC<ClipRenameModalProps> = ({
  currentName,
  onClose,
  onRename,
}) => {
  const [newName, setNewName] = useState(currentName);

  const handleRename = () => {
    if (newName.trim() === '') {
      alert('Clip name cannot be empty');
      return;
    }
    onRename(newName.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
      <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5" />
            Rename Clip
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Clip Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyPress}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter clip name"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClipRenameModal;
