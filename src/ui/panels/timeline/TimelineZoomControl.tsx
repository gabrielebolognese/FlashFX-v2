import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useTimelineStore } from '../../../store/timeline';
import { ZOOM_MIN, ZOOM_MAX, clampZoom } from './timeUtils';

const STEP_FACTOR = 1.25;

function zoomToSlider(zoom: number): number {
  const min = Math.log(ZOOM_MIN);
  const max = Math.log(ZOOM_MAX);
  return ((Math.log(zoom) - min) / (max - min)) * 100;
}

function sliderToZoom(value: number): number {
  const min = Math.log(ZOOM_MIN);
  const max = Math.log(ZOOM_MAX);
  return clampZoom(Math.exp(min + (value / 100) * (max - min)));
}

export function TimelineZoomControl() {
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel);

  const handleZoomOut = () => setZoomLevel(zoomLevel / STEP_FACTOR);
  const handleZoomIn = () => setZoomLevel(zoomLevel * STEP_FACTOR);
  const handleReset = () => setZoomLevel(1);

  const sliderValue = zoomToSlider(zoomLevel);
  const percent = Math.round(zoomLevel * 100);

  return (
    <div className="flex items-center gap-1.5 select-none">
      <button
        onClick={handleZoomOut}
        title="Zoom Out (Ctrl + Wheel down)"
        disabled={zoomLevel <= ZOOM_MIN + 0.001}
        className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-[#f7b500] hover:bg-[#1a2a42] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
      >
        <ZoomOut size={11} />
      </button>

      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={sliderValue}
        onChange={(e) => setZoomLevel(sliderToZoom(parseFloat(e.target.value)))}
        title={`Zoom: ${percent}%`}
        className="zoom-slider w-[110px] h-1 accent-[#f7b500] cursor-pointer"
      />

      <button
        onClick={handleZoomIn}
        title="Zoom In (Ctrl + Wheel up)"
        disabled={zoomLevel >= ZOOM_MAX - 0.001}
        className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-[#f7b500] hover:bg-[#1a2a42] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
      >
        <ZoomIn size={11} />
      </button>

      <button
        onClick={handleReset}
        title="Reset zoom (100%)"
        className="text-[9px] font-mono text-slate-400 hover:text-[#f7b500] px-1.5 h-5 rounded hover:bg-[#1a2a42] transition-colors min-w-[42px] text-center tabular-nums"
      >
        {percent}%
      </button>

      <button
        onClick={handleReset}
        title="Fit to 100%"
        className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-[#f7b500] hover:bg-[#1a2a42] transition-colors"
      >
        <Maximize2 size={10} />
      </button>
    </div>
  );
}
