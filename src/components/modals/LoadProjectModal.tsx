import React, { useState, useRef } from 'react';
import { X, Upload, Loader2, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import type { ImportResult } from '../../project/types';

interface LoadProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (file: File) => Promise<ImportResult>;
  loadProgress?: number;
  loadProgressLabel?: string;
}

const LoadProjectModal: React.FC<LoadProjectModalProps> = ({
  isOpen,
  onClose,
  onLoad,
  loadProgress = 0,
  loadProgressLabel = '',
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;

    if (!file.name.endsWith('.ffxproj')) {
      setLoadStatus('error');
      setResult({
        success: false,
        errors: ['Please select a valid .ffxproj file'],
      });
      return;
    }

    setSelectedFile(file);
    setLoadStatus('idle');
    setResult(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleLoad = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setLoadStatus('idle');

    try {
      const importResult = await onLoad(selectedFile);
      setResult(importResult);

      if (importResult.success) {
        setLoadStatus('success');
        setTimeout(() => {
          onClose();
          resetState();
        }, 1500);
      } else {
        setLoadStatus('error');
      }
    } catch (error) {
      setLoadStatus('error');
      setResult({
        success: false,
        errors: [error instanceof Error ? error.message : 'Failed to load project'],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setLoadStatus('idle');
    setResult(null);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      resetState();
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayProgress = isLoading ? loadProgress : 0;
  const displayLabel = isLoading ? loadProgressLabel : '';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Upload className="w-5 h-5 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Load Project</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 transition-all ${
              isDragging
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-600 hover:border-gray-500'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".ffxproj"
              onChange={handleFileInputChange}
              disabled={isLoading}
              className="hidden"
            />

            {selectedFile ? (
              <div className="text-center">
                <FileText className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-white mb-1">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-300 mb-2">
                  Drag & drop your .ffxproj file here
                </p>
                <p className="text-xs text-gray-400 mb-3">or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  Browse Files
                </button>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 truncate pr-2">{displayLabel}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{displayProgress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
            </div>
          )}

          {loadStatus === 'error' && result?.errors && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm font-medium text-red-400">Failed to load project</p>
              </div>
              <ul className="text-xs text-red-300 ml-7 space-y-1">
                {result.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {result?.warnings && result.warnings.length > 0 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <p className="text-sm font-medium text-yellow-400">Warnings</p>
              </div>
              <ul className="text-xs text-yellow-300 ml-7 space-y-1">
                {result.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {loadStatus === 'success' && (
            <div className="flex items-center space-x-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-400">Project loaded successfully!</p>
            </div>
          )}

          {selectedFile && loadStatus === 'idle' && !isLoading && (
            <div className="bg-gray-700/30 border border-gray-600/50 rounded-lg p-4">
              <p className="text-xs text-gray-400">
                Loading this project will replace your current work. Make sure to save any changes before proceeding.
              </p>
            </div>
          )}
        </div>

        <div className="flex space-x-3 mt-6">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            disabled={!selectedFile || isLoading || loadStatus === 'success'}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading...</span>
              </>
            ) : loadStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Loaded!</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Load Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoadProjectModal;
