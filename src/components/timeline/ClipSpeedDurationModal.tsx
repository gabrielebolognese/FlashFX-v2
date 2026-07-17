import React, { useState, useEffect } from 'react';
import { X, Clock, Zap } from 'lucide-react';

interface ClipSpeedDurationModalProps {
  clipName: string;
  currentDuration: number;
  currentSpeed: number;
  onClose: () => void;
  onApply: (duration: number, speed: number) => void;
}

const ClipSpeedDurationModal: React.FC<ClipSpeedDurationModalProps> = ({
  clipName,
  currentDuration,
  currentSpeed,
  onClose,
  onApply,
}) => {
  const [mode, setMode] = useState<'duration' | 'speed'>('duration');
  const [duration, setDuration] = useState(currentDuration.toFixed(2));
  const [speed, setSpeed] = useState(currentSpeed.toFixed(2));

  useEffect(() => {
    if (mode === 'duration') {
      const newSpeed = currentDuration / parseFloat(duration || '1');
      setSpeed(newSpeed.toFixed(2));
    } else {
      const newDuration = currentDuration / parseFloat(speed || '1');
      setDuration(newDuration.toFixed(2));
    }
  }, [duration, speed, mode, currentDuration]);

  const handleApply = () => {
    const finalDuration = parseFloat(duration);
    const finalSpeed = parseFloat(speed);

    if (isNaN(finalDuration) || finalDuration <= 0) {
      alert('Duration must be a positive number');
      return;
    }

    if (isNaN(finalSpeed) || finalSpeed <= 0) {
      alert('Speed must be a positive number');
      return;
    }

    onApply(finalDuration, finalSpeed);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000]">
      <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Speed / Duration
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">Clip: <span className="text-white">{clipName}</span></p>
          <p className="text-xs text-gray-500">Original Duration: {currentDuration.toFixed(2)}s</p>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode('duration')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'duration'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              Duration
            </button>
            <button
              onClick={() => setMode('speed')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'speed'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              <Zap className="w-4 h-4" />
              Speed
            </button>
          </div>

          {mode === 'duration' ? (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Duration (seconds)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter duration"
              />
              <p className="text-xs text-gray-500 mt-2">
                Calculated Speed: {speed}x
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Speed Multiplier
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter speed"
              />
              <p className="text-xs text-gray-500 mt-2">
                Calculated Duration: {duration}s
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSpeed('0.25')}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  0.25x
                </button>
                <button
                  onClick={() => setSpeed('0.5')}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  0.5x
                </button>
                <button
                  onClick={() => setSpeed('1')}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  1x
                </button>
                <button
                  onClick={() => setSpeed('2')}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  2x
                </button>
                <button
                  onClick={() => setSpeed('4')}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                >
                  4x
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClipSpeedDurationModal;
