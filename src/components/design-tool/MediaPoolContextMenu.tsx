import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PlusCircle,
  Clock,
  Replace,
  Edit3,
  Copy,
  Trash2,
  MousePointer,
  CheckSquare,
  Square,
  Info,
  FileText,
  ChevronRight
} from 'lucide-react';
import { MediaAsset } from '../../services/MediaPoolService';

interface MediaPoolContextMenuProps {
  x: number;
  y: number;
  asset: MediaAsset | null;
  selectedAssets: string[];
  allAssets: MediaAsset[];
  onClose: () => void;
  onAddToCanvas: (asset: MediaAsset) => void;
  onRename: (asset: MediaAsset) => void;
  onDuplicate: (asset: MediaAsset) => void;
  onDelete: (assetIds: string[]) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectUsedMedia: () => void;
  onSelectUnusedMedia: () => void;
  onShowInfo: (asset: MediaAsset) => void;
  onEditMetadata: (asset: MediaAsset) => void;
  isAssetUsed: (assetId: string) => boolean;
}

const MediaPoolContextMenu: React.FC<MediaPoolContextMenuProps> = ({
  x,
  y,
  asset,
  selectedAssets,
  allAssets,
  onClose,
  onAddToCanvas,
  onRename,
  onDuplicate,
  onDelete,
  onSelectAll,
  onDeselectAll,
  onSelectUsedMedia,
  onSelectUnusedMedia,
  onShowInfo,
  onEditMetadata,
  isAssetUsed
}) => {
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const multiSelection = selectedAssets.length > 1;
  const hasSelection = selectedAssets.length > 0;

  const menuSections = [
    {
      title: 'INSERT / USE',
      items: asset ? [
        {
          icon: PlusCircle,
          label: 'Add to Canvas',
          action: () => onAddToCanvas(asset),
          disabled: false
        },
        {
          icon: Clock,
          label: 'Add to Timeline',
          action: () => {},
          disabled: true
        },
        {
          icon: Replace,
          label: 'Replace Selected Clip',
          action: () => {},
          disabled: true
        }
      ] : []
    },
    {
      title: 'EDIT',
      items: asset && !multiSelection ? [
        {
          icon: Edit3,
          label: 'Rename',
          action: () => onRename(asset)
        },
        {
          icon: Copy,
          label: 'Duplicate',
          action: () => onDuplicate(asset)
        },
        {
          icon: Trash2,
          label: 'Delete from Project',
          action: () => onDelete([asset.id]),
          danger: true,
          warning: isAssetUsed(asset.id)
        }
      ] : multiSelection && hasSelection ? [
        {
          icon: Trash2,
          label: `Delete ${selectedAssets.length} Items`,
          action: () => onDelete(selectedAssets),
          danger: true,
          warning: selectedAssets.some(id => isAssetUsed(id))
        }
      ] : []
    },
    {
      title: 'SELECTION',
      items: [
        {
          icon: CheckSquare,
          label: 'Select All',
          action: onSelectAll
        },
        {
          icon: Square,
          label: 'Deselect All',
          action: onDeselectAll,
          disabled: !hasSelection
        },
        {
          icon: MousePointer,
          label: 'Select Used Media',
          action: onSelectUsedMedia
        },
        {
          icon: MousePointer,
          label: 'Select Unused Media',
          action: onSelectUnusedMedia
        }
      ]
    },
    {
      title: 'INFO / METADATA',
      items: asset && !multiSelection ? [
        {
          icon: Info,
          label: 'Show Info',
          action: () => onShowInfo(asset)
        },
        {
          icon: FileText,
          label: 'Edit Metadata',
          action: () => onEditMetadata(asset)
        }
      ] : []
    }
  ];

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[10002] bg-gray-800 rounded-lg border border-gray-700 shadow-xl min-w-[220px] py-2 max-h-[90vh] overflow-y-auto"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      {menuSections.map((section, sectionIndex) => {
        if (section.items.length === 0) return null;

        return (
          <div key={sectionIndex}>
            {sectionIndex > 0 && (
              <div className="my-2 mx-2 border-t border-gray-700" />
            )}
            <div className="px-3 py-1">
              <span className="text-xs font-semibold text-gray-500">{section.title}</span>
            </div>
            {section.items.map((item, itemIndex) => (
              <div key={itemIndex} className="relative">
                <button
                  onClick={() => {
                    if (!item.disabled) {
                      handleAction(item.action);
                    }
                  }}
                  disabled={item.disabled}
                  className={`w-full px-4 py-2 text-left flex items-center justify-between hover:bg-gray-700 transition-colors ${
                    item.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300 hover:text-white'
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm">{item.label}</span>
                  </div>
                  {item.warning && (
                    <span className="text-xs text-yellow-400">In Use</span>
                  )}
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default MediaPoolContextMenu;
