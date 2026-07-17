import { useState, useCallback } from 'react';
import { ChevronRight, Search, RotateCcw, Upload } from 'lucide-react';
import { FILTER_CATEGORIES, type FilterDef, type FilterCategory } from './filterDefinitions';
import type { ImageLayer } from '../../../core/types';
import { useEditorStore } from '../../../store/editor';
import { getEffectDef, isLegacyFilter } from '../../../core/effects/effectRegistry';
import { isWireFilter, buildWire, readWireValue } from '../../../core/effects/wireEffects';

interface FilterValues {
  [filterId: string]: number | string;
}

export function ImageFiltersPanel({ layer }: { layer: ImageLayer }) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const setLayerEffectParam = useEditorStore((s) => s.setLayerEffectParam);
  const removeLayerEffect = useEditorStore((s) => s.removeLayerEffect);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['essentials']));
  const [searchQuery, setSearchQuery] = useState('');
  // Local state is only used for filters that are not yet implemented (no
  // registry entry) so their sliders still respond; implemented filters read
  // their value straight from the layer (the source of truth).
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const handleFilterChange = useCallback((filterId: string, value: number) => {
    if (isLegacyFilter(filterId)) {
      updateLayerProperty(layer.id, `filters.${filterId}`, value);
      return;
    }
    // "Wire" filters (blur/glow) drive the layer's LayerBlur/LayerGlow property
    // (and the renderer's real RTT passes), not the effect stack.
    if (isWireFilter(filterId)) {
      const w = buildWire(filterId, value);
      if (w) updateLayerProperty(layer.id, w.path, w.value);
      return;
    }
    const def = getEffectDef(filterId);
    if (def) {
      setLayerEffectParam(layer.id, def.type, 0, value, def.defaults);
      return;
    }
    // Not implemented yet — keep local UI state so the slider still moves.
    setFilterValues((prev) => ({ ...prev, [filterId]: value }));
  }, [layer.id, updateLayerProperty, setLayerEffectParam]);

  const handleResetFilter = useCallback((filter: FilterDef) => {
    const defaultVal = filter.defaultValue ?? 0;
    if (isLegacyFilter(filter.id)) {
      updateLayerProperty(layer.id, `filters.${filter.id}`, defaultVal);
      return;
    }
    if (isWireFilter(filter.id)) {
      // value 0 → disabled LayerBlur/LayerGlow (renderer skips it).
      const w = buildWire(filter.id, 0);
      if (w) updateLayerProperty(layer.id, w.path, w.value);
      return;
    }
    const def = getEffectDef(filter.id);
    if (def) {
      removeLayerEffect(layer.id, def.type);
      return;
    }
    setFilterValues((prev) => ({ ...prev, [filter.id]: defaultVal }));
  }, [layer.id, updateLayerProperty, removeLayerEffect]);

  const getFilterValue = useCallback((filter: FilterDef): number => {
    if (isLegacyFilter(filter.id)) {
      return (layer.filters as unknown as Record<string, number>)[filter.id] ?? filter.defaultValue ?? 0;
    }
    if (isWireFilter(filter.id)) {
      return readWireValue(filter.id, layer);
    }
    const def = getEffectDef(filter.id);
    if (def) {
      const e = layer.effects?.find((x) => x.type === def.type);
      return e ? (e.params[0] ?? filter.defaultValue ?? 0) : (filter.defaultValue ?? 0);
    }
    if (filterValues[filter.id] !== undefined) return filterValues[filter.id] as number;
    return filter.defaultValue ?? 0;
  }, [filterValues, layer.filters, layer.effects, layer.blur, layer.glow]);

  const filteredCategories = searchQuery.trim()
    ? FILTER_CATEGORIES.map((cat) => ({
        ...cat,
        filters: cat.filters.filter((f) =>
          f.label.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter((cat) => cat.filters.length > 0)
    : FILTER_CATEGORIES;

  const totalActive = FILTER_CATEGORIES.flatMap((c) => c.filters)
    .filter((f) => getFilterValue(f) !== (f.defaultValue ?? 0)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with search */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Filters</span>
            {totalActive > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f7b500]/15 text-[#f7b500] font-medium">
                {totalActive} active
              </span>
            )}
          </div>
          <span className="text-[9px] text-slate-600">
            {FILTER_CATEGORIES.reduce((sum, c) => sum + c.filters.length, 0)} filters
          </span>
        </div>

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filters..."
            className="w-full h-7 pl-7 pr-3 text-[10px] rounded-md bg-[#0c1a2d] border border-[#1a2a42] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-[#f7b500]/40 transition-colors"
          />
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-1.5 pb-3">
        {filteredCategories.map((category) => (
          <FilterCategoryAccordion
            key={category.id}
            category={category}
            expanded={searchQuery.trim() ? true : expandedCategories.has(category.id)}
            onToggle={() => toggleCategory(category.id)}
            getFilterValue={getFilterValue}
            onFilterChange={handleFilterChange}
            onResetFilter={handleResetFilter}
          />
        ))}

        {filteredCategories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-slate-600">
            <Search size={20} className="mb-2 opacity-50" />
            <span className="text-[10px]">No filters match "{searchQuery}"</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterCategoryAccordion({
  category,
  expanded,
  onToggle,
  getFilterValue,
  onFilterChange,
  onResetFilter,
}: {
  category: FilterCategory;
  expanded: boolean;
  onToggle: () => void;
  getFilterValue: (filter: FilterDef) => number;
  onFilterChange: (id: string, value: number) => void;
  onResetFilter: (filter: FilterDef) => void;
}) {
  const activeCount = category.filters.filter((f) => {
    const val = getFilterValue(f);
    return val !== (f.defaultValue ?? 0);
  }).length;

  return (
    <div className="mb-0.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-[7px] rounded-md text-left transition-colors hover:bg-white/[0.03] group"
      >
        <ChevronRight
          size={12}
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-[10px] font-medium text-slate-300 flex-1">{category.label}</span>
        <span className="text-[9px] text-slate-600 group-hover:text-slate-500">
          {category.filters.length}
        </span>
        {activeCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#f7b500]" />
        )}
      </button>

      {expanded && (
        <div className="pl-2 pr-1 pb-1.5 space-y-0.5 animate-in slide-in-from-top-1 duration-150">
          {category.filters.map((filter) => (
            <FilterControl
              key={filter.id}
              filter={filter}
              value={getFilterValue(filter)}
              onChange={(v) => onFilterChange(filter.id, v)}
              onReset={() => onResetFilter(filter)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterControl({
  filter,
  value,
  onChange,
  onReset,
}: {
  filter: FilterDef;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const isActive = value !== (filter.defaultValue ?? 0);
  const isToggle = filter.type === 'toggle';
  const isFile = filter.type === 'file';
  const isSelect = filter.type === 'select';

  if (isToggle) {
    return (
      <div className="flex items-center gap-1.5 py-[3px] px-2 rounded hover:bg-white/[0.02]">
        <label className="text-[10px] text-slate-500 flex-1 cursor-pointer">{filter.label}</label>
        <button
          onClick={() => onChange(value === 1 ? 0 : 1)}
          className={`w-7 h-3.5 rounded-full relative transition-colors ${
            value === 1 ? 'bg-[#f7b500]' : 'bg-[#1a2a42]'
          }`}
        >
          <div
            className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${
              value === 1 ? 'left-[15px]' : 'left-[2px]'
            }`}
          />
        </button>
      </div>
    );
  }

  if (isFile) {
    return (
      <div className="flex items-center gap-1.5 py-[3px] px-2 rounded hover:bg-white/[0.02]">
        <label className="text-[10px] text-slate-500 flex-1">{filter.label}</label>
        <button className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-slate-500 bg-[#1a2a42] hover:bg-[#1c3155] transition-colors">
          <Upload size={9} />
          Load
        </button>
      </div>
    );
  }

  if (isSelect) {
    return (
      <div className="flex items-center gap-1.5 py-[3px] px-2 rounded hover:bg-white/[0.02]">
        <label className="text-[10px] text-slate-500 w-20 flex-shrink-0">{filter.label}</label>
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-5 text-[9px] rounded bg-[#0c1a2d] border border-[#1a2a42] text-slate-400 px-1.5 focus:outline-none focus:border-[#f7b500]/40"
        >
          {filter.options?.map((opt, i) => (
            <option key={opt} value={i}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  const min = filter.min ?? 0;
  const max = filter.max ?? 1;
  const step = filter.step ?? 0.01;
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;

  return (
    <div className="flex items-center gap-1 py-[2px] px-2 rounded hover:bg-white/[0.02] group/filter">
      <label className="text-[10px] text-slate-500 w-20 flex-shrink-0 truncate" title={filter.label}>
        {filter.label}
      </label>
      <div className="flex-1 relative h-[14px] flex items-center">
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-[#1a2a42] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#f7b500]/40 to-[#f7b500]/70 transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-2.5 h-2.5 rounded-full border border-slate-500 bg-[#0e1c32] pointer-events-none transition-colors group-hover/filter:border-slate-400"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <span className={`text-[9px] font-mono w-9 text-right flex-shrink-0 ${isActive ? 'text-[#f7b500]' : 'text-slate-600'}`}>
        {formatValue(value, step)}
      </span>
      {isActive && (
        <button
          onClick={onReset}
          className="opacity-0 group-hover/filter:opacity-100 text-slate-600 hover:text-slate-400 transition-opacity flex-shrink-0"
          title="Reset"
        >
          <RotateCcw size={9} />
        </button>
      )}
    </div>
  );
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return Math.round(value).toString();
  if (step >= 0.1) return value.toFixed(1);
  return value.toFixed(2);
}
