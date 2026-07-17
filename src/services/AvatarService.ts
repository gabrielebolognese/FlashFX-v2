import { supabase } from '../lib/supabase';

export class AvatarService {
  private static readonly BUCKET_NAME = 'avatars';
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024;
  private static readonly ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  static validateFile(file: File): { valid: boolean; error?: string } {
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Please upload a valid image file (JPEG, PNG, GIF, or WebP)',
      };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: 'File size must be less than 5MB',
      };
    }

    return { valid: true };
  }

  static async uploadAvatar(userId: string, file: File): Promise<{ url?: string; error?: string }> {
    try {
      console.log('[AvatarService] Starting avatar upload for user:', userId);

      const validation = this.validateFile(file);
      if (!validation.valid) {
        console.error('[AvatarService] Validation failed:', validation.error);
        return { error: validation.error };
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

      console.log('[AvatarService] Uploading to storage:', fileName);

      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('[AvatarService] Upload error:', error);
        return { error: error.message };
      }

      console.log('[AvatarService] Upload successful, getting public URL');

      const { data: { publicUrl } } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);

      console.log('[AvatarService] Public URL generated:', publicUrl);

      return { url: publicUrl };
    } catch (err) {
      console.error('[AvatarService] Exception during upload:', err);
      return { error: 'Failed to upload avatar. Please try again.' };
    }
  }

  static async uploadAvatarTemporary(file: File): Promise<{ url?: string; path?: string; error?: string }> {
    try {
      console.log('[AvatarService] Starting temporary avatar upload');

      const validation = this.validateFile(file);
      if (!validation.valid) {
        console.error('[AvatarService] Validation failed:', validation.error);
        return { error: validation.error };
      }

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const fileExt = file.name.split('.').pop();
      const fileName = `temp/${tempId}.${fileExt}`;

      console.log('[AvatarService] Uploading temporary file:', fileName);

      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('[AvatarService] Temporary upload error:', error);
        return { error: error.message };
      }

      const { data: { publicUrl } } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(fileName);

      console.log('[AvatarService] Temporary file uploaded:', publicUrl);

      return { url: publicUrl, path: fileName };
    } catch (err) {
      console.error('[AvatarService] Exception during temporary upload:', err);
      return { error: 'Failed to upload avatar. Please try again.' };
    }
  }

  static async moveTemporaryAvatar(tempPath: string, userId: string): Promise<{ url?: string; error?: string }> {
    try {
      console.log('[AvatarService] Moving temporary avatar to user folder');

      const fileExt = tempPath.split('.').pop();
      const newFileName = `${userId}/avatar-${Date.now()}.${fileExt}`;

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .download(tempPath);

      if (downloadError) {
        console.error('[AvatarService] Error downloading temp file:', downloadError);
        return { error: downloadError.message };
      }

      const { error: uploadError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(newFileName, fileData, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('[AvatarService] Error uploading to user folder:', uploadError);
        return { error: uploadError.message };
      }

      await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([tempPath]);

      const { data: { publicUrl } } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(newFileName);

      console.log('[AvatarService] Avatar moved successfully:', publicUrl);

      return { url: publicUrl };
    } catch (err) {
      console.error('[AvatarService] Exception during move:', err);
      return { error: 'Failed to process avatar. Please try again.' };
    }
  }

  static async deleteAvatar(url: string): Promise<{ error?: string }> {
    try {
      const path = url.split('/').slice(-2).join('/');

      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([path]);

      if (error) {
        console.error('[AvatarService] Delete error:', error);
        return { error: error.message };
      }

      return {};
    } catch (err) {
      console.error('[AvatarService] Exception during delete:', err);
      return { error: 'Failed to delete avatar' };
    }
  }
}
