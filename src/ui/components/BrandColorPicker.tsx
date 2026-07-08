import { useState, useEffect, useRef, useCallback } from 'react';
import { Palette } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BrandColor {
  id: string;
  hex: string;
  sort_order: number;
}

let _cachedColors: BrandColor[] | null = null;
let _fetchPromise: Promise<BrandColor[]> | null = null;
let _lastFetch = 0;
const CACHE_TTL = 10_000;

function fetchBrandColors(): Promise<BrandColor[]> {
  const now = Date.now();
  if (_cachedColors && now - _lastFetch < CACHE_TTL) return Promise.resolve(_cachedColors);
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    if (!supabase) return [];
    const { data } = await supabase
      .from('brand_colors')
      .select('*')
      .order('sort_order', { ascending: true });
    _cachedColors = data || [];
    _lastFetch = Date.now();
    _fetchPromise = null;
    return _cachedColors;
  })();

  return _fetchPromise;
}

export function invalidateBrandColorCache() {
  _cachedColors = null;
  _lastFetch = 0;
}

interface BrandColorPickerProps {
  onSelect: (rgba: [number, number, number, number]) => void;
  currentAlpha: number;
}

export function BrandColorPicker({ onSelect, currentAlpha }: BrandColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState<BrandColor[]>(_cachedColors || []);
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    setLoading(!_cachedColors || Date.now() - _lastFetch >= CACHE_TTL);
    fetchBrandColors().then((c) => {
      setColors(c);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    onSelect([r, g, b, currentAlpha]);
    setOpen(false);
  }, [onSelect, currentAlpha]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
          open
            ? 'bg-[#f7b500]/10 border-[#f7b500]/40 text-[#ffc83d]'
            : 'border-[#1c2433] text-slate-500 hover:text-slate-300 hover:border-[#2a3a5c] hover:bg-[#16294a]'
        }`}
        title="Brand colors"
      >
        <Palette size={10} />
      </button>

      {open && (
        <div
          ref={popupRef}
          className="absolute z-[100] top-full right-0 mt-1 w-[160px] bg-[#0d1b30] border border-[#1c3155] rounded-lg shadow-xl shadow-black/50 overflow-hidden"
        >
          <div className="px-2.5 py-1.5 border-b border-[#1c3155]">
            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Brand Colors</span>
          </div>

          {loading && (
            <div className="px-3 py-4 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-slate-600 border-t-[#f7b500] rounded-full animate-spin" />
            </div>
          )}

          {!loading && colors.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                No brand colors added yet.
              </p>
              <p className="text-[9px] text-slate-600 mt-1">
                Add colors in the Brands tab.
              </p>
            </div>
          )}

          {!loading && colors.length > 0 && (
            <div className="p-2 grid grid-cols-5 gap-1.5">
              {colors.map((color) => (
                <button
                  key={color.id}
                  onClick={() => handleSelect(color.hex)}
                  className="w-6 h-6 rounded-md border border-[#1c3155] hover:border-[#f7b500]/50 hover:scale-110 transition-all shadow-sm"
                  style={{ backgroundColor: color.hex }}
                  title={color.hex}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
