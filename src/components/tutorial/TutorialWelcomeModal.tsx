import React from 'react';
import { Youtube, BookOpen, X } from 'lucide-react';

interface TutorialWelcomeModalProps {
  isOpen: boolean;
  onStartTutorial: () => void;
  onOpenYoutube: () => void;
  onClose: () => void;
}

const TutorialWelcomeModal: React.FC<TutorialWelcomeModalProps> = ({
  isOpen,
  onStartTutorial,
  onOpenYoutube,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center pointer-events-auto">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 max-w-lg w-full mx-4 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl mb-4">
              <BookOpen className="w-8 h-8 text-gray-900" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Welcome to FlashFX!
            </h2>
            <p className="text-gray-300 text-lg">
              If this is your first time and you need a tutorial, click the "In App Tutorial" button. If you want, follow the YouTube channel for always updated tutorials.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={onStartTutorial}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-gray-900 font-semibold rounded-xl transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <BookOpen className="w-5 h-5" />
              <span>In App Tutorial</span>
            </button>

            <button
              onClick={onOpenYoutube}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <Youtube className="w-5 h-5" />
              <span>YouTube Tutorials</span>
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialWelcomeModal;
