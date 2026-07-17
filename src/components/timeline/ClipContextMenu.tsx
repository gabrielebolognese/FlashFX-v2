import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Scissors, Copy, Clock, Layers, Link as LinkIcon, Unlink,
  Lock, Unlock, Edit3, Square, Trash2, Target
} from 'lucide-react';

interface ClipContextMenuProps {
  x: number;
  y: number;
  clipId: string;
  clipName: string;
  isLocked: boolean;
  isDisabled: boolean;
  hasKeyframes: boolean;
  onClose: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onSpeedDuration: () => void;
  onSelectAllKeyframes: () => void;
  onDeleteAllKeyframes: () => void;
  onToggleLock: () => void;
  onRename: () => void;
  onConvertToStatic: () => void;
  onToggleDisable: () => void;
  onDelete: () => void;
}

const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  x,
  y,
  clipId,
  clipName,
  isLocked,
  isDisabled,
  hasKeyframes,
  onClose,
  onCut,
  onDuplicate,
  onSpeedDuration,
  onSelectAllKeyframes,
  onDeleteAllKeyframes,
  onToggleLock,
  onRename,
  onConvertToStatic,
  onToggleDisable,
  onDelete,
}) => {
  const [position, setPosition] = useState({ x, y });
  const [menuHeight, setMenuHeight] = useState(0);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuRef.current) {
      const height = menuRef.current.offsetHeight;
      setMenuHeight(height);

      // Position menu so its bottom edge is at the cursor Y position
      // This makes it open upward from the cursor point
      const adjustedY = y - height;
      setPosition({ x, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  interface MenuItem {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    separator?: boolean;
  }

  interface MenuSection {
    items: MenuItem[];
  }

  const menuSections: MenuSection[] = [
    {
      items: [
        {
          label: 'Cut',
          icon: <Scissors className="w-4 h-4" />,
          onClick: () => handleAction(onCut),
          disabled: isLocked,
        },
        {
          label: 'Duplicate',
          icon: <Copy className="w-4 h-4" />,
          onClick: () => handleAction(onDuplicate),
        },
      ],
    },
    {
      items: [
        {
          label: 'Speed / Duration',
          icon: <Clock className="w-4 h-4" />,
          onClick: () => handleAction(onSpeedDuration),
          disabled: isLocked,
        },
      ],
    },
    {
      items: [
        {
          label: 'Select All Keyframes',
          icon: <Target className="w-4 h-4" />,
          onClick: () => handleAction(onSelectAllKeyframes),
          disabled: !hasKeyframes,
        },
        {
          label: 'Delete All Keyframes',
          icon: <Trash2 className="w-4 h-4" />,
          onClick: () => handleAction(onDeleteAllKeyframes),
          disabled: !hasKeyframes || isLocked,
          danger: true,
        },
      ],
    },
    {
      items: [
        {
          label: isLocked ? 'Unlock' : 'Lock',
          icon: isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />,
          onClick: () => handleAction(onToggleLock),
        },
        {
          label: isDisabled ? 'Enable Clip' : 'Disable Clip',
          icon: <Square className="w-4 h-4" />,
          onClick: () => handleAction(onToggleDisable),
        },
      ],
    },
    {
      items: [
        {
          label: 'Rename Clip',
          icon: <Edit3 className="w-4 h-4" />,
          onClick: () => handleAction(onRename),
        },
        {
          label: 'Convert to Static',
          icon: <Layers className="w-4 h-4" />,
          onClick: () => handleAction(onConvertToStatic),
          disabled: !hasKeyframes || isLocked,
        },
      ],
    },
    {
      items: [
        {
          label: 'Delete',
          icon: <Trash2 className="w-4 h-4" />,
          onClick: () => handleAction(onDelete),
          disabled: isLocked,
          danger: true,
        },
      ],
    },
  ];

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[10002] bg-gray-800 rounded-lg border border-gray-700 shadow-xl min-w-[220px] py-2"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="px-3 py-2 border-b border-gray-700">
        <h4 className="text-xs font-semibold text-gray-300 truncate">
          {clipName}
        </h4>
      </div>

      {menuSections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {sectionIndex > 0 && section.items.length > 0 && (
            <div className="my-2 mx-2 border-t border-gray-700" />
          )}
          {section.items.map((item, itemIndex) => (
            <button
              key={itemIndex}
              onClick={item.onClick}
              disabled={item.disabled}
              className={`w-full px-3 py-2 flex items-center gap-3 transition-colors text-left ${
                item.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className={item.disabled ? 'text-gray-600' : item.danger ? 'text-red-400' : 'text-gray-400'}>
                {item.icon}
              </span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default ClipContextMenu;
