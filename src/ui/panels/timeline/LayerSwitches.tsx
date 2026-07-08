import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, Sparkles, Wind, Box, Link2 } from 'lucide-react';
import type { Layer } from '../../../core/types';
import { getEffectsEnabled, getMotionBlur, getIs3D, getParentCandidates } from '../../../core/layerSwitches';
import { useEditorStore } from '../../../store/editor';

interface LayerSwitchesProps {
  layer: Layer;
  allLayers: Layer[];
}

interface SwitchButtonProps {
  active: boolean;
  onToggle: () => void;
  title: string;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  activeColor?: string;
}

function SwitchButton({ active, onToggle, title, activeIcon, inactiveIcon, activeColor }: SwitchButtonProps) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`p-0.5 rounded hover:bg-[#1a2a42] transition-colors ${
        active ? activeColor ?? 'text-[#f7b500]' : 'text-slate-500'
      }`}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}

export function LayerSwitches({ layer, allLayers }: LayerSwitchesProps) {
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const setLayerParent = useEditorStore((s) => s.setLayerParent);

  const effectsOn = getEffectsEnabled(layer);
  const mbOn = getMotionBlur(layer);
  const is3D = getIs3D(layer);

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [pickerOpen]);

  const parent = layer.parentId ? allLayers.find((l) => l.id === layer.parentId) : null;
  const candidates = getParentCandidates(layer.id, allLayers);

  return (
    <div className="flex items-center gap-0.5 pr-1">
      {/* Eye - visibility */}
      <SwitchButton
        active={layer.visible}
        onToggle={() => updateLayerProperty(layer.id, 'visible', !layer.visible)}
        title="Visibility"
        activeIcon={<Eye size={10} className="text-slate-300" />}
        inactiveIcon={<EyeOff size={10} className="text-slate-600" />}
        activeColor="text-slate-300"
      />

      {/* Lock */}
      <SwitchButton
        active={layer.locked}
        onToggle={() => updateLayerProperty(layer.id, 'locked', !layer.locked)}
        title="Lock"
        activeIcon={<Lock size={10} />}
        inactiveIcon={<Unlock size={10} />}
        activeColor="text-yellow-500"
      />

      <div className="w-px h-3 bg-[#1a2a42] mx-0.5" />

      {/* FX - effects toggle */}
      <SwitchButton
        active={effectsOn}
        onToggle={() => updateLayerProperty(layer.id, 'effectsEnabled', !effectsOn)}
        title="Effects"
        activeIcon={<Sparkles size={10} />}
        inactiveIcon={<Sparkles size={10} />}
        activeColor="text-fuchsia-400"
      />

      {/* Motion Blur */}
      <SwitchButton
        active={mbOn}
        onToggle={() => updateLayerProperty(layer.id, 'motionBlur', !mbOn)}
        title="Motion Blur"
        activeIcon={<Wind size={10} />}
        inactiveIcon={<Wind size={10} />}
        activeColor="text-cyan-400"
      />

      {/* 3D Layer (visual only — not implemented yet) */}
      <SwitchButton
        active={is3D}
        onToggle={() => updateLayerProperty(layer.id, 'is3D', !is3D)}
        title="3D Layer"
        activeIcon={<Box size={10} />}
        inactiveIcon={<Box size={10} />}
        activeColor="text-emerald-400"
      />

      {/* Parent & Link */}
      <div className="relative" ref={pickerRef}>
        <button
          title={parent ? `Parent: ${parent.name}` : 'Parent & Link'}
          onClick={(e) => {
            e.stopPropagation();
            setPickerOpen((v) => !v);
          }}
          className={`flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-[#1a2a42] transition-colors ${
            parent ? 'text-amber-400' : 'text-slate-600'
          }`}
        >
          <Link2 size={10} />
          <span className="text-[8px] font-medium max-w-[44px] truncate">
            {parent ? parent.name : 'None'}
          </span>
        </button>

        {pickerOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-[140px] max-h-[220px] overflow-y-auto rounded-md bg-[#0e1c32] border border-[#243a5c] shadow-xl py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLayerParent(layer.id, null);
                setPickerOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-[10px] hover:bg-[#1a2a42] flex items-center gap-1.5 ${
                !layer.parentId ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <span className="w-1 h-1 rounded-full bg-current" />
              None
            </button>
            {candidates.length > 0 && <div className="my-1 mx-2 h-px bg-[#1a2a42]" />}
            {candidates.map((c) => (
              <button
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setLayerParent(layer.id, c.id);
                  setPickerOpen(false);
                }}
                className={`w-full text-left px-2 py-1 text-[10px] hover:bg-[#1a2a42] truncate ${
                  layer.parentId === c.id ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
