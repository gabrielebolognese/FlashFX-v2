import { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { useContextMenu } from './ContextMenuProvider';
import { getSettingValue } from '../../settings/store';
import type { MenuEntry, MenuSubmenuDef } from './types';

const MENU_MIN_WIDTH = 200;
function getSubmenuDelay(): number {
  return getSettingValue<number>('interaction.submenu.delay') ?? 150;
}

export function ContextMenuRenderer() {
  const { state, hide } = useContextMenu();
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!state) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[9999]"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) hide();
      }}
      onContextMenu={(e) => { e.preventDefault(); hide(); }}
    >
      <MenuPanel items={state.items} x={state.x} y={state.y} onClose={hide} level={0} />
    </div>
  );
}

function MenuPanel({
  items,
  x,
  y,
  onClose,
  level,
}: {
  items: MenuEntry[];
  x: number;
  y: number;
  onClose: () => void;
  level: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nx = x;
    let ny = y;

    if (nx + rect.width > vw - 8) nx = vw - rect.width - 8;
    if (nx < 8) nx = 8;
    if (ny + rect.height > vh - 8) ny = vh - rect.height - 8;
    if (ny < 8) ny = 8;

    setPos({ x: nx, y: ny });
    setReady(true);
  }, [x, y]);

  const flatItems = flattenGroups(items);

  return (
    <div
      ref={panelRef}
      className="absolute transition-opacity duration-75"
      style={{
        left: pos.x,
        top: pos.y,
        minWidth: MENU_MIN_WIDTH,
        opacity: ready ? 1 : 0,
      }}
    >
      <div className="bg-[#1a2233]/95 backdrop-blur-xl border border-[#2a3a52] rounded-lg shadow-[0_8px_40px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)] py-1 overflow-hidden">
        {flatItems.map((entry, i) => {
          if (entry.type === 'separator') {
            return <div key={`sep-${i}`} className="h-px bg-[#2a3a52]/70 my-1 mx-2" />;
          }
          if (entry.type === 'submenu') {
            return (
              <SubmenuItem
                key={entry.id}
                entry={entry}
                onClose={onClose}
                parentLevel={level}
              />
            );
          }
          if (entry.type === 'item') {
            const Icon = entry.icon;
            const disabled = entry.enabled === false;
            return (
              <button
                key={entry.id}
                disabled={disabled}
                onClick={() => {
                  if (entry.action) {
                    entry.action();
                    onClose();
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-[5px] text-left transition-colors duration-75 ${
                  disabled
                    ? 'text-slate-600 cursor-default'
                    : 'text-slate-200 hover:bg-[#f7b500]/10 hover:text-white active:bg-[#f7b500]/20'
                }`}
              >
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {Icon && <Icon size={13} className={disabled ? 'text-slate-600' : 'text-slate-400'} />}
                </span>
                <span className="flex-1 text-[11px] leading-none">{entry.label}</span>
                {entry.checked && (
                  <span className="text-[#f7b500] text-[10px]">&#10003;</span>
                )}
                {entry.shortcut && (
                  <span className={`text-[10px] ml-4 ${disabled ? 'text-slate-700' : 'text-slate-500'}`}>
                    {entry.shortcut}
                  </span>
                )}
              </button>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function SubmenuItem({
  entry,
  onClose,
  parentLevel,
}: {
  entry: MenuSubmenuDef;
  onClose: () => void;
  parentLevel: number;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const rowRef = useRef<HTMLDivElement>(null);
  const disabled = entry.enabled === false;
  const Icon = entry.icon;

  const handleEnter = useCallback(() => {
    if (disabled) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), getSubmenuDelay());
  }, [disabled]);

  const handleLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), getSubmenuDelay() + 50);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const getSubmenuPos = () => {
    if (!rowRef.current) return { x: 0, y: 0 };
    const rect = rowRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const spaceRight = vw - rect.right;
    const x = spaceRight > 220 ? rect.right - 4 : rect.left - MENU_MIN_WIDTH + 4;
    return { x, y: rect.top - 4 };
  };

  return (
    <div
      ref={rowRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="relative"
    >
      <div
        className={`w-full flex items-center gap-2.5 px-3 py-[5px] transition-colors duration-75 ${
          disabled
            ? 'text-slate-600 cursor-default'
            : open
              ? 'bg-[#f7b500]/10 text-white'
              : 'text-slate-200 hover:bg-[#f7b500]/10 hover:text-white'
        }`}
      >
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {Icon && <Icon size={13} className={disabled ? 'text-slate-600' : 'text-slate-400'} />}
        </span>
        <span className="flex-1 text-[11px] leading-none">{entry.label}</span>
        <ChevronRight size={11} className={disabled ? 'text-slate-700' : 'text-slate-500'} />
      </div>
      {open && !disabled && (
        <MenuPanel
          items={entry.items}
          x={getSubmenuPos().x}
          y={getSubmenuPos().y}
          onClose={onClose}
          level={parentLevel + 1}
        />
      )}
    </div>
  );
}

function flattenGroups(items: MenuEntry[]): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i];
    if (entry.type === 'group') {
      if (result.length > 0 && result[result.length - 1]?.type !== 'separator') {
        result.push({ type: 'separator' });
      }
      for (const sub of entry.items) {
        result.push(sub);
      }
      if (i < items.length - 1) {
        result.push({ type: 'separator' });
      }
    } else {
      result.push(entry);
    }
  }
  return result;
}
