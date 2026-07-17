import React, { useState } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';

interface AdvancedModeConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const AdvancedModeConfirmModal: React.FC<AdvancedModeConfirmModalProps> = ({
  isOpen,
  onConfirm,
  onCancel
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideAdvancedModeWarning', 'true');
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border-b border-gray-700 px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Zap className="w-6 h-6 text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Advanced Mode</h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-yellow-200 font-medium text-sm">
                Advanced Mode is designed for experienced users
              </p>
              <p className="text-gray-300 text-sm">
                This mode provides a dual-timeline layout with comprehensive animation controls.
                It requires significant skill and experience to use effectively.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-300">
            <p className="font-medium text-white">What to expect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Dual timeline for complex animations</li>
              <li>Advanced keyframe editing capabilities</li>
              <li>More compact interface</li>
              <li>Steeper learning curve</li>
            </ul>
          </div>

          <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg hover:bg-gray-700/30 transition-colors">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800 cursor-pointer"
            />
            <span className="text-sm text-gray-300">
              Don't show this warning again
            </span>
          </label>
        </div>

        <div className="flex gap-3 px-6 py-4 bg-gray-900/50 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-white bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 transition-all shadow-lg"
          >
            Continue to Advanced Mode
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedModeConfirmModal;
