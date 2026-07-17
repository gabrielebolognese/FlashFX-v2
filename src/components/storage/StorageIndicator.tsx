import React, { useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import { StorageUpgradeModal } from '../modals/StorageUpgradeModal';

interface StorageIndicatorProps {
  variant?: 'compact' | 'detailed';
  showUpgradeOnClick?: boolean;
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({
  variant = 'compact',
  showUpgradeOnClick = true,
}) => {
  const { storageInfo, formatBytes } = useStorage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  if (!storageInfo) return null;

  const getColorClasses = () => {
    if (storageInfo.percentage >= 100) {
      return 'text-red-600 bg-red-50 border-red-200';
    } else if (storageInfo.percentage >= 90) {
      return 'text-amber-600 bg-amber-50 border-amber-200';
    } else {
      return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getProgressColorClasses = () => {
    if (storageInfo.percentage >= 100) {
      return 'bg-gradient-to-r from-red-500 to-orange-500';
    } else if (storageInfo.percentage >= 90) {
      return 'bg-gradient-to-r from-amber-500 to-yellow-500';
    } else {
      return 'bg-gradient-to-r from-green-500 to-emerald-500';
    }
  };

  const handleClick = () => {
    if (showUpgradeOnClick && (storageInfo.isNearLimit || storageInfo.isAtLimit)) {
      setShowUpgradeModal(true);
    }
  };

  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleClick}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${getColorClasses()} ${
            showUpgradeOnClick && (storageInfo.isNearLimit || storageInfo.isAtLimit)
              ? 'cursor-pointer hover:opacity-80'
              : 'cursor-default'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span className="text-sm font-medium">
            {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.limit)}
          </span>
        </button>

        <StorageUpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          variant={storageInfo.isAtLimit ? 'limit' : 'warning'}
        />
      </>
    );
  }

  return (
    <>
      <div
        onClick={handleClick}
        className={`p-4 rounded-lg border ${getColorClasses()} ${
          showUpgradeOnClick && (storageInfo.isNearLimit || storageInfo.isAtLimit)
            ? 'cursor-pointer hover:opacity-80'
            : ''
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            <span className="font-semibold">Storage</span>
          </div>
          <span className="text-sm font-medium">
            {storageInfo.percentage.toFixed(1)}%
          </span>
        </div>

        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-500 ${getProgressColorClasses()}`}
            style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
          ></div>
        </div>

        <div className="flex justify-between text-xs">
          <span>{formatBytes(storageInfo.used)} used</span>
          <span>{formatBytes(storageInfo.remaining)} remaining</span>
        </div>

        {(storageInfo.isNearLimit || storageInfo.isAtLimit) && (
          <div className="mt-2 text-xs font-medium">
            {storageInfo.isAtLimit
              ? 'Storage limit reached - Upgrade needed'
              : 'Running low on storage - Consider upgrading'}
          </div>
        )}
      </div>

      <StorageUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        variant={storageInfo.isAtLimit ? 'limit' : 'warning'}
      />
    </>
  );
};
