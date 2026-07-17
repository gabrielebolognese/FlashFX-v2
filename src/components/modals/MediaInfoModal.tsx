import React from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Calendar, HardDrive, Maximize } from 'lucide-react';
import { MediaAsset } from '../../services/MediaPoolService';

interface MediaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: MediaAsset | null;
}

const MediaInfoModal: React.FC<MediaInfoModalProps> = ({ isOpen, onClose, asset }) => {
  if (!isOpen || !asset) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const infoItems = [
    {
      icon: Maximize,
      label: 'Resolution',
      value: `${asset.width} × ${asset.height}px`
    },
    {
      icon: ImageIcon,
      label: 'Type',
      value: asset.mimeType
    },
    {
      icon: HardDrive,
      label: 'File Size',
      value: formatFileSize(asset.size)
    },
    {
      icon: Calendar,
      label: 'Uploaded',
      value: formatDate(asset.uploadedAt)
    }
  ];

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10003] p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 max-w-lg w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Media Information</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
              <img
                src={asset.data}
                alt={asset.name}
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-1">Name</h3>
            <p className="text-white">{asset.name}</p>
          </div>

          <div className="space-y-3">
            {infoItems.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                <div className="flex items-center space-x-2 text-gray-400">
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </div>
                <span className="text-sm text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MediaInfoModal;
