import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2 } from 'lucide-react';
import type { IconData } from './types';
import { useIconSearch } from './useIconSearch';
import { VirtualGrid } from './VirtualGrid';
import { SvgIcon } from './SvgIcon';

const COLOR_PRESETS = [
  '#FFFFFF',
  '#0EA5E9',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#0F172A',
];

const CELL_SIZE = 72;
const CELL_GAP = 6;

interface IconLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (icon: IconData, color: string) => void;
}

export function IconLibraryModal({ isOpen, onClose, onInsert }: IconLibraryModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<IconData | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(COLOR_PRESETS[0]);

  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, error } = useIconSearch(query);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIcon) {
          setSelectedIcon(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, selectedIcon, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedIcon(null);
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = useCallback((icon: IconData) => {
    setSelectedIcon(icon);
  }, []);

  const handleInsert = () => {
    if (!selectedIcon) return;
    onInsert(selectedIcon, selectedColor);
    onClose();
  };

  const renderItem = useCallback(
    (icon: IconData) => (
      <IconCell
        icon={icon}
        selected={selectedIcon?.id === icon.id}
        color={selectedColor}
        onSelect={handleSelect}
      />
    ),
    [selectedIcon?.id, selectedColor, handleSelect]
  );

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="w-[920px] h-[600px] max-w-[95vw] max-h-[90vh] bg-[#0c1018] border border-[#1a2a42] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2a42]">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Icon Library</h2>
            <p className="text-[10px] text-slate-500">Browse 1,700+ icons. Click to preview, then insert.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#122240] text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-[#1a2a42]">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons..."
              className="w-full bg-[#122240] text-[12px] text-slate-200 pl-8 pr-3 py-1.5 rounded border border-[#1a2a42] focus:border-[#f7b500]/50 outline-none placeholder:text-slate-600"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Grid */}
          <div className="flex-1 relative bg-[#081220] border-r border-[#1a2a42]">
            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-red-400 px-4 text-center">
                Failed to load icons: {error}
              </div>
            )}
            {!error && loading && results.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
            {!loading && !error && results.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500">
                No icons match "{query}"
              </div>
            )}
            {results.length > 0 && (
              <VirtualGrid
                items={results}
                itemSize={CELL_SIZE}
                gap={CELL_GAP}
                renderItem={renderItem}
                className="absolute inset-0 p-3"
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="w-[208px] flex-shrink-0 flex flex-col">
            {selectedIcon ? (
              <>
                <div className="flex-1 flex flex-col items-center justify-center p-4 border-b border-[#1a2a42]">
                  <div
                    className="w-32 h-32 rounded border border-[#1a2a42] bg-[#081220] flex items-center justify-center mb-3"
                  >
                    <SvgIcon icon={selectedIcon} size={88} color={selectedColor} />
                  </div>
                  <div className="text-[12px] text-slate-200 font-medium text-center truncate w-full" title={selectedIcon.name}>
                    {selectedIcon.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate w-full text-center">
                    {selectedIcon.id}
                  </div>
                </div>

                <div className="px-3 py-3 space-y-2 border-b border-[#1a2a42]">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Color</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          selectedColor === c
                            ? 'border-[#f7b500] scale-110'
                            : 'border-[#1a2a42] hover:border-slate-500'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value.toUpperCase())}
                      className="w-7 h-7 bg-transparent border-0 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={selectedColor}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setSelectedColor(v);
                      }}
                      className="flex-1 bg-[#122240] text-[10px] font-mono text-slate-300 px-1.5 py-1 rounded border border-[#1a2a42] outline-none"
                    />
                  </div>
                </div>

                <div className="px-3 py-3">
                  <button
                    onClick={handleInsert}
                    className="w-full py-2 rounded bg-[#f7b500] hover:bg-[#f7b500] text-white text-[12px] font-medium transition-colors"
                  >
                    Insert Icon
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-[11px] text-slate-500 p-6">
                Select an icon to preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface IconCellProps {
  icon: IconData;
  selected: boolean;
  color: string;
  onSelect: (icon: IconData) => void;
}

const IconCell = ({ icon, selected, color, onSelect }: IconCellProps) => {
  return (
    <button
      onClick={() => onSelect(icon)}
      className={`w-full h-full rounded border flex items-center justify-center transition-colors ${
        selected
          ? 'bg-[#f7b500]/10 border-[#f7b500]/50 text-slate-200'
          : 'bg-transparent border-transparent hover:bg-[#122240] hover:border-[#1a2a42] text-slate-300'
      }`}
      title={icon.name}
    >
      <SvgIcon icon={icon} size={28} color={selected ? color : 'currentColor'} />
    </button>
  );
};
