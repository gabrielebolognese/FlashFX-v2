import { useState } from 'react';
import { Sparkles, Clock, PlayCircle } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { getPresetsByCategory, PRESET_CATEGORIES } from '../../core/animationPresets';

export function AnimatePanel({ layerId }: { layerId: string }) {
  const applyAnimationPresetBatch = useEditorStore((s) => s.applyAnimationPresetBatch);
  const frameRate = useEditorStore((s) => s.composition.settings.frameRate);
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const currentFrame = useTimelineStore((s) => s.currentFrame);

  const [durationSeconds, setDurationSeconds] = useState(1);
  const [atStart, setAtStart] = useState(true);

  const targetIds = selectedIds.length > 0 ? selectedIds : [layerId];
  const grouped = getPresetsByCategory();

  const handleApply = (presetId: string) => {
    applyAnimationPresetBatch(targetIds, presetId, durationSeconds, atStart);
  };

  const handleDurationInput = (val: string) => {
    const n = parseFloat(val);
    if (!Number.isNaN(n)) {
      setDurationSeconds(Math.min(10, Math.max(0.1, n)));
    }
  };

  return (
    <div tabIndex={0} className="flex-1 overflow-y-auto min-h-0 outline-none focus:outline-none">
      {/* Duration control */}
      <div className="px-3 py-2.5 border-b border-[#1a2a42] bg-[#0a1628]">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={12} className="text-slate-400 flex-shrink-0" />
          <span className="text-[11px] text-slate-300 font-medium">Duration</span>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={durationSeconds}
            onChange={(e) => handleDurationInput(e.target.value)}
            className="ml-auto w-[52px] px-1.5 py-0.5 text-[11px] text-slate-200 bg-[#11151f] border border-[#1c2230] rounded text-center focus:outline-none focus:border-[#f7b500]/50"
          />
          <span className="text-[10px] text-slate-500">sec</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(parseFloat(e.target.value))}
          className="w-full h-1 bg-[#1c2230] rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f7b500] [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex justify-between mt-1 text-[9px] text-slate-600">
          <span>0.1s</span>
          <span>{Math.round(durationSeconds * frameRate)} frames</span>
          <span>10s</span>
        </div>
      </div>

      {/* At The Start toggle */}
      <div className="px-3 py-2 border-b border-[#1a2a42] bg-[#0a1628]">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            onClick={() => setAtStart(!atStart)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              atStart
                ? 'bg-[#f7b500] border-[#f7b500]'
                : 'bg-[#11151f] border-[#1c2230] hover:border-slate-500'
            }`}
          >
            {atStart && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4 7L8 3" stroke="#0a1628" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <PlayCircle size={12} className="text-slate-400" />
          <span className="text-[11px] text-slate-300">At The Start</span>
        </label>
        <p className="mt-1 ml-6 text-[9.5px] text-slate-500 leading-tight">
          {atStart
            ? 'Animation begins at each clip\u2019s start time'
            : `Animation begins at playhead (frame ${currentFrame})`}
        </p>
      </div>

      {/* Selection info */}
      {targetIds.length > 1 && (
        <div className="px-3 py-1.5 border-b border-[#1a2a42] bg-[#0d1a2e]">
          <p className="text-[10px] text-[#f7b500]">
            Applying to {targetIds.length} selected clips
          </p>
        </div>
      )}

      {/* Preset grid */}
      {PRESET_CATEGORIES.map((category) => (
        <div key={category} className="border-b border-[#13182370]">
          <div className="px-3 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            {category}
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
            {grouped[category].map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApply(preset.id)}
                title={preset.description}
                className="group flex flex-col items-start text-left px-2.5 py-2 rounded-lg bg-[#11151f] border border-[#1c2230] hover:border-[#f7b500]/50 hover:bg-[#f7b500]/[0.06] transition-colors"
              >
                <span className="text-[11.5px] font-medium text-slate-200 group-hover:text-[#ffc83d] leading-tight">
                  {preset.name}
                </span>
                <span className="text-[9.5px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
