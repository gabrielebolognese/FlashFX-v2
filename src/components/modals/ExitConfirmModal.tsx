import React from 'react';
import { X, Save, LogOut } from 'lucide-react';

interface ExitConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndExit: () => void;
  onExitOnly: () => void;
}

const ExitConfirmModal: React.FC<ExitConfirmModalProps> = ({
  isOpen,
  onClose,
  onSaveAndExit,
  onExitOnly
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Exit Project</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-700/50 transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <p className="text-gray-300 mb-6">
            Do you want to save your changes before exiting?
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={onSaveAndExit}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Save and Exit</span>
            </button>

            <button
              onClick={onExitOnly}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Exit Only</span>
            </button>

            <button
              onClick={onClose}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 border border-gray-600/30 transition-all"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExitConfirmModal;
