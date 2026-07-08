import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Code2, Play, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Zap, Clock,
} from 'lucide-react';
import type { Layer } from '../../../core/types';
import { discoverProperties } from '../../../animation-builder/propertyDiscovery';
import { useExpressionStore } from '../../../expressions/store';
import { expressionManager } from '../../../expressions/manager';
import type { ExpressionDef } from '../../../expressions/types';

const EMPTY_MAP = new Map<string, ExpressionDef>();

interface CodeTabProps {
  layer: Layer;
}

export function CodeTab({ layer }: CodeTabProps) {
  const properties = useMemo(() => discoverProperties(layer), [layer]);
  const [selectedProp, setSelectedProp] = useState(properties[0]?.name ?? '');
  const layerExpressions = useExpressionStore((s) => s.expressions.get(layer.id) ?? EMPTY_MAP);

  const propNames = properties.map((p) => p.name);

  return (
    <div className="flex flex-col gap-0 p-0 h-full">
      <ExpressionEditor
        layerId={layer.id}
        propNames={propNames}
        selectedProp={selectedProp}
        onSelectProp={setSelectedProp}
        layerExpressions={layerExpressions}
      />
      <ExpressionsList
        layerId={layer.id}
        layerExpressions={layerExpressions}
        onSelect={setSelectedProp}
      />
      <QuickReference />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expression Editor
// ---------------------------------------------------------------------------

function ExpressionEditor({
  layerId,
  propNames,
  selectedProp,
  onSelectProp,
  layerExpressions,
}: {
  layerId: string;
  propNames: string[];
  selectedProp: string;
  onSelectProp: (name: string) => void;
  layerExpressions: Map<string, ExpressionDef>;
}) {
  const setExpression = useExpressionStore((s) => s.setExpression);
  const setEnabled = useExpressionStore((s) => s.setEnabled);
  const removeExpression = useExpressionStore((s) => s.removeExpression);

  const currentDef = layerExpressions.get(selectedProp) ?? null;
  const [code, setCode] = useState(currentDef?.code ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPropRef = useRef(selectedProp);
  const prevLayerRef = useRef(layerId);

  useEffect(() => {
    if (prevPropRef.current !== selectedProp || prevLayerRef.current !== layerId) {
      prevPropRef.current = selectedProp;
      prevLayerRef.current = layerId;
      const def = useExpressionStore.getState().getExpression(layerId, selectedProp);
      setCode(def?.code ?? '');
      setValidationError(null);
    }
  }, [selectedProp, layerId]);

  const applyExpression = useCallback(
    (text: string) => {
      if (!selectedProp) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setExpression(layerId, selectedProp, trimmed);
      expressionManager.validate(trimmed).then((err) => {
        setValidationError(err);
      });
    },
    [layerId, selectedProp, setExpression],
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        applyExpression(value);
      }, 600);
    },
    [applyExpression],
  );

  const handleApply = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyExpression(code);
  }, [code, applyExpression]);

  const handleRemove = useCallback(() => {
    removeExpression(layerId, selectedProp);
    setCode('');
    setValidationError(null);
    expressionManager.clearCache(layerId);
  }, [layerId, selectedProp, removeExpression]);

  const handleToggle = useCallback(() => {
    if (!currentDef) return;
    setEnabled(layerId, selectedProp, !currentDef.enabled);
  }, [layerId, selectedProp, currentDef, setEnabled]);

  const isEnabled = currentDef?.enabled ?? true;
  const error = validationError ?? currentDef?.error ?? null;
  const isAutoDisabled = error?.includes('auto-disabled');

  return (
    <div className="border-b border-[#1a2a42] p-3 flex flex-col gap-2">
      {/* Property selector + toggle */}
      <div className="flex items-center gap-2">
        <select
          value={selectedProp}
          onChange={(e) => onSelectProp(e.target.value)}
          className="flex-1 bg-[#0d1117] border border-[#1a2a42] rounded px-2 py-1.5 text-[11px] text-slate-200 focus:border-[#f7b500]/50 focus:outline-none appearance-none"
        >
          {propNames.map((name) => (
            <option key={name} value={name}>
              {name} {layerExpressions.has(name) ? ' *' : ''}
            </option>
          ))}
        </select>

        <button
          onClick={handleToggle}
          disabled={!currentDef}
          title={isEnabled ? 'Disable expression' : 'Enable expression'}
          className={`p-1.5 rounded transition-colors ${
            !currentDef
              ? 'text-slate-600 cursor-not-allowed'
              : isEnabled
              ? 'text-emerald-400 hover:bg-emerald-400/10'
              : 'text-slate-500 hover:bg-white/5'
          }`}
        >
          {isEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
      </div>

      {/* Code textarea */}
      <div className="relative">
        <textarea
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder={`// Expression for ${selectedProp}\n// e.g. value + wiggle(3, 50)`}
          spellCheck={false}
          className="w-full h-[180px] bg-[#080b10] border border-[#1a2a42] rounded-md px-3 py-2 text-[12px] text-slate-200 font-mono leading-relaxed resize-none focus:border-[#f7b500]/40 focus:outline-none placeholder:text-slate-600"
        />
        {currentDef && !error && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 size={12} className="text-emerald-500/60" />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          className={`flex items-start gap-2 px-2.5 py-2 rounded text-[11px] leading-tight ${
            isAutoDisabled
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
              : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}
        >
          {isAutoDisabled ? (
            <Clock size={12} className="flex-shrink-0 mt-0.5 text-amber-400" />
          ) : (
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5 text-red-400" />
          )}
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleApply}
          disabled={!code.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded bg-[#f7b500]/10 text-[#f7b500] hover:bg-[#f7b500]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={11} />
          Apply
        </button>
        <button
          onClick={handleRemove}
          disabled={!currentDef}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 size={11} />
          Remove
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expressions List
// ---------------------------------------------------------------------------

function ExpressionsList({
  layerId,
  layerExpressions,
  onSelect,
}: {
  layerId: string;
  layerExpressions: Map<string, ExpressionDef>;
  onSelect: (propName: string) => void;
}) {
  const entries = Array.from(layerExpressions.entries());

  if (entries.length === 0) {
    return (
      <div className="border-b border-[#1a2a42] px-3 py-3">
        <p className="text-[11px] text-slate-500 mb-2">
          No expressions on this layer yet. Try one of these:
        </p>
        <div className="flex flex-col gap-1.5">
          <ExampleExpression
            property="Rotation"
            code="time * 90"
            description="Rotate 90 degrees per second"
          />
          <ExampleExpression
            property="Position"
            code="value + wiggle(3, 20)"
            description="Add organic jitter to position"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[#1a2a42]">
      <div className="px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          Active Expressions
        </span>
      </div>
      <div className="flex flex-col">
        {entries.map(([propName, def]) => (
          <button
            key={propName}
            onClick={() => onSelect(propName)}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-left"
          >
            <span className="text-[11px] text-slate-300 font-medium w-[80px] truncate flex-shrink-0">
              {propName}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate flex-1">
              {def.code.split('\n')[0].slice(0, 30)}
              {def.code.length > 30 ? '...' : ''}
            </span>
            <span className="flex items-center gap-1 flex-shrink-0">
              {def.error ? (
                <AlertCircle size={10} className="text-red-400" />
              ) : (
                <CheckCircle2 size={10} className="text-emerald-500/60" />
              )}
              {def.enabled ? (
                <Zap size={10} className="text-[#f7b500]" />
              ) : (
                <Zap size={10} className="text-slate-600" />
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExampleExpression({
  property,
  code,
  description,
}: {
  property: string;
  code: string;
  description: string;
}) {
  return (
    <div className="bg-[#080b10] border border-[#1a2a42] rounded px-2.5 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-medium">{property}</span>
        <span className="text-[9px] text-slate-600">{description}</span>
      </div>
      <code className="text-[11px] text-[#f7b500]/70 font-mono">{code}</code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Reference
// ---------------------------------------------------------------------------

const REFERENCE_ITEMS = [
  { name: 'time', desc: 'Current time in seconds', example: 'time * 100' },
  { name: 'value', desc: 'Keyframed value at current time', example: 'value + 10' },
  { name: 'frame', desc: 'Current frame number', example: 'frame % 30' },
  { name: 'fps', desc: 'Composition frame rate', example: 'fps' },
  { name: 'duration', desc: 'Composition length in seconds', example: 'time / duration' },
  { name: 'width / height', desc: 'Canvas dimensions in pixels', example: 'width / 2' },
  { name: 'index', desc: 'Layer index in stack (zero-based)', example: 'index * 50' },
  { name: 'wiggle(freq, amp)', desc: 'Smooth organic oscillation', example: 'value + wiggle(3, 50)' },
  { name: 'loopOut(type)', desc: 'Loop after last keyframe', example: 'loopOut("cycle")' },
  { name: 'loopIn(type)', desc: 'Loop before first keyframe', example: 'loopIn("pingpong")' },
  { name: 'linear(t, a, b)', desc: 'Linear remap', example: 'linear(time/duration, 0, 100)' },
  { name: 'ease(t, a, b)', desc: 'Smooth remap with easing', example: 'ease(time, 0, 360)' },
  { name: 'easeIn / easeOut', desc: 'One-sided ease variants', example: 'easeOut(time, 0, 1)' },
  { name: 'clamp(v, min, max)', desc: 'Constrain value to range', example: 'clamp(time*100, 0, 500)' },
  { name: 'noise(t)', desc: 'Smooth noise -1 to 1', example: 'noise(time * 2) * 100' },
  { name: 'random(min, max)', desc: 'Stable random per property', example: 'random(0, 360)' },
  { name: 'Math.*', desc: 'Full Math object available', example: 'Math.sin(time * Math.PI)' },
];

function QuickReference() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-3 py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium hover:text-slate-300 transition-colors"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Reference
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
          {REFERENCE_ITEMS.map((item) => (
            <div
              key={item.name}
              className="flex items-baseline gap-2 px-1 py-0.5 rounded hover:bg-white/[0.02]"
            >
              <code className="text-[10px] text-[#f7b500]/80 font-mono flex-shrink-0 w-[130px] truncate">
                {item.name}
              </code>
              <span className="text-[9px] text-slate-500 flex-1 truncate">
                {item.desc}
              </span>
              <code className="text-[9px] text-slate-600 font-mono flex-shrink-0 truncate max-w-[140px]">
                {item.example}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
