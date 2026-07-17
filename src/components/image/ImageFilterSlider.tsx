import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface ImageFilterSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
  onChange: (value: number) => void;
  snapToDefault?: boolean;
  textInputMax?: number;
}

const ImageFilterSlider: React.FC<ImageFilterSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = '',
  onChange,
  snapToDefault = true,
  textInputMax,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleSliderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updateSliderValue(e);
  };

  const handleSliderMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      updateSliderValue(e as any);
    }
  };

  const handleSliderMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleSliderMouseMove);
      document.addEventListener('mouseup', handleSliderMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleSliderMouseMove);
        document.removeEventListener('mouseup', handleSliderMouseUp);
      };
    }
  }, [isDragging]);

  const updateSliderValue = (e: React.MouseEvent | MouseEvent) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    let newValue = min + percentage * (max - min);

    // Snap to default value if close enough
    if (snapToDefault && Math.abs(newValue - defaultValue) < (max - min) * 0.05) {
      newValue = defaultValue;
    }

    // Round to step
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));

    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(textInputMax ?? max, numValue));
      onChange(clampedValue);
    } else {
      setInputValue(value.toString());
    }
  };

  const handleInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleReset = () => {
    onChange(defaultValue);
  };

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const isDefault = value === defaultValue;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        <button
          onClick={handleReset}
          disabled={isDefault}
          className={`p-0.5 rounded transition-colors ${
            isDefault
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-yellow-400 hover:bg-gray-600/50'
          }`}
          title="Reset to default"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center space-x-2">
        {/* Slider Track */}
        <div
          ref={sliderRef}
          className="relative flex-1 h-1.5 bg-gray-700 rounded-full cursor-pointer group"
          onMouseDown={handleSliderMouseDown}
        >
          {/* Default value indicator */}
          {snapToDefault && defaultValue !== min && defaultValue !== max && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-gray-500 rounded-full pointer-events-none"
              style={{
                left: `${((defaultValue - min) / (max - min)) * 100}%`,
              }}
            />
          )}

          {/* Fill */}
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all"
            style={{
              width: `${percentage}%`,
            }}
          />

          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-yellow-400 transition-transform group-hover:scale-110"
            style={{
              left: `${percentage}%`,
              transform: `translate(-50%, -50%)`,
            }}
          />
        </div>

        {/* Value Input */}
        <div className="flex items-center space-x-0.5">
          <input
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyPress={handleInputKeyPress}
            min={min}
            max={textInputMax ?? max}
            step={step}
            className="w-14 px-1.5 py-0.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white text-right focus:outline-none focus:border-yellow-400/50"
          />
          {unit && <span className="text-xs text-gray-500 w-4">{unit}</span>}
        </div>
      </div>

      {/* Value Display on Hover */}
      {isDragging && (
        <div className="text-xs text-center text-yellow-400 font-medium">
          {value}{unit}
        </div>
      )}
    </div>
  );
};

export default ImageFilterSlider;
