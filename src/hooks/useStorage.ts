import { useEffect, useState, useCallback } from 'react';
import { StorageService, StorageInfo } from '../services/StorageService';
import { useAuth } from '../contexts/AuthContext';

export const useStorage = () => {
  const { user } = useAuth();
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStorage = useCallback(async () => {
    if (!user) {
      setStorageInfo(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const info = await StorageService.getUserStorage(user.id);
      setStorageInfo(info);
    } catch (error) {
      console.error('Error refreshing storage:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage]);

  const checkCanUpload = useCallback(
    async (projectSize: number) => {
      if (!user) return { canUpload: false, message: 'User not authenticated' };
      return await StorageService.canUploadProject(user.id, projectSize);
    },
    [user]
  );

  const formatBytes = useCallback((bytes: number) => {
    return StorageService.formatBytes(bytes);
  }, []);

  return {
    storageInfo,
    loading,
    refreshStorage,
    checkCanUpload,
    formatBytes,
  };
};
