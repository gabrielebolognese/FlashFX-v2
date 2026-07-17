/**
 * PreviewAutoBackup Service
 *
 * Automatically captures and stores canvas previews for project thumbnails.
 * Runs in the background every 60 seconds without UI interruption.
 *
 * Features:
 * - Automatic canvas capture every 60 seconds
 * - Supabase storage for authenticated users
 * - LocalStorage/IndexedDB fallback for guest users
 * - Automatic cleanup of old previews
 * - Error handling and recovery
 * - Memory-efficient operation
 */

import { toPng } from 'html-to-image';
import { supabase } from '../lib/supabase';

export interface PreviewBackupConfig {
  projectId: string;
  isGuest: boolean;
  intervalMs?: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface PreviewMetadata {
  projectId: string;
  timestamp: number;
  size: number;
  format: string;
}

const DEFAULT_INTERVAL_MS = 60000; // 60 seconds
const DEFAULT_QUALITY = 0.8;
const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_HEIGHT = 720;
const GUEST_PREVIEW_PREFIX = 'flashfx_preview_';

export class PreviewAutoBackup {
  private config: PreviewBackupConfig;
  private intervalId: number | null = null;
  private isCapturing = false;
  private lastCaptureTime = 0;
  private captureCount = 0;

  constructor(config: PreviewBackupConfig) {
    this.config = {
      intervalMs: DEFAULT_INTERVAL_MS,
      quality: DEFAULT_QUALITY,
      maxWidth: DEFAULT_MAX_WIDTH,
      maxHeight: DEFAULT_MAX_HEIGHT,
      ...config
    };
  }

  /**
   * Start automatic preview capture
   */
  start(): void {
    if (this.intervalId !== null) {
      console.warn('[PreviewAutoBackup] Already running');
      return;
    }

    console.log('[PreviewAutoBackup] Starting auto-backup for project:', this.config.projectId);

    this.intervalId = window.setInterval(() => {
      this.captureAndStore();
    }, this.config.intervalMs);

    this.captureAndStore();
  }

