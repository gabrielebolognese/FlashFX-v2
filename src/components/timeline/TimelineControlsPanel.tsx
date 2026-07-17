import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlayback } from '../../animation-engine';
import { formatTimeCode } from '../../utils/formatTimeCode';

const TimelineControlsPanel: React.FC = () => {
  const { togglePlay, seekToStart, seekToEnd, stepForward, stepBackward, stop, isPlaying, currentTime, currentFrame, totalFrames, duration, fps } = usePlayback();
// Removed local formatTime — now using shared formatTimeCode utility.
  const formatTime = (s: number) => formatTimeCode(s, fps);

  return (
    <div
      className="w-full flex items-center justify-between px-3 backdrop-blur-xl border-t"
      style={{
        backgroundColor: 'rgba(31, 41, 55, 0.5)',
        borderColor: 'rgba(55, 65, 81, 0.5)',
        height: '48px'
      }}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={seekToStart}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
          title="Go to start"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={stepBackward}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
          title="Previous frame"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={togglePlay}
          className={`p-2 rounded-lg transition-all ${
            isPlaying
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={stop}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
          title="Stop"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={stepForward}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
          title="Next frame"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={seekToEnd}
          className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
          title="Go to end"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="text-xs text-amber-400 font-mono bg-gray-800 px-2 py-1 rounded">
          F {currentFrame + 1} / {totalFrames}
        </div>
      </div>
    </div>
  );
};

export default TimelineControlsPanel;
