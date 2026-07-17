import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, HardDrive, Search, X, Music, Film } from 'lucide-react';
import { mediaPoolService, MediaAsset } from '../../services/MediaPoolService';
import { DesignElement } from '../../types/design';
import { getDefaultImageFilters } from '../../utils/imageFilters';
import MediaPoolContextMenu from './MediaPoolContextMenu';
import MediaInfoModal from '../modals/MediaInfoModal';
import MediaMetadataModal from '../modals/MediaMetadataModal';
import RenameMediaModal from '../modals/RenameMediaModal';
import DeleteMediaModal from '../modals/DeleteMediaModal';
import AudioMediaTab from './AudioMediaTab';
import VideoMediaTab from './VideoMediaTab';

type MediaSubTab = 'image' | 'audio' | 'video';

type PreviewQuality = 'full' | 'half' | 'quarter';

interface MediaPoolTabProps {
  onAddElement: (element: DesignElement) => void;
  elements?: DesignElement[];
  onSetActiveTool?: (tool: string) => void;
  onSetPendingImageElement?: (element: DesignElement) => void;
  onSetPendingVideoAsset?: (asset: import('../../video/types').VideoAsset) => void;
}

const MediaPoolTab: React.FC<MediaPoolTabProps> = ({ onAddElement, elements = [], onSetActiveTool, onSetPendingImageElement, onSetPendingVideoAsset }) => {
  const [activeMediaTab, setActiveMediaTab] = useState<MediaSubTab>('image');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [storageInfo, setStorageInfo] = useState({ count: 0, totalSize: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: MediaAsset | null } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<MediaAsset | null>(null);
  const [deleteAssetIds, setDeleteAssetIds] = useState<string[]>([]);
  const [previewQuality, setPreviewQuality] = useState<PreviewQuality>('full');
  const [halfTick, setHalfTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const halfCacheRef = useRef<Map<string, string>>(new Map());

  const loadAssets = async () => {
    try {
      const loadedAssets = await mediaPoolService.getAllAssets();
      setAssets(loadedAssets);
      const usage = await mediaPoolService.getStorageUsage();
      setStorageInfo(usage);
    } catch (error) {
      console.error('Failed to load media assets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const generateHalfPreview = useCallback((asset: MediaAsset) => {
    if (halfCacheRef.current.has(asset.id)) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = Math.max(1, Math.round(img.width  / 2));
      canvas.height = Math.max(1, Math.round(img.height / 2));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      halfCacheRef.current.set(asset.id, canvas.toDataURL('image/jpeg', 0.78));
      setHalfTick(n => n + 1);
    };
    img.src = asset.data;
  }, []);

  useEffect(() => {
    if (previewQuality === 'half') {
      assets.forEach(a => generateHalfPreview(a));
    }
  }, [previewQuality, assets, generateHalfPreview]);

  const getPreviewSrc = (asset: MediaAsset): string => {
    if (previewQuality === 'full') return asset.data;
    if (previewQuality === 'half') return halfCacheRef.current.get(asset.id) ?? asset.data;
    return asset.thumbnail || asset.data;
  };

  void halfTick;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const asset = await mediaPoolService.createAssetFromFile(file);
        await mediaPoolService.addAsset(asset);
      }
      await loadAssets();
    } catch (error) {
      console.error('Failed to upload files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const triggerDeleteModal = (ids: string[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleteAssetIds(ids);
    setShowDeleteModal(true);
  };

  const handleAssetClick = (asset: MediaAsset) => {
    const maxImageSize = 1200;
    let width = asset.width;
    let height = asset.height;
    const aspectRatio = width / height;

    if (width > maxImageSize || height > maxImageSize) {
      if (width > height) {
        width = maxImageSize;
        height = width / aspectRatio;
      } else {
        height = maxImageSize;
        width = height * aspectRatio;
      }
    }

    const element: DesignElement = {
      id: `${Date.now()}`,
      type: 'image',
      name: asset.name,
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      fill: 'transparent',
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
      shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
      imageData: asset.data,
      originalWidth: asset.width,
      originalHeight: asset.height,
      aspectRatioLocked: true,
      blendMode: 'normal',
      filters: getDefaultImageFilters()
    };

    if (onSetActiveTool && onSetPendingImageElement) {
      onSetPendingImageElement(element);
      onSetActiveTool('image-placement');
    } else {
      const centeredX = 1920 / 2 - width / 2;
      const centeredY = 1080 / 2 - height / 2;
      onAddElement({ ...element, x: centeredX, y: centeredY });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isAssetUsed = (assetId: string): boolean =>
    elements.some(el => {
      if (el.type === 'image') {
        const asset = assets.find(a => a.id === assetId);
        return !!(asset && el.imageData === asset.data);
      }
      return false;
    });

  const handleContextMenu = (e: React.MouseEvent, asset: MediaAsset | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (asset && !selectedAssets.includes(asset.id)) setSelectedAssets([asset.id]);
    setContextMenu({ x: e.clientX, y: e.clientY, asset });
  };

  const handleAssetSelection = (assetId: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedAssets(prev =>
        prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
      );
    } else if (e.shiftKey && selectedAssets.length > 0) {
      const allIds = filteredAssets.map(a => a.id);
      const lastIndex = allIds.indexOf(selectedAssets[selectedAssets.length - 1]);
      const currentIndex = allIds.indexOf(assetId);
      const start = Math.min(lastIndex, currentIndex);
      const end   = Math.max(lastIndex, currentIndex);
      setSelectedAssets(allIds.slice(start, end + 1));
    } else {
      setSelectedAssets([assetId]);
    }
  };

  const handleRenameAsset = async (asset: MediaAsset, newName: string) => {
    try {
      await mediaPoolService.updateAsset(asset.id, { name: newName });
      await loadAssets();
    } catch (error) {
      console.error('Failed to rename asset:', error);
    }
  };

  const handleDuplicateAsset = async (asset: MediaAsset) => {
    try {
      await mediaPoolService.duplicateAsset(asset.id);
      await loadAssets();
    } catch (error) {
      console.error('Failed to duplicate asset:', error);
    }
  };

  const handleDeleteAssets = async (assetIds: string[]) => {
    try {
      for (const id of assetIds) {
        await mediaPoolService.deleteAsset(id);
        halfCacheRef.current.delete(id);
      }
      await loadAssets();
      setSelectedAssets([]);
    } catch (error) {
      console.error('Failed to delete assets:', error);
    }
  };

  const handleSelectAll        = () => setSelectedAssets(filteredAssets.map(a => a.id));
  const handleDeselectAll      = () => setSelectedAssets([]);
  const handleSelectUsedMedia  = () => setSelectedAssets(assets.filter(a => isAssetUsed(a.id)).map(a => a.id));
  const handleSelectUnusedMedia = () => setSelectedAssets(assets.filter(a => !isAssetUsed(a.id)).map(a => a.id));

  const handleUpdateMetadata = async (asset: MediaAsset, updates: Partial<MediaAsset>) => {
    try {
      await mediaPoolService.updateAsset(asset.id, updates);
      await loadAssets();
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
  };

  const filteredAssets = assets.filter(asset =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const qualityLabel: Record<PreviewQuality, string> = { full: 'Full', half: 'Half', quarter: 'Quarter' };

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab bar */}
      <div className="px-2 pt-2 pb-1.5 border-b border-gray-700/50 shrink-0">
        <div className="grid grid-cols-3 gap-0.5 bg-gray-700/30 rounded p-0.5">
          <button
            onClick={() => setActiveMediaTab('image')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-all ${
              activeMediaTab === 'image'
                ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            Image
          </button>
          <button
            onClick={() => setActiveMediaTab('audio')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-all ${
              activeMediaTab === 'audio'
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Music className="w-3 h-3" />
            Audio
          </button>
          <button
            onClick={() => setActiveMediaTab('video')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-all ${
              activeMediaTab === 'video'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                : 'text-gray-400 hover:text-white hover:bg-gray-600/30'
            }`}
          >
            <Film className="w-3 h-3" />
            Video
          </button>
        </div>
      </div>

      {/* Audio tab */}
      {activeMediaTab === 'audio' && <AudioMediaTab />}

      {activeMediaTab === 'video' && <VideoMediaTab onSetActiveTool={onSetActiveTool} onSetPendingVideoAsset={onSetPendingVideoAsset} />}

      {/* Image tab content */}
      {activeMediaTab === 'image' && (
      <>
      <div className="p-2 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-white">Image Pool</h3>
          <div className="flex items-center space-x-1 text-xs text-gray-400">
            <HardDrive className="w-3 h-3" />
            <span>{storageInfo.count} files</span>
            <span className="text-gray-600">|</span>
            <span>{formatFileSize(storageInfo.totalSize)}</span>
          </div>
        </div>

        {/* Quality selector */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Preview quality</span>
          <div className="flex items-center gap-1">
            {(['full', 'half', 'quarter'] as PreviewQuality[]).map(q => (
              <button
                key={q}
                onClick={() => setPreviewQuality(q)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  previewQuality === q
                    ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/40'
                    : 'text-gray-400 border border-gray-600/50 hover:text-gray-300'
                }`}
              >
                {qualityLabel[q]}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search media..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-7 pr-7 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-1.5 px-2 bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-400 rounded text-xs font-medium transition-colors flex items-center justify-center space-x-1"
        >
          <Upload className="w-3 h-3" />
          <span>Upload Media</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
      </div>

      <div
        className={`flex-1 overflow-y-auto p-2 ${dragOver ? 'bg-yellow-400/10' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg transition-colors ${dragOver ? 'border-yellow-400 bg-yellow-400/5' : 'border-gray-600'}`}>
            <ImageIcon className="w-8 h-8 text-gray-500 mb-2" />
            <p className="text-xs text-gray-400 text-center px-4">
              {searchTerm ? 'No matching media found' : 'Drop images here or click upload'}
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-2"
            onContextMenu={(e) => handleContextMenu(e, null)}
          >
            {filteredAssets.map((asset) => {
              const isSelected = selectedAssets.includes(asset.id);
              const isUsed = isAssetUsed(asset.id);
              return (
                <div
                  key={asset.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAssetSelection(asset.id, e);
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) handleAssetClick(asset);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, asset)}
                  className={`group relative bg-gray-700/30 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-yellow-400 ring-2 ring-yellow-400/50'
                      : 'border-gray-600/30 hover:border-yellow-400/50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center z-10">
                      <span className="text-black text-xs font-bold">✓</span>
                    </div>
                  )}
                  {isUsed && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-green-500 rounded text-xs text-white font-medium z-10">
                      Used
                    </div>
                  )}
                  <div className="aspect-square relative overflow-hidden bg-gray-800/50">
                    <img
                      src={getPreviewSrc(asset)}
                      alt={asset.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      draggable={false}
                    />
                    <button
                      onClick={(e) => triggerDeleteModal([asset.id], e)}
                      className="absolute bottom-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs text-white truncate font-medium" title={asset.name}>
                      {asset.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(asset.uploadedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contextMenu && (
        <MediaPoolContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          asset={contextMenu.asset}
          selectedAssets={selectedAssets}
          allAssets={assets}
          onClose={() => setContextMenu(null)}
          onAddToCanvas={(asset) => handleAssetClick(asset)}
          onRename={(asset) => { setCurrentAsset(asset); setShowRenameModal(true); }}
          onDuplicate={handleDuplicateAsset}
          onDelete={(assetIds) => { setDeleteAssetIds(assetIds); setShowDeleteModal(true); }}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onSelectUsedMedia={handleSelectUsedMedia}
          onSelectUnusedMedia={handleSelectUnusedMedia}
          onShowInfo={(asset) => { setCurrentAsset(asset); setShowInfoModal(true); }}
          onEditMetadata={(asset) => { setCurrentAsset(asset); setShowMetadataModal(true); }}
          isAssetUsed={isAssetUsed}
        />
      )}

      <MediaInfoModal
        isOpen={showInfoModal}
        onClose={() => { setShowInfoModal(false); setCurrentAsset(null); }}
        asset={currentAsset}
      />

      <MediaMetadataModal
        isOpen={showMetadataModal}
        onClose={() => { setShowMetadataModal(false); setCurrentAsset(null); }}
        asset={currentAsset}
        onSave={handleUpdateMetadata}
      />

      <RenameMediaModal
        isOpen={showRenameModal}
        onClose={() => { setShowRenameModal(false); setCurrentAsset(null); }}
        asset={currentAsset}
        onRename={handleRenameAsset}
      />

      <DeleteMediaModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteAssetIds([]); }}
        count={deleteAssetIds.length}
        hasUsedMedia={deleteAssetIds.some(id => isAssetUsed(id))}
        onConfirm={() => handleDeleteAssets(deleteAssetIds)}
      />
      </>
      )}
    </div>
  );
};

export default MediaPoolTab;
