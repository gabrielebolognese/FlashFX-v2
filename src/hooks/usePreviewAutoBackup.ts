/**
 * usePreviewAutoBackup Hook
 *
 * React hook for integrating automatic preview backup into components.
 * Handles lifecycle management and cleanup automatically.
 */

import { useEffect, useRef } from 'react';
import { PreviewAutoBackup, PreviewBackupConfig } from '../services/PreviewAutoBackup';

interface UsePreviewAutoBackupOptions {
  projectId: string | null;
  isGuest: boolean;
  enabled?: boolean;
  intervalMs?: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function usePreviewAutoBackup(options: UsePreviewAutoBackupOptions) {
  const backupServiceRef = useRef<PreviewAutoBackup | null>(null);
  const {
    projectId,
    isGuest,
    enabled = true,
    intervalMs,
    quality,
    maxWidth,
    maxHeight
  } = options;

  useEffect(() => {
    if (!enabled || !projectId) {
      if (backupServiceRef.current) {
        backupServiceRef.current.stop();
        backupServiceRef.current = null;
      }
      return;
    }

    const config: PreviewBackupConfig = {
      projectId,
      isGuest,
      intervalMs,
      quality,
      maxWidth,
      maxHeight
    };

    backupServiceRef.current = new PreviewAutoBackup(config);
    backupServiceRef.current.start();

    return () => {
      if (backupServiceRef.current) {
        backupServiceRef.current.stop();
        backupServiceRef.current = null;
      }
    };
  }, [projectId, isGuest, enabled, intervalMs, quality, maxWidth, maxHeight]);

  const captureNow = async () => {
    if (backupServiceRef.current) {
      return await backupServiceRef.current.captureNow();
    }
    return false;
  };

  const getStats = () => {
    if (backupServiceRef.current) {
      return backupServiceRef.current.getStats();
    }
    return null;
  };

  return {
    captureNow,
    getStats
  };
}
