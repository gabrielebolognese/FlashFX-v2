/**
 * VideoImporter — handles video file import flow.
 * Uses mp4box.js for metadata extraction (codec, dimensions, duration).
 * Generates a single thumbnail using WebCodecs for the import preview.
 * NOT part of the playback pipeline — HTMLVideoElement is used here
 * only for thumbnail generation, never for decoding during playback.
 */
import { createFile, ISOFile, MP4BoxBuffer } from 'mp4box';
import { v4 as uuidv4 } from 'uuid';
import { VideoAsset, VideoClip, VideoTrack } from './types';
import { videoAssetManager } from './VideoAssetManager';

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  containerType: string;
}

export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const mp4file: ISOFile = createFile();
    let resolved = false;

    mp4file.onReady = (info) => {
      if (resolved) return;
      resolved = true;
      mp4file.flush();

      const videoTrack = info.videoTracks?.[0];
      if (!videoTrack) {
        reject(new Error('No video track found in file'));
        return;
      }

      const durationSeconds = info.duration / info.timescale;
      const codec = videoTrack.codec ?? 'unknown';
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
      const containerType = ext === 'webm' ? 'webm' : ext === 'mov' ? 'mov' : 'mp4';

      const width = (videoTrack as unknown as { track_width?: number }).track_width
        ?? (videoTrack as unknown as { video?: { width: number } }).video?.width
        ?? 0;
      const height = (videoTrack as unknown as { track_height?: number }).track_height
        ?? (videoTrack as unknown as { video?: { height: number } }).video?.height
        ?? 0;

      resolve({ duration: durationSeconds, width, height, codec, containerType });
    };

    mp4file.onError = (e: string) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`mp4box error: ${e}`));
      }
    };

    file.arrayBuffer().then((buffer) => {
      const mp4Buffer = buffer as MP4BoxBuffer;
      mp4Buffer.fileStart = 0;
      mp4file.appendBuffer(mp4Buffer);
      mp4file.flush();
    }).catch(reject);
  });
}

export async function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = '';
    };

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const maxW = 320;
      const ratio = Math.min(maxW / (video.videoWidth || 320), 1);
      canvas.width = Math.round((video.videoWidth || 320) * ratio);
      canvas.height = Math.round((video.videoHeight || 180) * ratio);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      cleanup();
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };

    video.onerror = () => {
      cleanup();
      resolve('');
    };

    video.src = url;
  });
}

export async function importVideoFile(file: File): Promise<{
  asset: VideoAsset;
  track: VideoTrack;
  clip: VideoClip;
  startTime: number;
}> {
  const metadata = await extractVideoMetadata(file);
  const thumbnail = await generateThumbnail(file);

  const assetId = uuidv4();
  const asset: VideoAsset = {
    id: assetId,
    fileName: file.name,
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    codec: metadata.codec,
    containerType: metadata.containerType,
    thumbnailUrl: thumbnail,
  };

  videoAssetManager.registerFile(assetId, file);

  const trackId = uuidv4();
  const track: VideoTrack = {
    id: trackId,
    name: file.name.replace(/\.[^.]+$/, ''),
    clipIds: [],
    muted: false,
    zOrder: 0,
  };

  const clipId = uuidv4();
  const clip: VideoClip = {
    id: clipId,
    assetId,
    startTime: 0,
    endTime: metadata.duration,
    offset: 0,
    trackId,
    name: file.name.replace(/\.[^.]+$/, ''),
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    opacity: 1,
    muted: false,
  };

  return { asset, track, clip, startTime: 0 };
}

export function createClipFromAsset(
  asset: VideoAsset,
  trackId: string,
  startTime: number
): VideoClip {
  return {
    id: uuidv4(),
    assetId: asset.id,
    startTime,
    endTime: startTime + asset.duration,
    offset: 0,
    trackId,
    name: asset.fileName.replace(/\.[^.]+$/, ''),
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    opacity: 1,
    muted: false,
  };
}