  /**
   * Stop automatic preview capture
   */
  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[PreviewAutoBackup] Stopped auto-backup');
    }
  }

  /**
   * Manually trigger a preview capture
   */
  async captureNow(): Promise<boolean> {
    return this.captureAndStore();
  }

  /**
   * Main capture and storage logic
   */
  private async captureAndStore(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('[PreviewAutoBackup] Capture already in progress, skipping');
      return false;
    }

    const now = Date.now();
    if (now - this.lastCaptureTime < 5000) {
      console.log('[PreviewAutoBackup] Too soon since last capture, skipping');
      return false;
    }

    this.isCapturing = true;

    try {
      const canvasElement = document.getElementById('canvas-artboard');

      if (!canvasElement) {
        console.warn('[PreviewAutoBackup] Canvas element not found');
        return false;
      }

      const dataUrl = await this.captureCanvas(canvasElement);

      if (!dataUrl) {
        console.warn('[PreviewAutoBackup] Failed to capture canvas');
        return false;
      }

      const blob = await this.dataUrlToBlob(dataUrl);

      if (this.config.isGuest) {
        await this.storeGuestPreview(blob, dataUrl);
      } else {
        await this.storeAuthenticatedPreview(blob);
      }

      this.lastCaptureTime = now;
      this.captureCount++;

      return true;
    } catch (error) {
      console.error('[PreviewAutoBackup] Capture failed:', error);
      return false;
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Capture canvas as data URL
   */
  private async captureCanvas(element: HTMLElement): Promise<string | null> {
    try {
      const computedStyle = window.getComputedStyle(element);
      const hasBackground = computedStyle.backgroundImage !== 'none' ||
                            (computedStyle.backgroundColor &&
                             computedStyle.backgroundColor !== 'transparent' &&
                             computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)');

      const dataUrl = await toPng(element, {
        cacheBust: true,
        backgroundColor: hasBackground ? undefined : '#1F2937',
        pixelRatio: 1,
        quality: this.config.quality,
        width: this.config.maxWidth,
        height: this.config.maxHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
          maxWidth: `${this.config.maxWidth}px`,
          maxHeight: `${this.config.maxHeight}px`,
        }
      });

      return dataUrl;
    } catch (error) {
      console.error('[PreviewAutoBackup] Canvas capture error:', error);
      return null;
    }
  }

  /**
   * Convert data URL to Blob
   */
  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  /**
   * Store preview for authenticated users (Supabase)
   */
  private async storeAuthenticatedPreview(blob: Blob): Promise<void> {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        console.error('[PreviewAutoBackup] User not authenticated:', userError);
        return;
      }

      await this.deleteOldPreview();

      const fileName = `preview_${this.config.projectId}_${Date.now()}.png`;
      const filePath = `${userData.user.id}/${this.config.projectId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('project-previews')
        .upload(filePath, blob, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        console.error('[PreviewAutoBackup] Upload failed:', uploadError);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('project-previews')
        .getPublicUrl(filePath);

      if (urlData?.publicUrl) {
        await supabase
          .from('projects')
          .update({ thumbnail: urlData.publicUrl })
          .eq('id', this.config.projectId);

        console.log('[PreviewAutoBackup] Preview stored successfully');
      }
    } catch (error) {
      console.error('[PreviewAutoBackup] Store authenticated preview failed:', error);
    }
  }

  /**
   * Delete old preview from Supabase storage
   */
  private async deleteOldPreview(): Promise<void> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: project } = await supabase
        .from('projects')
        .select('thumbnail')
        .eq('id', this.config.projectId)
        .maybeSingle();

      if (project?.thumbnail) {
        const urlParts = project.thumbnail.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `${userData.user.id}/${this.config.projectId}/${fileName}`;

        await supabase.storage
          .from('project-previews')
          .remove([filePath]);
      }
    } catch (error) {
      console.error('[PreviewAutoBackup] Delete old preview failed:', error);
    }
  }

  /**
   * Store preview for guest users (LocalStorage + IndexedDB)
   */
  private async storeGuestPreview(blob: Blob, dataUrl: string): Promise<void> {
    try {
      await this.deleteOldGuestPreview();

      const metadata: PreviewMetadata = {
        projectId: this.config.projectId,
        timestamp: Date.now(),
        size: blob.size,
        format: 'image/png'
      };

      if (blob.size < 4 * 1024 * 1024) {
        this.storeInLocalStorage(dataUrl, metadata);
      } else {
        await this.storeInIndexedDB(blob, metadata);
      }

      this.updateGuestProjectThumbnail(dataUrl);

      console.log('[PreviewAutoBackup] Guest preview stored successfully');
    } catch (error) {
      console.error('[PreviewAutoBackup] Store guest preview failed:', error);
    }
  }

  /**
   * Store in LocalStorage (for small images)
   */
  private storeInLocalStorage(dataUrl: string, metadata: PreviewMetadata): void {
    try {
      const key = `${GUEST_PREVIEW_PREFIX}${this.config.projectId}`;
      const data = {
        dataUrl,
        metadata
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('[PreviewAutoBackup] LocalStorage store failed:', error);
    }
  }

  /**
   * Store in IndexedDB (for larger images)
   */
  private async storeInIndexedDB(blob: Blob, metadata: PreviewMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FlashFXPreviews', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['previews'], 'readwrite');
        const store = transaction.objectStore('previews');

        const data = {
          projectId: this.config.projectId,
          blob,
          metadata
        };

        const putRequest = store.put(data, this.config.projectId);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('previews')) {
          db.createObjectStore('previews');
        }
      };
    });
  }

  /**
   * Delete old guest preview
   */
  private async deleteOldGuestPreview(): Promise<void> {
    try {
      const key = `${GUEST_PREVIEW_PREFIX}${this.config.projectId}`;
      localStorage.removeItem(key);

      const request = indexedDB.open('FlashFXPreviews', 1);
      request.onsuccess = () => {
        const db = request.result;
        if (db.objectStoreNames.contains('previews')) {
          const transaction = db.transaction(['previews'], 'readwrite');
          const store = transaction.objectStore('previews');
          store.delete(this.config.projectId);
        }
      };
    } catch (error) {
      console.error('[PreviewAutoBackup] Delete old guest preview failed:', error);
    }
  }

  /**
   * Update guest project thumbnail in localStorage
   */
  private updateGuestProjectThumbnail(dataUrl: string): void {
    try {
      const stored = localStorage.getItem('flashfx_guest_projects');
      if (!stored) return;

      const projects = JSON.parse(stored);
      const updated = projects.map((p: any) =>
        p.id === this.config.projectId
          ? { ...p, thumbnail: dataUrl, updated_at: new Date().toISOString() }
          : p
      );

      localStorage.setItem('flashfx_guest_projects', JSON.stringify(updated));
    } catch (error) {
      console.error('[PreviewAutoBackup] Update guest thumbnail failed:', error);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      captureCount: this.captureCount,
      isRunning: this.intervalId !== null,
      lastCaptureTime: this.lastCaptureTime,
      projectId: this.config.projectId
    };
  }
}

/**
 * Utility function to load guest preview from storage
 */
export async function loadGuestPreview(projectId: string): Promise<string | null> {
  try {
    const key = `${GUEST_PREVIEW_PREFIX}${projectId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      const data = JSON.parse(stored);
      return data.dataUrl;
    }

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('FlashFXPreviews', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!db.objectStoreNames.contains('previews')) {
      return null;
    }

    const transaction = db.transaction(['previews'], 'readonly');
    const store = transaction.objectStore('previews');
    const getRequest = store.get(projectId);

    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const data = getRequest.result;
        if (data?.blob) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(data.blob);
        } else {
          resolve(null);
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('[PreviewAutoBackup] Load guest preview failed:', error);
    return null;
  }
}

/**
 * Utility function to cleanup all guest previews
 */
export async function cleanupAllGuestPreviews(): Promise<void> {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(GUEST_PREVIEW_PREFIX)) {
        localStorage.removeItem(key);
      }
    });

    const request = indexedDB.open('FlashFXPreviews', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains('previews')) {
        const transaction = db.transaction(['previews'], 'readwrite');
        const store = transaction.objectStore('previews');
        store.clear();
      }
    };
  } catch (error) {
    console.error('[PreviewAutoBackup] Cleanup failed:', error);
  }
}
