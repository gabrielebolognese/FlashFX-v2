import React from 'react';
import { Copy, Trash2, Download, CreditCard as Edit, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string | null;
  onClose: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  elementId,
  onClose,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onBringToFront,
  onSendToBack
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const menuItems = elementId ? [
    {
      icon: Edit,
      label: 'Edit',
      action: () => {
        // Element is already selected, properties panel will show
      }
    },
    {
      icon: Copy,
      label: 'Duplicate',
      action: () => onDuplicate(elementId)
    },
    {
      type: 'separator'
    },
    {
      icon: ChevronsUp,
      label: 'Bring to Front',
      action: () => onBringToFront(elementId)
    },
    {
      icon: ArrowUp,
      label: 'Move Forward',
      action: () => onMoveUp(elementId)
    },
    {
      icon: ArrowDown,
      label: 'Move Backward',
      action: () => onMoveDown(elementId)
    },
    {
      icon: ChevronsDown,
      label: 'Send to Back',
      action: () => onSendToBack(elementId)
    },
    {
      type: 'separator'
    },
    {
      icon: Download,
      label: 'Export as PNG',
      action: () => {
        // This would trigger the export functionality
      }
    },
    {
      icon: Trash2,
      label: 'Delete',
      action: () => onDelete(elementId),
      danger: true
    }
  ] : [
    {
      icon: Edit,
      label: 'Paste',
      action: () => {
        // Paste functionality
      },
      disabled: true
    }
  ];

  return (
    <div
      className="fixed z-[9999] bg-gray-800 rounded-lg border border-gray-700 shadow-xl min-w-[180px] py-2"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      {menuItems.map((item, index) => {
        if (item.type === 'separator') {
          return (
            <div
              key={index}
              className="my-2 mx-2 border-t border-gray-700"
            />
          );
        }

        return (
          <button
            key={index}
            onClick={() => handleAction(item.action)}
            disabled={item.disabled}
            className={`w-full px-4 py-2 text-left flex items-center space-x-3 hover:bg-gray-700 transition-colors ${
              item.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'
            } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <item.icon className="w-4 h-4" />
            <span className="text-sm">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;