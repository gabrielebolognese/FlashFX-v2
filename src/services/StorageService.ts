import { supabase } from '../lib/supabase';

export interface StorageInfo {
  used: number;
  limit: number;
  percentage: number;
  remaining: number;
  isNearLimit: boolean;
  isAtLimit: boolean;
}

export class StorageService {
  private static readonly NEAR_LIMIT_THRESHOLD = 0.9;

  static async getUserStorage(userId: string): Promise<StorageInfo | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('storage_used, storage_limit')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const used = data.storage_used || 0;
      const limit = data.storage_limit || 104857600;
      const percentage = limit > 0 ? (used / limit) * 100 : 0;
      const remaining = Math.max(0, limit - used);
      const isNearLimit = percentage >= this.NEAR_LIMIT_THRESHOLD * 100;
      const isAtLimit = used >= limit;

      return {
        used,
        limit,
        percentage,
        remaining,
        isNearLimit,
        isAtLimit,
      };
    } catch (error) {
      console.error('Error fetching user storage:', error);
      return null;
    }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static calculateProjectSize(projectData: any): number {
    const jsonString = JSON.stringify(projectData);
    const sizeInBytes = new Blob([jsonString]).size;
    return sizeInBytes;
  }

  static async canUploadProject(userId: string, projectSize: number): Promise<{ canUpload: boolean; message?: string }> {
    const storageInfo = await this.getUserStorage(userId);

    if (!storageInfo) {
      return { canUpload: false, message: 'Unable to check storage limits' };
    }

    if (storageInfo.remaining < projectSize) {
      const needed = this.formatBytes(projectSize);
      const available = this.formatBytes(storageInfo.remaining);
      return {
        canUpload: false,
        message: `Insufficient storage. Need ${needed}, but only ${available} available.`,
      };
    }

    return { canUpload: true };
  }

  static async recalculateUserStorage(userId: string): Promise<void> {
    try {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('size_bytes')
        .eq('user_id', userId);

      if (projectsError) throw projectsError;

      const totalSize = projects?.reduce((sum, project) => sum + (project.size_bytes || 0), 0) || 0;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ storage_used: totalSize })
        .eq('id', userId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error recalculating storage:', error);
      throw error;
    }
  }

  static async updateProjectSize(projectId: string, size: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ size_bytes: size })
        .eq('id', projectId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating project size:', error);
      throw error;
    }
  }
}
