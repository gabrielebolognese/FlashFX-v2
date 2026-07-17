import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DesignElement, ImageFilters } from '../../types/design';
import { getDefaultImageFilters } from '../../utils/imageFilters';
import ImageFilterSlider from './ImageFilterSlider';
import { Pipette, X, RotateCcw } from 'lucide-react';

interface ChromaKeyPanelProps {
  selectedElement: DesignElement;
  onFilterUpdate: (updates: Partial<ImageFilters>) => void;
}

const ChromaKeyPanel: React.FC<ChromaKeyPanelProps> = ({ selectedElement, onFilterUpdate }) => {
  const filters = selectedElement.filters || getDefaultImageFilters();
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!selectedElement.imageData) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      if (canvasRef.current && eyedropperActive) {
        drawImageToCanvas(img);
      }
    };
    img.src = selectedElement.imageData;
  }, [selectedElement.imageData, eyedropperActive]);

  const drawImageToCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxW = canvas.parentElement?.clientWidth || 200;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    const drawW = maxW;
    const drawH = drawW / aspectRatio;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
  }, []);

  const handleEyedropperToggle = () => {
    const next = !eyedropperActive;
    setEyedropperActive(next);
    if (next && imageRef.current) {
      setTimeout(() => {
        if (imageRef.current) drawImageToCanvas(imageRef.current);
      }, 0);
    }
  };

  const getCanvasPixelColor = useCallback((e: React.MouseEvent<HTMLCanvasElement>): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '#00ff00';

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return '#00ff00';

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const color = getCanvasPixelColor(e);
    onFilterUpdate({ chromaKeyColor: color });
    setEyedropperActive(false);
    setHoverColor(null);
  }, [getCanvasPixelColor, onFilterUpdate]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverColor(getCanvasPixelColor(e));
  }, [getCanvasPixelColor]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoverColor(null);
  }, []);

  const handleReset = () => {
    onFilterUpdate({
      chromaKeyEnabled: false,
      chromaKeyColor: '#00ff00',
      chromaKeySimilarity: 0,
      chromaKeyEdgeSmoothness: 10,
      chromaKeySpillReduction: 20,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-300 flex items-center">
          <span className="w-1 h-1 bg-emerald-400 rounded-full mr-1.5"></span>
          Chroma Key
        </h4>
        <button
          onClick={handleReset}
          className="p-0.5 rounded hover:bg-gray-600/50 transition-colors"
          title="Reset chroma key"
        >
          <RotateCcw className="w-3 h-3 text-gray-400 hover:text-yellow-400" />
        </button>
      </div>

      <label className="flex items-center gap-2 py-1 px-2 bg-gray-800/50 rounded border border-gray-700/50 cursor-pointer hover:bg-gray-800/80 transition-colors">
        <input
          type="checkbox"
          checked={filters.chromaKeyEnabled}
          onChange={(e) => onFilterUpdate({ chromaKeyEnabled: e.target.checked })}
          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
        />
        <span className="text-xs text-gray-300 select-none">Enable Chroma Key</span>
      </label>

      {filters.chromaKeyEnabled && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 flex-1">Key Color</label>
            <div className="flex items-center gap-1.5">
              {hoverColor && (
                <div
                  className="w-4 h-4 rounded border border-gray-500"
                  style={{ backgroundColor: hoverColor }}
                  title={`Preview: ${hoverColor}`}
                />
              )}
              <div
                className="w-5 h-5 rounded border border-gray-500 cursor-pointer"
                style={{ backgroundColor: filters.chromaKeyColor }}
                title={filters.chromaKeyColor}
              />
              <input
                type="color"
                value={filters.chromaKeyColor}
                onChange={(e) => onFilterUpdate({ chromaKeyColor: e.target.value })}
                className="w-0 h-0 opacity-0 absolute"
                id="chroma-color-input"
              />
              <label
                htmlFor="chroma-color-input"
                className="px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-[10px] text-gray-300 cursor-pointer hover:bg-gray-600/50 transition-colors"
              >
                Pick
              </label>
              <button
                onClick={handleEyedropperToggle}
                className={`p-1 rounded transition-colors ${
                  eyedropperActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-gray-700/50 text-gray-400 hover:text-white border border-gray-600/50'
                }`}
                title="Pick color from image"
              >
                <Pipette className="w-3 h-3" />
              </button>
            </div>
          </div>

          {eyedropperActive && selectedElement.imageData && (
            <div className="rounded overflow-hidden border border-emerald-500/30 relative">
              <div className="bg-gray-900/80 px-2 py-1 flex items-center justify-between">
                <span className="text-[10px] text-emerald-400">Click to pick key color</span>
                <button
                  onClick={() => { setEyedropperActive(false); setHoverColor(null); }}
                  className="p-0.5 hover:bg-gray-700 rounded"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              </div>
              <div className="relative bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4jWNgYGD4z8BQDwAEgAF/TDdMAAAAASUVORK5CYII=')] bg-repeat">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  className="block w-full cursor-crosshair"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              {hoverColor && (
                <div className="bg-gray-900/90 px-2 py-1 flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ backgroundColor: hoverColor }} />
                  <span className="text-[10px] text-gray-300 font-mono">{hoverColor}</span>
                </div>
              )}
            </div>
          )}

          <ImageFilterSlider
            label="Similarity"
            value={filters.chromaKeySimilarity}
            min={0}
            max={100}
            defaultValue={0}
            onChange={(value) => onFilterUpdate({ chromaKeySimilarity: value })}
            snapToDefault={false}
          />

          <ImageFilterSlider
            label="Edge Smoothness"
            value={filters.chromaKeyEdgeSmoothness}
            min={0}
            max={100}
            defaultValue={10}
            onChange={(value) => onFilterUpdate({ chromaKeyEdgeSmoothness: value })}
            snapToDefault={false}
          />

          <ImageFilterSlider
            label="Spill Reduction"
            value={filters.chromaKeySpillReduction}
            min={0}
            max={100}
            defaultValue={20}
            onChange={(value) => onFilterUpdate({ chromaKeySpillReduction: value })}
            snapToDefault={false}
          />
        </div>
      )}
    </div>
  );
};

export default ChromaKeyPanel;
