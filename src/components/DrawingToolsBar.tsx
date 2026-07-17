import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PenLine, Minus, Highlighter, Eraser, Settings2, ChevronDown } from 'lucide-react';

export interface DrawingDefaults {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  lineCap?: 'round' | 'butt' | 'square';
  lineJoin?: 'round' | 'bevel' | 'miter';
  smoothing?: number;
  pressureSensitive?: boolean;
}

interface DrawingToolsBarProps {
  activeTool: string;
  onSetActiveTool: (tool: string) => void;
  onSetDrawingDefaults: (defaults: DrawingDefaults) => void;
}

type BarTool = 'pen' | 'marker' | 'line' | 'eraser';

interface ToolPreset {
  label: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  lineCap: 'round' | 'butt' | 'square';
  lineJoin: 'round' | 'bevel' | 'miter';
  smoothing: number;
  pressureSensitive: boolean;
}

const PRESETS: Record<string, ToolPreset> = {
  sketch: {
    label: 'Sketch',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0.4,
    pressureSensitive: true,
  },
  ink: {
    label: 'Ink',
    stroke: '#000000',
    strokeWidth: 4,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0.6,
    pressureSensitive: true,
  },
  marker: {
    label: 'Marker',
    stroke: '#FFD700',
    strokeWidth: 24,
    opacity: 0.5,
    lineCap: 'square',
    lineJoin: 'miter',
    smoothing: 0.2,
    pressureSensitive: false,
  },
  calligraphy: {
    label: 'Calli',
    stroke: '#1a1a1a',
    strokeWidth: 8,
    opacity: 1,
    lineCap: 'butt',
    lineJoin: 'bevel',
    smoothing: 0.7,
    pressureSensitive: true,
  },
  brush: {
    label: 'Brush',
    stroke: '#2d4a6e',
    strokeWidth: 14,
    opacity: 0.75,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0.8,
    pressureSensitive: true,
  },
};

const DEFAULT_TOOL_SETTINGS: Record<BarTool, Omit<ToolPreset, 'label'>> = {
  pen: {
    stroke: '#000000',
    strokeWidth: 3,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0.5,
    pressureSensitive: true,
  },
  marker: {
    stroke: '#FFD700',
    strokeWidth: 24,
    opacity: 0.5,
    lineCap: 'square',
    lineJoin: 'miter',
    smoothing: 0.2,
    pressureSensitive: false,
  },
  line: {
    stroke: '#000000',
    strokeWidth: 3,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0,
    pressureSensitive: false,
  },
  eraser: {
    stroke: '#ffffff',
    strokeWidth: 20,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    smoothing: 0,
    pressureSensitive: false,
  },
};

