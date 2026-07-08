import { useCallback } from 'react';
import type { SettingControlDef } from './types';
import { useSettingsStore } from './store';

interface ControlProps {
  control: SettingControlDef;
}

export function SettingControl({ control }: ControlProps) {
  const value = useSettingsStore((s) => s.values[control.id] ?? control.defaultValue);
  const setValue = useSettingsStore((s) => s.setValue);

  const onChange = useCallback(
    (v: unknown) => setValue(control.id, v),
    [control.id, setValue],
  );

  const isDisabled = control.disabled ?? false;

  return (
    <div
      className={`flex items-center justify-between py-1.5 px-1 rounded transition-colors ${
        isDisabled ? 'opacity-40 pointer-events-none' : 'hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex-1 min-w-0 mr-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-200 font-medium truncate">
            {control.label}
          </span>
          {control.disabledReason && (
            <span className="text-[8px] text-slate-500 bg-white/[0.04] px-1 py-0.5 rounded flex-shrink-0">
              {control.disabledReason}
            </span>
          )}
        </div>
        {control.description && (
          <p className="text-[9px] text-slate-500 truncate mt-0.5">
            {control.description}
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        {control.type === 'toggle' && (
          <ToggleControl value={value as boolean} onChange={onChange} disabled={isDisabled} />
        )}
        {control.type === 'slider' && (
          <SliderControl
            value={value as number}
            onChange={onChange}
            min={control.min ?? 0}
            max={control.max ?? 100}
            step={control.step ?? 1}
            unit={control.unit}
            disabled={isDisabled}
          />
        )}
        {control.type === 'dropdown' && (
          <DropdownControl
            value={value as string | number}
            onChange={onChange}
            options={control.options ?? []}
            disabled={isDisabled}
          />
        )}
        {control.type === 'number' && (
          <NumberControl
            value={value as number}
            onChange={onChange}
            min={control.min}
            max={control.max}
            step={control.step}
            unit={control.unit}
            disabled={isDisabled}
          />
        )}
        {control.type === 'color' && (
          <ColorControl value={value as string} onChange={onChange} disabled={isDisabled} />
        )}
        {control.type === 'text' && (
          <TextControl value={value as string} onChange={onChange} disabled={isDisabled} />
        )}
      </div>
    </div>
  );
}

function ToggleControl({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`relative w-7 h-4 rounded-full transition-colors ${
        value ? 'bg-[#f7b500]' : 'bg-[#1c3155]'
      }`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
          value ? 'left-3.5' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function SliderControl({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-[80px] h-1 appearance-none bg-[#1c3155] rounded cursor-pointer accent-[#f7b500] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f7b500]"
        style={{ background: `linear-gradient(to right, #f7b500 ${pct}%, #1c3155 ${pct}%)` }}
      />
      <span className="text-[9px] text-slate-400 font-mono w-[52px] text-right">
        {Number.isInteger(step) ? value : value.toFixed(2)}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

function DropdownControl({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string | number;
  onChange: (v: string | number) => void;
  options: { label: string; value: string | number }[];
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        onChange(opt?.value ?? e.target.value);
      }}
      className="bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[9px] text-slate-200 focus:border-[#f7b500]/40 focus:outline-none appearance-none min-w-[90px]"
    >
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NumberControl({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-[60px] bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[9px] text-slate-200 font-mono text-right focus:border-[#f7b500]/40 focus:outline-none"
      />
      {unit && <span className="text-[8px] text-slate-500">{unit}</span>}
    </div>
  );
}

function ColorControl({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-5 h-5 rounded border border-[#1a2a42] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
      />
      <span className="text-[9px] text-slate-400 font-mono uppercase">
        {value}
      </span>
    </div>
  );
}

function TextControl({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-[120px] bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[9px] text-slate-200 focus:border-[#f7b500]/40 focus:outline-none"
    />
  );
}
