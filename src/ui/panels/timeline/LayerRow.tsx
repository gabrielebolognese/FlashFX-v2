import { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, Type, Film, Image, GripVertical, Sparkles } from 'lucide-react';
import type { Layer, GroupLayer, ShapeLayer } from '../../../core/types';
import { useEditorStore } from '../../../store/editor';
import { getDepth } from '../../../core/sceneGraph';
import { LayerSwitches } from './LayerSwitches';

interface LayerRowProps {
  layer: Layer;
  index: number;
  isSelected: boolean;
  allLayers: Layer[];
  isDragging: boolean;
  isDragSource: boolean;
  dropIndicator: 'above' | 'below' | null;
  onDragStart: (layerId: string, e: React.PointerEvent) => void;
}

export function LayerRow({
  layer, index, isSelected, allLayers,
  isDragging, isDragSource, dropIndicator, onDragStart,
}: LayerRowProps) {
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const toggleGroupCollapsed = useEditorStore((s) => s.toggleGroupCollapsed);
  const hoveredLayerId = useEditorStore((s) => s.hoveredLayerId);
  const setHoveredLayer = useEditorStore((s) => s.setHoveredLayer);
  const renamingLayerId = useEditorStore((s) => s.renamingLayerId);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const finishRenameLayer = useEditorStore((s) => s.finishRenameLayer);

  const isRenaming = renamingLayerId === layer.id;
  const [renameValue, setRenameValue] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(layer.name);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [isRenaming, layer.name]);

  const depth = getDepth(layer.id, allLayers);
  const isGroup = layer.type === 'group';
  const isCollapsed = isGroup && (layer as GroupLayer).collapsed;
  const isHovered = hoveredLayerId === layer.id;

  return (
    <div
      className="relative"
      data-layer-id={layer.id}
      data-layer-index={index}
    >
      {/* Drop indicator above */}
      {dropIndicator === 'above' && (
        <div className="absolute top-0 left-0 right-0 z-20 h-[2px] bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]" />
      )}

      <div
        onClick={(e) => {
          if (isDragging) return;
          const additive = e.shiftKey || e.ctrlKey || e.metaKey;
          selectLayer(layer.id, additive, 'timeline');
        }}
        onPointerEnter={() => { if (!isDragging) setHoveredLayer(layer.id); }}
        onPointerLeave={() => { if (!isDragging) setHoveredLayer(null); }}
        className={`h-[19px] flex items-center gap-0 border-b border-[#1a2a42] select-none group transition-opacity duration-100 ${
          isDragSource
            ? 'opacity-40 bg-[#0e1c32]'
            : isSelected
              ? 'bg-[#1a2438]'
              : isHovered
                ? 'bg-[#141a24]'
                : 'bg-[#0e1c32] hover:bg-[#122240]'
        }`}
        style={{ paddingLeft: depth * 12, cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {/* Drag handle */}
        <div
          className="w-4 flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart(layer.id, e);
          }}
        >
          <GripVertical size={9} className="text-slate-400" />
        </div>

        {/* Disclosure triangle */}
        <div
          className="w-4 flex items-center justify-center flex-shrink-0"
          onClick={(e) => {
            if (isGroup) {
              e.stopPropagation();
              toggleGroupCollapsed(layer.id);
            }
          }}
        >
          {isGroup ? (
            isCollapsed ? (
              <ChevronRight size={10} className="text-slate-400" />
            ) : (
              <ChevronDown size={10} className="text-slate-400" />
            )
          ) : (
            <span className="w-[10px]" />
          )}
        </div>

        {/* Icon */}
        <div className="w-4 flex items-center justify-center flex-shrink-0 mr-0.5">
          {isGroup ? (
            <Folder size={10} className="text-slate-500" />
          ) : layer.type === 'text' ? (
            <Type size={10} className="text-slate-400" />
          ) : layer.type === 'video' ? (
            <Film size={10} className="text-cyan-400" />
          ) : layer.type === 'image' ? (
            <Image size={10} className="text-emerald-400" />
          ) : layer.type === 'lottieIcon' ? (
            <Sparkles size={10} className="text-violet-400" />
          ) : (
            <div
              className="w-[8px] h-[8px] rounded-sm flex-shrink-0"
              style={{
                backgroundColor: layer.type === 'shape' ? `rgb(${Math.round((layer as ShapeLayer).shape.fillColor[0] * 255)}, ${Math.round((layer as ShapeLayer).shape.fillColor[1] * 255)}, ${Math.round((layer as ShapeLayer).shape.fillColor[2] * 255)})` : '#888',
              }}
            />
          )}
        </div>

        {/* Layer name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="flex-1 min-w-0 text-[10px] bg-[#1a2a42] text-slate-100 px-1 py-0 rounded border border-blue-500/60 outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { renameLayer(layer.id, renameValue.trim() || layer.name); }
              if (e.key === 'Escape') { finishRenameLayer(); }
              e.stopPropagation();
            }}
            onBlur={() => renameLayer(layer.id, renameValue.trim() || layer.name)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-[10px] truncate pr-2"
            style={{ color: isSelected ? '#e2e8f0' : '#a0aec0' }}
            onPointerDown={(e) => { onDragStart(layer.id, e); }}
          >
            {layer.name}
          </span>
        )}

        {/* Switches */}
        <LayerSwitches layer={layer} allLayers={allLayers} />
      </div>

      {/* Drop indicator below */}
      {dropIndicator === 'below' && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-[2px] bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]" />
      )}
    </div>
  );
}
