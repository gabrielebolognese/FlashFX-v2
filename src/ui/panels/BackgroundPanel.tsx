import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, X, Paintbrush, Grid3x3, Atom, Globe, Play, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { useEditorStore } from '../../store/editor';
import { BrandColorPicker } from '../components/BrandColorPicker';
import { useGridStore } from '../../store/grid';
import { sampleBakedFrame } from '../../physics/bake';
import type { BackgroundLayer, BackgroundBlendMode, BackgroundLayerType, GradientStop, PhysicsBindingDef } from '../../core/types';
import { DragInput } from '../components/DragInput';

type CanvasTab = 'background' | 'grid' | 'physics';

const EMPTY_BINDINGS: PhysicsBindingDef[] = [];

const BLEND_MODES: { value: BackgroundBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'softLight', label: 'Soft Light' },
  { value: 'add', label: 'Add' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

const LAYER_TYPES: { value: BackgroundLayerType; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
];

function colorToHex(c: [number, number, number]): string {
  return '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function hexToColor(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function BackgroundPanel() {
  const [tab, setTab] = useState<CanvasTab>('background');

  const tabs: { id: CanvasTab; label: string; icon: React.ReactNode }[] = [
    { id: 'background', label: 'Fill', icon: <Paintbrush size={13} /> },
    { id: 'grid', label: 'Grid', icon: <Grid3x3 size={13} /> },
    { id: 'physics', label: 'Physics', icon: <Atom size={13} /> },
  ];

  return (
    <div className="flex-1 flex flex-row overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'background' && <BackgroundFillTab />}
        {tab === 'grid' && <GridTab />}
        {tab === 'physics' && <PhysicsWorldTab />}
      </div>
      <nav className="flex-shrink-0 w-[96px] flex flex-col py-1 border-l border-[#1a2a42] bg-[#0b0e15] overflow-y-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`relative flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-left transition-colors ${
              tab === t.id
                ? 'text-[#f7b500] bg-[#f7b500]/10'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
            }`}
          >
            <span
              className={`absolute left-0 top-0 bottom-0 w-[2px] transition-colors ${
                tab === t.id ? 'bg-[#f7b500]' : 'bg-transparent'
              }`}
            />
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function BackgroundFillTab() {
  const composition = useEditorStore((s) => s.composition);
  const addBackgroundLayer = useEditorStore((s) => s.addBackgroundLayer);
  const removeBackgroundLayer = useEditorStore((s) => s.removeBackgroundLayer);
  const updateBackgroundLayer = useEditorStore((s) => s.updateBackgroundLayer);
  const reorderBackgroundLayer = useEditorStore((s) => s.reorderBackgroundLayer);

  const bgLayers = composition.background.layers;

  const clearAll = () => {
    for (const l of bgLayers) removeBackgroundLayer(l.id);
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          Background Fill
        </span>
        <div className="flex items-center gap-1">
          {bgLayers.length > 1 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] rounded bg-[#122240] text-slate-500 hover:text-red-400"
              title="Clear all"
            >
              <X size={9} />
              None
            </button>
          )}
          <button
            onClick={addBackgroundLayer}
            disabled={bgLayers.length >= 10}
            className="p-1 rounded hover:bg-[#1a2a42] text-slate-400 hover:text-slate-200 disabled:opacity-30"
            title="Add layer"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {bgLayers.length === 0 && (
        <button
          onClick={addBackgroundLayer}
          className="w-full py-2 rounded border border-dashed border-[#243a5c] text-[10px] text-slate-400 hover:bg-[#122240] hover:text-slate-200 hover:border-[#f7b500]/50 transition-colors"
        >
          + Add Fill Color
        </button>
      )}

      {bgLayers.length > 0 && (
        <div
          className="h-6 rounded border border-[#243a5c]"
          style={{ background: getCompositePreview(bgLayers) }}
          title="Composite preview"
        />
      )}

      {bgLayers.map((layer, idx) => (
        <BackgroundLayerCard
          key={layer.id}
          layer={layer}
          index={idx}
          total={bgLayers.length}
          onUpdate={(updates) => updateBackgroundLayer(layer.id, updates)}
          onRemove={() => removeBackgroundLayer(layer.id)}
          onReorder={(dir) => reorderBackgroundLayer(layer.id, dir)}
        />
      ))}
    </div>
  );
}

function GridTab() {
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
    <div className="p-3 space-y-3">
      {/* Grid Section */}
      <div className="border border-[#1a2a42] rounded-md overflow-hidden">
        <button
          onClick={() => setGridExpanded(!gridExpanded)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-[#0a1628] hover:bg-[#0d1d35] transition-colors"
        >
          {gridExpanded ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
          <Grid3x3 size={11} className="text-[#f7b500]" />
          <span className="text-[10px] font-medium text-slate-300 flex-1 text-left">Grid</span>
          <button
            onClick={(e) => { e.stopPropagation(); setGridVisible(!grid.visible); }}
            className={`p-0.5 rounded ${grid.visible ? 'text-[#f7b500]' : 'text-slate-600'}`}
          >
            {grid.visible ? <Eye size={10} /> : <EyeOff size={10} />}
          </button>
        </button>
        {gridExpanded && (
          <div className="px-2.5 py-2 space-y-2 bg-[#060f1c]">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] text-slate-500">
                Columns
                <input type="number" value={grid.columns} min={1} max={100}
                  onChange={(e) => setGridColumns(Number(e.target.value))}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
              <label className="text-[9px] text-slate-500">
                Rows
                <input type="number" value={grid.rows} min={1} max={100}
                  onChange={(e) => setGridRows(Number(e.target.value))}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
            </div>
            <div className="text-[8px] text-slate-600 font-mono">Cell: {colWidth}x{rowHeight}px</div>
            <label className="text-[9px] text-slate-500 block">
              Subdivisions
              <input type="number" value={grid.subdivisions} min={1} max={10}
                onChange={(e) => setGridSubdivisions(Number(e.target.value))}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
              />
            </label>
            <label className="text-[9px] text-slate-500 block">
              Opacity
              <input
                type="range" min={2} max={100}
                value={Math.round(grid.opacity * 100)}
                onChange={(e) => setGridOpacity(Number(e.target.value) / 100)}
                className="w-full h-1 mt-1 bg-[#1c3155] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f7b500]"
              />
            </label>
          </div>
        )}
      </div>

      {/* Guidelines Section */}
      <div className="border border-[#1a2a42] rounded-md overflow-hidden">
        <button
          onClick={() => setGuidesExpanded(!guidesExpanded)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-[#0a1628] hover:bg-[#0d1d35] transition-colors"
        >
          {guidesExpanded ? <ChevronDown size={10} className="text-slate-500" /> : <ChevronRight size={10} className="text-slate-500" />}
          <span className="text-[10px] font-medium text-slate-300 flex-1 text-left">Guidelines</span>
          <span className="text-[9px] text-slate-600">{guides.guidelines.length}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setGuidesVisible(!guides.visible); }}
            className={`p-0.5 rounded ${guides.visible ? 'text-[#f7b500]' : 'text-slate-600'}`}
          >
            {guides.visible ? <Eye size={10} /> : <EyeOff size={10} />}
          </button>
        </button>
        {guidesExpanded && (
          <div className="px-2.5 py-2 space-y-2 bg-[#060f1c]">
            <div className="flex items-center gap-1.5">
              <select
                value={newGuideAxis}
                onChange={(e) => setNewGuideAxis(e.target.value as 'vertical' | 'horizontal')}
                className="bg-[#0a1628] border border-[#1a2a42] rounded text-[9px] text-slate-300 px-1 py-0.5 outline-none"
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
                className="flex-1 bg-[#0a1628] border border-[#1a2a42] rounded text-[9px] text-slate-300 px-1.5 py-0.5 outline-none placeholder:text-slate-700"
              />
              <button onClick={handleAddGuide} className="p-1 rounded bg-[#f7b500]/10 hover:bg-[#f7b500]/15">
                <Plus size={9} className="text-[#f7b500]" />
              </button>
            </div>
            <div className="flex gap-1">
              <button onClick={() => addGuideline('vertical', canvasW / 2)} className="px-1.5 py-0.5 text-[8px] rounded bg-[#122240] text-slate-500 hover:text-slate-300">X:{Math.round(canvasW / 2)}</button>
              <button onClick={() => addGuideline('horizontal', canvasH / 2)} className="px-1.5 py-0.5 text-[8px] rounded bg-[#122240] text-slate-500 hover:text-slate-300">Y:{Math.round(canvasH / 2)}</button>
              <button onClick={() => { addGuideline('vertical', canvasW / 3); addGuideline('vertical', (canvasW / 3) * 2); addGuideline('horizontal', canvasH / 3); addGuideline('horizontal', (canvasH / 3) * 2); }} className="px-1.5 py-0.5 text-[8px] rounded bg-[#122240] text-slate-500 hover:text-slate-300">Thirds</button>
            </div>
            {guides.guidelines.length > 0 && (
              <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                {guides.guidelines.map((g) => (
                  <div key={g.id} className="flex items-center gap-1 group/guide">
                    <span className="text-[8px] text-slate-600 w-3 font-mono">{g.axis === 'vertical' ? 'X' : 'Y'}</span>
                    <input type="number" value={Math.round(g.position)} onChange={(e) => moveGuideline(g.id, Number(e.target.value))} className="w-10 bg-[#0a1628] border border-[#1a2a42] rounded text-[8px] text-slate-300 px-1 py-0.5 outline-none" />
                    <button onClick={() => toggleGuidelineVisibility(g.id)} className="p-0.5 rounded hover:bg-[#1a2a42]">
                      {g.visible ? <Eye size={8} className="text-slate-500" /> : <EyeOff size={8} className="text-slate-600" />}
                    </button>
                    <button onClick={() => toggleGuidelineLocked(g.id)} className="p-0.5 rounded hover:bg-[#1a2a42]">
                      {g.locked ? <Lock size={8} className="text-amber-500" /> : <Unlock size={8} className="text-slate-600" />}
                    </button>
                    <button onClick={() => removeGuideline(g.id)} className="p-0.5 rounded hover:bg-red-500/10 opacity-0 group-hover/guide:opacity-100">
                      <Trash2 size={8} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {guides.guidelines.length > 0 && (
              <button onClick={clearGuidelines} className="w-full text-[9px] text-red-400/70 hover:text-red-400 py-1 rounded hover:bg-red-500/5">
                Clear all guides
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhysicsWorldTab() {
  const physicsWorld = useEditorStore((s) => s.composition.physicsWorld);
  const physicsBindings = useEditorStore((s) => s.composition.physicsBindings) ?? EMPTY_BINDINGS;
  const updatePhysicsWorld = useEditorStore((s) => s.updatePhysicsWorld);
  const bakePhysics = useEditorStore((s) => s.bakePhysics);
  const bakeStatus = useEditorStore((s) => s.physicsBakeStatus);
  const bakeProgress = useEditorStore((s) => s.physicsBakeProgress);
  const composition = useEditorStore((s) => s.composition);

  const world = physicsWorld ?? { enabled: false, gravityX: 0, gravityY: 980, timeScale: 1, substeps: 1 };
  const hasDynamicBindings = physicsBindings.some((b) => b.role === 'dynamic');
  const canBake = world.enabled && hasDynamicBindings && bakeStatus !== 'baking';

  return (
    <div className="p-3 space-y-3">
      {/* World Enable Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium flex items-center gap-1.5">
          <Globe size={11} className="text-emerald-400" />
          Physics World
        </span>
        <button
          onClick={() => updatePhysicsWorld({ enabled: !world.enabled })}
          className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
            world.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/40 text-slate-500 hover:text-slate-300'
          }`}
        >
          {world.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* World Settings */}
      <div className="border border-[#1a2a42] rounded-md overflow-hidden bg-[#060f1c]">
        <div className="px-2.5 py-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] text-slate-500">
              Gravity X
              <input type="number" value={world.gravityX} step={10}
                onChange={(e) => updatePhysicsWorld({ gravityX: +e.target.value })}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
              />
            </label>
            <label className="text-[9px] text-slate-500">
              Gravity Y
              <input type="number" value={world.gravityY} step={10}
                onChange={(e) => updatePhysicsWorld({ gravityY: +e.target.value })}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] text-slate-500">
              Time Scale
              <input type="number" value={world.timeScale} step={0.1} min={0.1} max={5}
                onChange={(e) => updatePhysicsWorld({ timeScale: +e.target.value })}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
              />
            </label>
            <label className="text-[9px] text-slate-500">
              Substeps
              <input type="number" value={world.substeps} min={1} max={8} step={1}
                onChange={(e) => updatePhysicsWorld({ substeps: Math.max(1, +e.target.value) })}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mt-0.5"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Bake Button */}
      <div className="border border-[#1a2a42] rounded-md overflow-hidden">
        <button
          onClick={() => { if (canBake) bakePhysics(); }}
          disabled={!canBake}
          className={`w-full px-2 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors ${
            bakeStatus === 'baking'
              ? 'bg-amber-500/10 text-amber-400 cursor-wait'
              : bakeStatus === 'done'
              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer'
              : bakeStatus === 'stale'
              ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 cursor-pointer'
              : canBake
              ? 'bg-[#0a1628] text-slate-300 hover:bg-[#0d1d35] cursor-pointer'
              : 'bg-[#060f1c] text-slate-600 cursor-not-allowed'
          }`}
        >
          <Play size={11} />
          {bakeStatus === 'baking'
            ? `Simulating... ${bakeProgress}%`
            : bakeStatus === 'done'
            ? 'Re-bake Simulation'
            : bakeStatus === 'stale'
            ? 'Re-bake (stale)'
            : 'Bake Simulation'}
        </button>
        {bakeStatus === 'baking' && (
          <div className="h-0.5 bg-[#1a2a42]">
            <div className="h-full bg-amber-400 transition-all duration-200" style={{ width: `${bakeProgress}%` }} />
          </div>
        )}
      </div>

      {/* Status */}
      {bakeStatus === 'done' && (
        <div className="px-2.5 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-md text-[9px] text-emerald-400/80 text-center">
          Simulation ready. Press Play to see physics in action.
        </div>
      )}

      {/* Physics objects summary */}
      <div className="border border-[#1a2a42] rounded-md overflow-hidden bg-[#060f1c]">
        <div className="px-2.5 py-1.5 bg-[#0a1628]">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Objects ({physicsBindings.length})</span>
        </div>
        {physicsBindings.length === 0 ? (
          <div className="px-2.5 py-3 text-[10px] text-slate-600 text-center">
            No physics objects assigned. Select a layer and go to the Physics tab in the inspector to assign physics roles.
          </div>
        ) : (
          <div className="px-2.5 py-1.5 space-y-1">
            {physicsBindings.map((b) => {
              const layerName = composition.layers.find((l) => l.id === b.layerId)?.name ?? 'Unknown';
              const roleColor = { dynamic: 'text-orange-400', kinematic: 'text-blue-400', static: 'text-slate-400', ghost: 'text-purple-400' }[b.role];
              return (
                <div key={b.id} className="flex items-center gap-1.5 text-[9px]">
                  <Atom size={9} className={roleColor} />
                  <span className="text-slate-300 flex-1 truncate">{layerName}</span>
                  <span className={`${roleColor} capitalize`}>{b.role}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mini preview placeholder */}
      {physicsBindings.length > 0 && bakeStatus === 'done' && (
        <div className="border border-[#1a2a42] rounded-md overflow-hidden">
          <div className="px-2.5 py-1.5 bg-[#0a1628] text-[9px] text-slate-500 uppercase tracking-wider">
            Preview
          </div>
          <PhysicsPreview />
        </div>
      )}
    </div>
  );
}

function PhysicsPreview() {
  const composition = useEditorStore((s) => s.composition);
  const physicsBindings = useEditorStore((s) => s.composition.physicsBindings) ?? EMPTY_BINDINGS;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const totalFrames = composition.settings.durationFrames;
  const canvasW = composition.settings.width;
  const canvasH = composition.settings.height;

  const previewScale = 200 / Math.max(canvasW, canvasH);

  const startPlay = () => {
    setPlaying(true);
    setFrame(0);
    let f = 0;
    const interval = setInterval(() => {
      f++;
      if (f >= totalFrames) { clearInterval(interval); setPlaying(false); return; }
      setFrame(f);
    }, 1000 / composition.settings.frameRate);
  };

  return (
    <div className="relative bg-[#060f1c]">
      <div
        className="mx-auto my-2 relative border border-[#1a2a42] rounded overflow-hidden"
        style={{ width: canvasW * previewScale, height: canvasH * previewScale }}
      >
        {physicsBindings.filter((b) => b.role === 'dynamic').map((b) => {
          const baked = sampleBakedFrame(b.layerId, frame);
          if (!baked) return null;
          return (
            <div
              key={b.id}
              className="absolute w-2 h-2 bg-orange-400 rounded-sm"
              style={{
                left: baked.x * previewScale - 4,
                top: baked.y * previewScale - 4,
                transform: `rotate(${baked.rotation * (180 / Math.PI)}deg)`,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-[#1a2a42]">
        <button
          onClick={startPlay}
          disabled={playing}
          className="p-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <Play size={9} />
        </button>
        <div className="flex-1 h-1 bg-[#1a2a42] rounded-full overflow-hidden">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(frame / Math.max(1, totalFrames - 1)) * 100}%` }} />
        </div>
        <span className="text-[8px] text-slate-600 font-mono w-6 text-right">{frame}</span>
      </div>
    </div>
  );
}

// --- Background Layer Card ---

interface LayerCardProps {
  layer: BackgroundLayer;
  index: number;
  total: number;
  onUpdate: (updates: Partial<BackgroundLayer>) => void;
  onRemove: () => void;
  onReorder: (dir: 'up' | 'down') => void;
}

function BackgroundLayerCard({ layer, index, total, onUpdate, onRemove, onReorder }: LayerCardProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const previewBg = getLayerPreview(layer);

  return (
    <div className="rounded border border-[#1a2a42] bg-[#0c1018] overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-[#122240]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500">
          {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <div
          className="w-6 h-4 rounded-sm border border-[#243a5c] flex-shrink-0"
          style={{ background: previewBg }}
        />
        <span className="text-[10px] text-slate-300 flex-1 truncate">
          Layer {index + 1} - {layer.type}
        </span>
        <span className="text-[9px] text-slate-500">{Math.round(layer.opacity * 100)}%</span>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onReorder('up')} disabled={index === 0} className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-20">
            <ArrowUp size={9} />
          </button>
          <button onClick={() => onReorder('down')} disabled={index === total - 1} className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-20">
            <ArrowDown size={9} />
          </button>
          <button onClick={onRemove} disabled={total <= 1} className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-red-400 disabled:opacity-20">
            <Trash2 size={9} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2.5 py-2 space-y-2 border-t border-[#1a2a42]">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Type</label>
            <div className="flex gap-0.5">
              {LAYER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => onUpdate({ type: t.value })}
                  className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                    layer.type === t.value
                      ? 'bg-[#f7b500]/15 text-[#ffc83d] ring-1 ring-[#f7b500]/30'
                      : 'bg-[#122240] text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 w-14 flex-shrink-0">Blend</label>
            <select
              value={layer.blendMode}
              onChange={(e) => onUpdate({ blendMode: e.target.value as BackgroundBlendMode })}
              className="flex-1 bg-[#122240] text-[10px] text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none"
            >
              {BLEND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <DragInput label="Opacity" value={Math.round(layer.opacity * 100)} onChange={(v) => onUpdate({ opacity: Math.max(0, Math.min(100, Math.round(v))) / 100 })} min={0} max={100} step={1} precision={0} suffix="%" />

          {layer.type === 'linear' && (
            <DragInput label="Angle" value={layer.angle} onChange={(v) => onUpdate({ angle: v })} step={1} precision={0} suffix="deg" />
          )}

          {layer.type === 'radial' && (
            <>
              <DragInput label="Center X" value={Math.round(layer.centerX * 100)} onChange={(v) => onUpdate({ centerX: Math.max(0, Math.min(100, Math.round(v))) / 100 })} min={0} max={100} step={1} precision={0} suffix="%" />
              <DragInput label="Center Y" value={Math.round(layer.centerY * 100)} onChange={(v) => onUpdate({ centerY: Math.max(0, Math.min(100, Math.round(v))) / 100 })} min={0} max={100} step={1} precision={0} suffix="%" />
              <DragInput label="Radius" value={Math.round(layer.radius * 100)} onChange={(v) => onUpdate({ radius: Math.max(1, Math.min(200, Math.round(v))) / 100 })} min={1} max={200} step={1} precision={0} suffix="%" />
            </>
          )}

          <ColorStopsEditor stops={layer.stops} showPosition={layer.type !== 'solid'} onChange={(stops) => onUpdate({ stops })} />
        </div>
      )}
    </div>
  );
}

// --- Color Stops ---

function ColorStopsEditor({ stops, showPosition, onChange }: { stops: GradientStop[]; showPosition: boolean; onChange: (stops: GradientStop[]) => void }) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const previewBg = `linear-gradient(90deg, ${sorted.map((s) => {
    const hex = colorToHex(s.color);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${s.opacity}) ${(s.position * 100).toFixed(0)}%`;
  }).join(', ')})`;

  const addStop = () => {
    if (stops.length >= 6) return;
    const midPos = stops.length > 1 ? (stops[stops.length - 2].position + stops[stops.length - 1].position) / 2 : 0.5;
    onChange([...stops, { color: [0.5, 0.5, 0.5], position: midPos, opacity: 1 }].sort((a, b) => a.position - b.position));
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 1) return;
    onChange(sorted.filter((_, i) => i !== idx));
  };

  const updateStop = (idx: number, updates: Partial<GradientStop>) => {
    onChange(sorted.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Color Stops</span>
        <button onClick={addStop} disabled={stops.length >= 6} className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-500 hover:text-slate-300 disabled:opacity-30">
          <Plus size={10} />
        </button>
      </div>
      {showPosition && <div className="h-4 rounded border border-[#243a5c]" style={{ background: previewBg }} />}
      {sorted.map((stop, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <input type="color" value={colorToHex(stop.color)} onChange={(e) => updateStop(idx, { color: hexToColor(e.target.value) })} className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 flex-shrink-0" />
          <input type="text" value={colorToHex(stop.color).toUpperCase()} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) updateStop(idx, { color: hexToColor(v) }); }} className="bg-[#122240] text-[9px] font-mono text-slate-300 px-1 py-0.5 rounded border border-[#1a2a42] outline-none w-14" />
          <BrandColorPicker onSelect={(rgba) => updateStop(idx, { color: [rgba[0], rgba[1], rgba[2]] })} currentAlpha={stop.opacity} />
          {showPosition && <DragInput label="P" value={Math.round(stop.position * 100)} onChange={(v) => updateStop(idx, { position: Math.max(0, Math.min(100, Math.round(v))) / 100 })} min={0} max={100} step={1} precision={0} className="flex-1" />}
          <DragInput label="A" value={Math.round(stop.opacity * 100)} onChange={(v) => updateStop(idx, { opacity: Math.max(0, Math.min(100, Math.round(v))) / 100 })} min={0} max={100} step={1} precision={0} className="flex-1" />
          <button onClick={() => removeStop(idx)} disabled={stops.length <= 1} className="p-0.5 rounded hover:bg-[#1a2a42] text-slate-600 hover:text-red-400 disabled:opacity-20 flex-shrink-0">
            <Trash2 size={9} />
          </button>
        </div>
      ))}
    </div>
  );
}

// --- Helpers ---

function getLayerPreview(layer: BackgroundLayer): string {
  if (layer.type === 'solid') {
    const s = layer.stops[0];
    if (!s) return '#081220';
    return colorToHex(s.color);
  }
  const sorted = [...layer.stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map((s) => `${colorToHex(s.color)} ${(s.position * 100).toFixed(0)}%`);
  if (layer.type === 'radial') return `radial-gradient(circle, ${parts.join(', ')})`;
  return `linear-gradient(${layer.angle}deg, ${parts.join(', ')})`;
}

function getCompositePreview(layers: BackgroundLayer[]): string {
  if (layers.length === 0) return '#081220';
  if (layers.length === 1) return getLayerPreview(layers[0]);
  return getLayerPreview(layers[0]);
}
