import { useState } from 'react';
import { useGridStore } from '../../store/grid';
import { useEditorStore } from '../../store/editor';
import {
  Grid3x3, Eye, EyeOff, Plus, Trash2,
  Lock, Unlock, X, ChevronDown, ChevronRight
} from 'lucide-react';

export function GridSettingsPanel({ onClose }: { onClose: () => void }) {
  const grid = useGridStore((s) => s.grid);
  const guides = useGridStore((s) => s.guides);
  const setGridVisible = useGridStore((s) => s.setGridVisible);
  const setGridColumns = useGridStore((s) => s.setGridColumns);
  const setGridRows = useGridStore((s) => s.setGridRows);
  const setGridOpacity = useGridStore((s) => s.setGridOpacity);
  const setGridSubdivisions = useGridStore((s) => s.setGridSubdivisions);
  const setGuidesVisible = useGridStore((s) => s.setGuidesVisible);
  const addGuideline = useGridStore((s) => s.addGuideline);
  const removeGuideline = useGridStore((s) => s.removeGuideline);
  const moveGuideline = useGridStore((s) => s.moveGuideline);
  const toggleGuidelineVisibility = useGridStore((s) => s.toggleGuidelineVisibility);
  const toggleGuidelineLocked = useGridStore((s) => s.toggleGuidelineLocked);
  const clearGuidelines = useGridStore((s) => s.clearGuidelines);

  const composition = useEditorStore((s) => s.composition);
  const canvasW = composition.settings.width;
  const canvasH = composition.settings.height;

  const [gridExpanded, setGridExpanded] = useState(true);
  const [guidesExpanded, setGuidesExpanded] = useState(true);
  const [newGuideAxis, setNewGuideAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [newGuidePos, setNewGuidePos] = useState('');

  const handleAddGuide = () => {
    const pos = Number(newGuidePos);
    if (isNaN(pos)) return;
    const max = newGuideAxis === 'vertical' ? canvasW : canvasH;
    const clamped = Math.max(0, Math.min(max, pos));
    addGuideline(newGuideAxis, clamped);
    setNewGuidePos('');
  };

  const colWidth = Math.round(canvasW / grid.columns);
  const rowHeight = Math.round(canvasH / grid.rows);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed top-[52px] right-4 z-50 w-[280px] bg-[#0e1c32] border border-[#1c3155] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#1c3155]">
          <div className="flex items-center gap-2">
            <Grid3x3 size={12} className="text-[#f7b500]" />
            <span className="text-[11px] font-semibold text-slate-200">Grid & Guides</span>
          </div>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-[#1c3155] transition-colors">
            <X size={12} className="text-slate-500" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* Grid Section */}
          <div className="border-b border-[#1c3155]">
            <button
              onClick={() => setGridExpanded(!gridExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#122240] transition-colors"
            >
              {gridExpanded ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Grid</span>
            </button>

            {gridExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {/* Visibility toggle */}
                <div className="flex items-center gap-3">
                  <Toggle label="Visible" active={grid.visible} onToggle={setGridVisible} icon={grid.visible ? Eye : EyeOff} />
                </div>

                {/* Columns & Rows */}
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput label="Columns" value={grid.columns} onChange={setGridColumns} min={1} max={100} />
                  <NumberInput label="Rows" value={grid.rows} onChange={setGridRows} min={1} max={100} />
                </div>

                {/* Info */}
                <div className="text-[8px] text-slate-600 font-mono">
                  Cell: {colWidth}x{rowHeight}px
                </div>

                {/* Subdivisions */}
                <NumberInput label="Subdivisions" value={grid.subdivisions} onChange={setGridSubdivisions} min={1} max={10} />

                {/* Opacity */}
                <div>
                  <label className="text-[9px] text-slate-500 mb-0.5 block">Opacity</label>
                  <input
                    type="range"
                    min={2}
                    max={100}
                    value={Math.round(grid.opacity * 100)}
                    onChange={(e) => setGridOpacity(Number(e.target.value) / 100)}
                    className="w-full h-1 bg-[#1c3155] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f7b500]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Guidelines Section */}
          <div>
            <button
              onClick={() => setGuidesExpanded(!guidesExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#122240] transition-colors"
            >
              {guidesExpanded ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Guidelines</span>
              <span className="text-[9px] text-slate-600 ml-auto">{guides.guidelines.length}</span>
            </button>

            {guidesExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {/* Visibility toggle */}
                <div className="flex items-center gap-3">
                  <Toggle label="Visible" active={guides.visible} onToggle={setGuidesVisible} icon={guides.visible ? Eye : EyeOff} />
                </div>

                {/* Add guide */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={newGuideAxis}
                    onChange={(e) => setNewGuideAxis(e.target.value as 'vertical' | 'horizontal')}
                    className="bg-[#122240] border border-[#1c3155] rounded text-[9px] text-slate-300 px-1 py-0.5 outline-none focus:border-[#f7b500]/50"
                  >
                    <option value="vertical">X</option>
                    <option value="horizontal">Y</option>
                  </select>
                  <input
                    type="number"
                    value={newGuidePos}
                    onChange={(e) => setNewGuidePos(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuide(); }}
                    placeholder={newGuideAxis === 'vertical' ? `0-${canvasW}` : `0-${canvasH}`}
                    className="flex-1 bg-[#122240] border border-[#1c3155] rounded text-[9px] text-slate-300 px-1.5 py-0.5 outline-none focus:border-[#f7b500]/50 placeholder:text-slate-700"
                  />
                  <button
                    onClick={handleAddGuide}
                    className="p-1 rounded bg-[#f7b500]/10 border border-[#f7b500]/30 hover:bg-[#f7b500]/15 transition-colors"
                  >
                    <Plus size={10} className="text-[#f7b500]" />
                  </button>
                </div>

                {/* Quick add buttons */}
                <div className="flex gap-1">
                  <QuickGuideBtn label={`X:${Math.round(canvasW / 2)}`} onClick={() => addGuideline('vertical', canvasW / 2)} />
                  <QuickGuideBtn label={`Y:${Math.round(canvasH / 2)}`} onClick={() => addGuideline('horizontal', canvasH / 2)} />
                  <QuickGuideBtn label="Thirds" onClick={() => {
                    addGuideline('vertical', canvasW / 3);
                    addGuideline('vertical', (canvasW / 3) * 2);
                    addGuideline('horizontal', canvasH / 3);
                    addGuideline('horizontal', (canvasH / 3) * 2);
                  }} />
                </div>

                {/* Guide list */}
                {guides.guidelines.length > 0 && (
                  <div className="space-y-0.5 max-h-[140px] overflow-y-auto">
                    {guides.guidelines.map((g) => (
                      <div key={g.id} className="flex items-center gap-1 group/guide">
                        <span className="text-[8px] text-slate-600 w-4 font-mono">
                          {g.axis === 'vertical' ? 'X' : 'Y'}
                        </span>
                        <input
                          type="number"
                          value={Math.round(g.position)}
                          onChange={(e) => moveGuideline(g.id, Number(e.target.value))}
                          className="w-12 bg-[#122240] border border-[#1c3155] rounded text-[8px] text-slate-300 px-1 py-0.5 outline-none focus:border-[#f7b500]/50"
                        />
                        <button onClick={() => toggleGuidelineVisibility(g.id)} className="p-0.5 rounded hover:bg-[#1c3155]">
                          {g.visible ? <Eye size={8} className="text-slate-500" /> : <EyeOff size={8} className="text-slate-600" />}
                        </button>
                        <button onClick={() => toggleGuidelineLocked(g.id)} className="p-0.5 rounded hover:bg-[#1c3155]">
                          {g.locked ? <Lock size={8} className="text-amber-500" /> : <Unlock size={8} className="text-slate-600" />}
                        </button>
                        <button onClick={() => removeGuideline(g.id)} className="p-0.5 rounded hover:bg-red-500/10 opacity-0 group-hover/guide:opacity-100 transition-opacity">
                          <Trash2 size={8} className="text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {guides.guidelines.length > 0 && (
                  <button
                    onClick={clearGuidelines}
                    className="w-full text-[9px] text-red-400/70 hover:text-red-400 py-1 rounded hover:bg-red-500/5 transition-colors"
                  >
                    Clear all guides
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Toggle({ label, active, onToggle, icon: Icon }: {
  label: string;
  active: boolean;
  onToggle: (v: boolean) => void;
  icon: typeof Eye;
}) {
  return (
    <button
      onClick={() => onToggle(!active)}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-medium transition-all ${
        active
          ? 'border-[#f7b500]/30 bg-[#f7b500]/10 text-[#ffc83d]'
          : 'border-[#1c3155] bg-transparent text-slate-600 hover:text-slate-400'
      }`}
    >
      <Icon size={10} />
      <span>{label}</span>
    </button>
  );
}

function NumberInput({ label, value, onChange, min, max, suffix }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-[8px] text-slate-600 block mb-0.5">{label}</label>
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-[#122240] border border-[#1c3155] rounded text-[10px] text-slate-300 px-1.5 py-0.5 outline-none focus:border-[#f7b500]/50"
        />
        {suffix && <span className="text-[8px] text-slate-600">{suffix}</span>}
      </div>
    </div>
  );
}

function QuickGuideBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[8px] text-slate-500 bg-[#122240] border border-[#1c3155] hover:border-[#f7b500]/30 hover:text-[#f7b500] transition-colors"
    >
      {label}
    </button>
  );
}
