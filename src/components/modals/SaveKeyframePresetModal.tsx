import React, { useState, useEffect, useRef } from 'react';
import { X, Bookmark, Diamond } from 'lucide-react';

interface SaveKeyframePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  keyframeCount: number;
  trackCount: number;
  duration: number;
}

const SaveKeyframePresetModal: React.FC<SaveKeyframePresetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  keyframeCount,
  trackCount,
  duration,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setNameError('');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Preset name is required');
      nameInputRef.current?.focus();
      return;
    }
    if (trimmed.length > 50) {
      setNameError('Name must be 50 characters or fewer');
      return;
    }
    onSave(trimmed, description.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Save Keyframe Preset</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-700/60 transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/40">
            <Diamond className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="text-xs text-gray-300">
              <span className="font-medium text-white">{keyframeCount}</span> keyframe{keyframeCount !== 1 ? 's' : ''}
              {' '}across{' '}
              <span className="font-medium text-white">{trackCount}</span> propert{trackCount !== 1 ? 'ies' : 'y'}
              {duration > 0 && (
                <span className="text-gray-500"> &bull; {duration.toFixed(2)}s duration</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Preset Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="e.g. Bounce In, Fade Slide..."
              maxLength={50}
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-colors ${
                nameError
                  ? 'border-red-500/70 focus:border-red-400'
                  : 'border-gray-600/60 focus:border-amber-400/60'
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {nameError ? (
                <span className="text-xs text-red-400">{nameError}</span>
              ) : (
                <span className="text-xs text-transparent select-none">.</span>
              )}
              <span className="text-xs text-gray-600">{name.length}/50</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Description <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this animation preset..."
              maxLength={200}
              rows={3}
              className="w-full bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/60 transition-colors resize-none"
            />
            <div className="flex justify-end mt-1">
              <span className="text-xs text-gray-600">{description.length}/200</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              name.trim()
                ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Create Preset
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveKeyframePresetModal;
