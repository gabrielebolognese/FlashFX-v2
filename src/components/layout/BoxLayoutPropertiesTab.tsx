import React from 'react';
import { DesignElement } from '../../types/design';
import { computeLayout } from '../../layout/BoxLayoutEngine';

interface BoxLayoutPropertiesTabProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  allElements?: DesignElement[];
}

const BoxLayoutPropertiesTab: React.FC<BoxLayoutPropertiesTabProps> = ({
  selectedElements,
  updateElement,
  allElements = [],
}) => {
  if (selectedElements.length === 0) return null;
  const element = selectedElements[0];
  const isHBox = element.type === 'hbox';

  const padding = element.padding ?? 0;
  const spacing = element.margin ?? 0;
  const childCount = element.childIds?.length ?? 0;

  const handleUpdate = (updates: Partial<DesignElement>) => {
    selectedElements.forEach(el => updateElement(el.id, updates));
  };

  const numInput = (val: number, onChange: (v: number) => void, label: string) => (
    <div className="space-y-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input
        type="number"
        value={val}
        min={0}
        onChange={e => onChange(Math.max(0, Number(e.target.value)))}
        className="w-full bg-gray-800/60 border border-gray-600/50 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400/50 transition-colors"
      />
    </div>
  );

  const children = element.childIds
    ? element.childIds
        .map(id => allElements.find(e => e.id === id))
        .filter((e): e is DesignElement => e !== undefined)
    : [];

  const slots = childCount > 0 ? computeLayout(element, children.length > 0 ? children : element.childIds!.map(id => ({ id } as DesignElement))) : {};
  const sampleSlot = Object.values(slots)[0];

  const fill = element.fill && element.fill !== 'transparent' ? element.fill : '';
  const stroke = element.stroke && element.stroke !== 'transparent' ? element.stroke : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-4">

        <div className="flex items-center space-x-1.5 px-2 py-1 bg-yellow-400/10 border border-yellow-400/30 rounded text-xs text-yellow-400 font-medium w-fit">
          {isHBox ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <rect x="1" y="4" width="4" height="8" rx="1"/>
              <rect x="6" y="4" width="4" height="8" rx="1"/>
              <rect x="11" y="4" width="4" height="8" rx="1"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="1" width="10" height="4" rx="1"/>
              <rect x="3" y="6" width="10" height="4" rx="1"/>
              <rect x="3" y="11" width="10" height="4" rx="1"/>
            </svg>
          )}
          <span>{isHBox ? 'HBox' : 'VBox'} — {childCount} {childCount === 1 ? 'child' : 'children'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {numInput(padding, v => handleUpdate({ padding: v }), 'Padding')}
          {numInput(spacing, v => handleUpdate({ margin: v }), 'Spacing')}
        </div>

        {sampleSlot && (
          <div className="bg-gray-800/40 rounded-lg p-2.5 space-y-1 border border-gray-700/40">
            <p className="text-xs text-gray-400 font-medium">Computed child size</p>
            <div className="flex items-center gap-3 text-xs text-gray-300">
              <span>W: <span className="text-white font-mono">{Math.round(sampleSlot.width)}</span>px</span>
              <span>H: <span className="text-white font-mono">{Math.round(sampleSlot.height)}</span>px</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-300">Appearance</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Fill</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={fill || '#000000'}
                  onChange={e => handleUpdate({ fill: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <input
                  type="text"
                  value={fill}
                  placeholder="none"
                  onChange={e => handleUpdate({ fill: e.target.value || 'transparent' })}
                  className="flex-1 bg-gray-800/60 border border-gray-600/50 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400/50 min-w-0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Stroke</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={stroke || '#000000'}
                  onChange={e => handleUpdate({ stroke: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <input
                  type="number"
                  value={element.strokeWidth ?? 0}
                  min={0}
                  onChange={e => handleUpdate({ strokeWidth: Math.max(0, Number(e.target.value)) })}
                  className="flex-1 bg-gray-800/60 border border-gray-600/50 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-400/50 min-w-0"
                  placeholder="px"
                />
              </div>
            </div>
          </div>
        </div>

        {childCount > 0 ? (
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-300">Children ({childCount})</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(element.childIds ?? []).map((childId, i) => {
                const child = allElements.find(e => e.id === childId);
                const slot = slots[childId];
                return (
                  <div key={childId} className="flex items-center justify-between bg-gray-800/40 rounded px-2 py-1 text-xs border border-gray-700/30">
                    <span className="text-gray-300 truncate max-w-[100px]">
                      {child?.name ?? `Child ${i + 1}`}
                    </span>
                    {slot && (
                      <span className="text-gray-500 font-mono ml-2 shrink-0">
                        {Math.round(slot.width)}×{Math.round(slot.height)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-gray-800/30 rounded-lg p-3 text-center border border-dashed border-gray-600/40">
            <p className="text-xs text-gray-500">
              Drag elements onto this container to add children.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default BoxLayoutPropertiesTab;
