import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MediaAsset } from '../../services/MediaPoolService';

interface MediaMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: MediaAsset | null;
  onSave: (asset: MediaAsset, updates: Partial<MediaAsset>) => void;
}

const MediaMetadataModal: React.FC<MediaMetadataModalProps> = ({ isOpen, onClose, asset, onSave }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (asset) {
      setName(asset.name);
    }
  }, [asset]);

  if (!isOpen || !asset) return null;

  const handleSave = () => {
    if (name.trim() && name !== asset.name) {
      onSave(asset, { name: name.trim() });
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10003] p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Edit Metadata</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            <img
              src={asset.thumbnail || asset.data}
              alt={asset.name}
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
              placeholder="Enter media name"
              autoFocus
            />
          </div>

          <div className="bg-gray-900/50 border border-gray-700 rounded p-3">
            <p className="text-xs text-gray-400">
              Technical properties like resolution, codec, and file size are read-only.
            </p>
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
            onClick={handleSave}
            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MediaMetadataModal;
