import React, { useState } from 'react';
import { Film, Plus, Clock, Layers, Settings, ChevronDown } from 'lucide-react';
import { Sequence, FRAME_RATE_PRESETS, createSequence } from '../../types/sequence';
import CreateSequenceModal from './CreateSequenceModal';

interface SequenceCompositorProps {
  activeSequence: Sequence | null;
  onCreateSequence: (sequence: Sequence) => void;
  onEditSequence: (sequence: Sequence) => void;
  canvasId: string;
}

const SequenceCompositor: React.FC<SequenceCompositorProps> = ({
  activeSequence,
  onCreateSequence,
  onEditSequence,
  canvasId,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSequenceMenu, setShowSequenceMenu] = useState(false);

  const handleCreateSequence = (name: string, frameRate: number, duration: number) => {
    const sequence = createSequence(name, frameRate, duration, canvasId);
    onCreateSequence(sequence);
    setShowCreateModal(false);
  };

  if (!activeSequence) {
    return (
      <>
        <div className="w-full h-full flex flex-col items-center justify-center p-12 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="max-w-2xl w-full text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border-2 border-amber-500/30 mb-4">
              <Film className="w-10 h-10 text-amber-400" />
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-white">Create Your First Sequence</h2>
              <p className="text-lg text-gray-400 max-w-xl mx-auto">
                Sequences define your animation's timeline with precise frame rate and duration controls. Start by creating a sequence to unlock the animation timeline.
              </p>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-gray-900 font-semibold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              Create Sequence
            </button>
          </div>
        </div>
        <CreateSequenceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateSequence}
        />
      </>
    );
  }

  const frameRateLabel = FRAME_RATE_PRESETS.find(p => p.value === activeSequence.frameRate)?.label || `${activeSequence.frameRate} fps`;
  const totalFrames = Math.ceil(activeSequence.duration * activeSequence.frameRate);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowSequenceMenu(!showSequenceMenu)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
        >
          <Film className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-white font-medium">{activeSequence.name}</span>
          <span className="text-xs text-slate-400 px-2 py-0.5 bg-slate-700 rounded">
            {frameRateLabel}
          </span>
          <span className="text-xs text-slate-400">
            {activeSequence.duration}s ({totalFrames} frames)
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>

        {showSequenceMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowSequenceMenu(false)}
            />
            <div className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Active Sequence</div>
                <div className="text-sm font-medium text-white">{activeSequence.name}</div>
              </div>
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowSequenceMenu(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Edit Sequence Settings
                </button>
                <button
                  onClick={() => {
                    setShowSequenceMenu(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create New Sequence
                </button>
              </div>
              <div className="p-3 bg-slate-900/50 border-t border-slate-700">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Duration:</span>
                    <span className="text-slate-300 ml-1">{activeSequence.duration}s</span>
                  </div>
                  <div>
                    <span className="text-slate-500">FPS:</span>
                    <span className="text-slate-300 ml-1">{activeSequence.frameRate}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Frames:</span>
                    <span className="text-slate-300 ml-1">{totalFrames}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Canvas:</span>
                    <span className="text-slate-300 ml-1">Current</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <CreateSequenceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateSequence}
        editingSequence={activeSequence}
      />
    </>
  );
};

export default SequenceCompositor;
