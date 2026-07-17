import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MediaAsset } from '../../services/MediaPoolService';

interface RenameMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: MediaAsset | null;
  onRename: (asset: MediaAsset, newName: string) => void;
}

const RenameMediaModal: React.FC<RenameMediaModalProps> = ({ isOpen, onClose, asset, onRename }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (asset) {
      setName(asset.name);
    }
  }, [asset]);

  if (!isOpen || !asset) return null;

  const handleRename = () => {
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== asset.name) {
      onRename(asset, trimmedName);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10003] p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Rename Media</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center space-x-3">
            <img
              src={asset.thumbnail || asset.data}
              alt={asset.name}
              className="w-16 h-16 object-cover rounded border border-gray-700"
            />
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                placeholder="Enter new name"
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={!name.trim() || name.trim() === asset.name}
            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default RenameMediaModal;
