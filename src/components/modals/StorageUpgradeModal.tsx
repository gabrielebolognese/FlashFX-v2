import React from 'react';
import { X, HardDrive, AlertTriangle, Zap } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';

interface StorageUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'warning' | 'limit';
}

export const StorageUpgradeModal: React.FC<StorageUpgradeModalProps> = ({
  isOpen,
  onClose,
  variant = 'warning',
}) => {
  const { storageInfo, formatBytes } = useStorage();

  if (!isOpen || !storageInfo) return null;

  const isAtLimit = variant === 'limit' || storageInfo.isAtLimit;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div
          className={`p-6 ${
            isAtLimit
              ? 'bg-gradient-to-r from-red-500 to-orange-500'
              : 'bg-gradient-to-r from-amber-500 to-yellow-500'
          }`}
        >
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              {isAtLimit ? (
                <AlertTriangle className="w-8 h-8" />
              ) : (
                <HardDrive className="w-8 h-8" />
              )}
              <h2 className="text-2xl font-bold">
                {isAtLimit ? 'Storage Limit Reached' : 'Storage Almost Full'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Storage Used</span>
              <span className="font-semibold">
                {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.limit)}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  storageInfo.percentage >= 100
                    ? 'bg-gradient-to-r from-red-500 to-orange-500'
                    : storageInfo.percentage >= 90
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
              ></div>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {storageInfo.percentage.toFixed(1)}% used
            </div>
          </div>

          {isAtLimit ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">
                You've reached your storage limit. You won't be able to save new projects until you
                free up space or upgrade your storage.
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <p className="text-amber-800 text-sm">
                You're running low on storage space. Consider upgrading to continue creating
                amazing projects without interruption.
              </p>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="border-2 border-amber-500 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="bg-gradient-to-br from-amber-500 to-yellow-500 rounded-lg p-2">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 mb-1">Premium Plan</h3>
                  <p className="text-sm text-slate-600 mb-2">
                    Upgrade to 10GB storage and unlock unlimited projects
                  </p>
                  <div className="text-2xl font-bold text-amber-600">$9.99/month</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                alert('Upgrade feature coming soon!');
              }}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Upgrade Now
            </button>

            <button
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {isAtLimit ? 'Manage Storage' : 'Maybe Later'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">
              Free up space by:
            </h4>
            <ul className="space-y-1 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Deleting unused projects
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Exporting projects to your device
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Optimizing large images and assets
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