const DrawingToolsBar: React.FC<DrawingToolsBarProps> = ({
  activeTool,
  onSetActiveTool,
  onSetDrawingDefaults,
}) => {
  const [activeBarTool, setActiveBarTool] = useState<BarTool | null>(null);
  const [settings, setSettings] = useState<Record<BarTool, Omit<ToolPreset, 'label'>>>(DEFAULT_TOOL_SETTINGS);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeTool !== 'pen' && activeTool !== 'line' && activeTool !== 'eraser') {
      setActiveBarTool(null);
    }
  }, [activeTool]);

  const activateTool = useCallback((tool: BarTool) => {
    const next: BarTool | null = activeBarTool === tool ? null : tool;
    setActiveBarTool(next);
    if (next) {
      const s = settings[next];
      const canvasToolName = next === 'eraser' ? 'eraser' : next === 'marker' ? 'pen' : next;
      onSetActiveTool(canvasToolName);
      onSetDrawingDefaults({
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        opacity: s.opacity,
        lineCap: s.lineCap,
        lineJoin: s.lineJoin,
        smoothing: s.smoothing,
        pressureSensitive: s.pressureSensitive,
      });
    } else {
      onSetActiveTool('select');
    }
  }, [activeBarTool, settings, onSetActiveTool, onSetDrawingDefaults]);

  const updateSetting = useCallback(<K extends keyof Omit<ToolPreset, 'label'>>(
    tool: BarTool,
    key: K,
    value: Omit<ToolPreset, 'label'>[K]
  ) => {
    setSettings(prev => {
      const updated = { ...prev, [tool]: { ...prev[tool], [key]: value } };
      if (tool === activeBarTool) {
        const s = updated[tool];
        const canvasToolName = tool === 'eraser' ? 'eraser' : tool === 'marker' ? 'pen' : tool;
        onSetActiveTool(canvasToolName);
        onSetDrawingDefaults({
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          opacity: s.opacity,
          lineCap: s.lineCap,
          lineJoin: s.lineJoin,
          smoothing: s.smoothing,
          pressureSensitive: s.pressureSensitive,
        });
      }
      return updated;
    });
  }, [activeBarTool, onSetActiveTool, onSetDrawingDefaults]);

  const applyPreset = useCallback((preset: ToolPreset) => {
    if (!activeBarTool || activeBarTool === 'eraser' || activeBarTool === 'line') return;
    const { label: _l, ...rest } = preset;
    setSettings(prev => ({ ...prev, [activeBarTool]: rest }));
    const canvasToolName = activeBarTool === 'marker' ? 'pen' : activeBarTool;
    onSetActiveTool(canvasToolName);
    onSetDrawingDefaults({ ...rest });
  }, [activeBarTool, onSetActiveTool, onSetDrawingDefaults]);

  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        panelBtnRef.current && !panelBtnRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPanel]);

  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPanel(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showPanel]);

  const btnClass = (active: boolean) =>
    `w-8 h-8 rounded-md transition-all duration-150 hover:scale-105 flex items-center justify-center ${
      active
        ? 'bg-yellow-400/20 border border-yellow-400/50'
        : 'bg-gray-700/50 hover:bg-gray-600/50'
    }`;

  const iconClass = (active: boolean) =>
    `w-4 h-4 ${active ? 'text-yellow-400' : 'text-gray-300'}`;

  const divider = (
    <div className="w-px h-6 mx-1.5 flex-shrink-0" style={{ backgroundColor: 'rgba(75, 85, 99, 0.6)' }} />
  );

  const current = activeBarTool ? settings[activeBarTool] : null;
  const showPresets = activeBarTool && activeBarTool !== 'eraser' && activeBarTool !== 'line';

  return (
    <div className="flex-shrink-0 w-full flex items-center justify-center py-2 pointer-events-none">
      <div
        className="flex items-center gap-1 rounded-xl px-3 py-1.5 border pointer-events-auto"
        style={{
          backgroundColor: 'rgba(24, 30, 42, 0.96)',
          borderColor: 'rgba(55, 65, 81, 0.55)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Tool Buttons */}
        <div className="flex items-center gap-1">
          <button onClick={() => activateTool('pen')} className={btnClass(activeBarTool === 'pen')} title="Pen Tool (pressure sensitive)">
            <PenLine className={iconClass(activeBarTool === 'pen')} />
          </button>
          <button onClick={() => activateTool('marker')} className={btnClass(activeBarTool === 'marker')} title="Marker Tool">
            <Highlighter className={iconClass(activeBarTool === 'marker')} />
          </button>
          <button onClick={() => activateTool('line')} className={btnClass(activeBarTool === 'line')} title="Line Tool">
            <Minus className={iconClass(activeBarTool === 'line')} />
          </button>
          <button onClick={() => activateTool('eraser')} className={btnClass(activeBarTool === 'eraser')} title="Eraser Tool">
            <Eraser className={iconClass(activeBarTool === 'eraser')} />
          </button>
        </div>

        {divider}

        {/* Active Tool Color + Quick Settings */}
        {current && activeBarTool && (
          <div className="flex items-center gap-2">
            {activeBarTool !== 'eraser' && (
              <ColorSwatch
                color={current.stroke}
                onChange={(c) => updateSetting(activeBarTool, 'stroke', c)}
                isActive
                label="Stroke Color"
              />
            )}

            <div className="flex items-center gap-1">
              <div
                className="rounded-full border border-gray-600 flex-shrink-0"
                style={{
                  width: Math.max(6, Math.min(20, current.strokeWidth / 5 + 4)),
                  height: Math.max(6, Math.min(20, current.strokeWidth / 5 + 4)),
                  backgroundColor: activeBarTool === 'eraser' ? 'rgba(255,255,255,0.2)' : current.stroke,
                  opacity: current.opacity,
                }}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 text-xs w-3">S</span>
                <input
                  type="range"
                  min={activeBarTool === 'eraser' ? 4 : 1}
                  max={activeBarTool === 'marker' ? 200 : 100}
                  step={1}
                  value={current.strokeWidth}
                  onChange={(e) => updateSetting(activeBarTool, 'strokeWidth', parseInt(e.target.value, 10))}
                  className="w-20 h-1.5 appearance-none bg-gray-700 rounded cursor-pointer"
                  title={`Size: ${current.strokeWidth}px`}
                />
                <span className="text-xs text-yellow-400 font-mono w-6">{current.strokeWidth}</span>
              </div>
              {activeBarTool !== 'eraser' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500 text-xs w-3">O</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={Math.round(current.opacity * 100)}
                    onChange={(e) => updateSetting(activeBarTool, 'opacity', parseInt(e.target.value, 10) / 100)}
                    className="w-20 h-1.5 appearance-none bg-gray-700 rounded cursor-pointer"
                    title={`Opacity: ${Math.round(current.opacity * 100)}%`}
                  />
                  <span className="text-xs text-gray-400 font-mono w-6">{Math.round(current.opacity * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {divider}

        {/* Advanced Settings Panel Button */}
        <div className="relative">
          <button
            ref={panelBtnRef}
            onClick={() => setShowPanel(v => !v)}
            className={btnClass(showPanel)}
            title="Drawing Settings"
          >
            <Settings2 className={iconClass(showPanel)} />
            <ChevronDown className={`w-2 h-2 ml-0.5 ${showPanel ? 'text-yellow-400' : 'text-gray-500'}`} />
          </button>

          {showPanel && (
            <div
              ref={panelRef}
              className="absolute bottom-full mb-2 right-0 rounded-xl border shadow-2xl w-64"
              style={{
                backgroundColor: 'rgba(17, 24, 39, 0.98)',
                borderColor: 'rgba(55, 65, 81, 0.6)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="p-3 border-b" style={{ borderColor: 'rgba(55,65,81,0.4)' }}>
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  {activeBarTool ? activeBarTool.charAt(0).toUpperCase() + activeBarTool.slice(1) : 'Drawing'} Settings
                </span>
              </div>

              <div className="p-3 space-y-3">
                {/* Per-tool settings shown only when a tool is active */}
                {current && activeBarTool && (
                  <>
                    {/* Size */}
                    <PanelSlider
                      label="Size"
                      value={current.strokeWidth}
                      min={activeBarTool === 'eraser' ? 4 : 1}
                      max={activeBarTool === 'marker' ? 200 : 100}
                      unit="px"
                      onChange={(v) => updateSetting(activeBarTool, 'strokeWidth', v)}
                    />

                    {/* Opacity */}
                    {activeBarTool !== 'eraser' && (
                      <PanelSlider
                        label="Opacity"
                        value={Math.round(current.opacity * 100)}
                        min={5}
                        max={100}
                        unit="%"
                        onChange={(v) => updateSetting(activeBarTool, 'opacity', v / 100)}
                      />
                    )}

                    {/* Smoothing — not for eraser */}
                    {activeBarTool !== 'eraser' && (
                      <PanelSlider
                        label="Smoothing"
                        value={Math.round((current.smoothing ?? 0) * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(v) => updateSetting(activeBarTool, 'smoothing', v / 100)}
                      />
                    )}

                    {/* Line Cap */}
                    {activeBarTool !== 'eraser' && (
                      <div>
                        <span className="text-xs text-gray-400 mb-1.5 block">Line Cap</span>
                        <div className="flex gap-1">
                          {(['round', 'butt', 'square'] as const).map(cap => (
                            <CapButton
                              key={cap}
                              cap={cap}
                              active={current.lineCap === cap}
                              onClick={() => updateSetting(activeBarTool, 'lineCap', cap)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Line Join */}
                    {activeBarTool !== 'eraser' && (
                      <div>
                        <span className="text-xs text-gray-400 mb-1.5 block">Line Join</span>
                        <div className="flex gap-1">
                          {(['round', 'miter', 'bevel'] as const).map(join => (
                            <JoinButton
                              key={join}
                              join={join}
                              active={current.lineJoin === join}
                              onClick={() => updateSetting(activeBarTool, 'lineJoin', join)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pressure Sensitivity */}
                    {activeBarTool !== 'eraser' && activeBarTool !== 'line' && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Pressure Sensitive</span>
                        <button
                          onClick={() => updateSetting(activeBarTool, 'pressureSensitive', !current.pressureSensitive)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            current.pressureSensitive ? 'bg-yellow-400' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              current.pressureSensitive ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Presets */}
                {showPresets && (
                  <div className="pt-2 border-t" style={{ borderColor: 'rgba(55,65,81,0.4)' }}>
                    <span className="text-xs text-gray-400 mb-2 block">Presets</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => applyPreset(preset)}
                          className="px-2 py-1 rounded text-xs font-medium transition-colors bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* All tools size reference */}
                {!activeBarTool && (
                  <div className="space-y-2">
                    {(['pen', 'marker', 'line', 'eraser'] as BarTool[]).map(tool => (
                      <div key={tool} className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 capitalize">{tool}</span>
                        <span className="text-xs text-yellow-400 font-mono">{settings[tool].strokeWidth}px</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ColorSwatchProps {
  color: string;
  onChange: (color: string) => void;
  isActive: boolean;
  label: string;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({ color, onChange, isActive, label }) => (
  <div className="relative w-5 h-5 flex-shrink-0" title={label}>
    <input
      type="color"
      value={color}
      onChange={(e) => onChange(e.target.value)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      aria-label={label}
    />
    <div
      className="w-5 h-5 rounded-full border-2 pointer-events-none transition-all duration-150"
      style={{
        backgroundColor: color,
        borderColor: isActive ? '#facc15' : 'rgba(107, 114, 128, 0.7)',
        boxShadow: isActive ? '0 0 0 1px rgba(250,204,21,0.3)' : 'none',
      }}
    />
  </div>
);

interface PanelSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}

const PanelSlider: React.FC<PanelSliderProps> = ({ label, value, min, max, unit = '', onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-yellow-400 font-mono">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full h-1.5 appearance-none bg-gray-700 rounded-lg cursor-pointer"
    />
  </div>
);

interface CapButtonProps {
  cap: 'round' | 'butt' | 'square';
  active: boolean;
  onClick: () => void;
}

const CapButton: React.FC<CapButtonProps> = ({ cap, active, onClick }) => {
  const label = cap.charAt(0).toUpperCase() + cap.slice(1);
  return (
    <button
      onClick={onClick}
      title={`${label} cap`}
      className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
        active
          ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-400'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 border border-transparent'
      }`}
    >
      <svg viewBox="0 0 28 12" className="w-full h-4 mx-auto">
        <line
          x1="4" y1="6" x2="24" y2="6"
          stroke={active ? '#facc15' : '#9ca3af'}
          strokeWidth="5"
          strokeLinecap={cap}
        />
      </svg>
      <span className="block text-center" style={{ fontSize: '10px' }}>{label}</span>
    </button>
  );
};

interface JoinButtonProps {
  join: 'round' | 'miter' | 'bevel';
  active: boolean;
  onClick: () => void;
}

const JoinButton: React.FC<JoinButtonProps> = ({ join, active, onClick }) => {
  const label = join.charAt(0).toUpperCase() + join.slice(1);
  return (
    <button
      onClick={onClick}
      title={`${label} join`}
      className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
        active
          ? 'bg-yellow-400/20 border border-yellow-400/50 text-yellow-400'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 border border-transparent'
      }`}
    >
      <svg viewBox="0 0 28 20" className="w-full h-4 mx-auto">
        <polyline
          points="4,16 14,4 24,16"
          fill="none"
          stroke={active ? '#facc15' : '#9ca3af'}
          strokeWidth="4"
          strokeLinejoin={join}
          strokeLinecap="round"
        />
      </svg>
      <span className="block text-center" style={{ fontSize: '10px' }}>{label}</span>
    </button>
  );
};

export default DrawingToolsBar;
