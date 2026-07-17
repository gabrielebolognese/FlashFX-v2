/**
 * VideoRenderer — React component that mounts the WebGL2 compositor canvas
 * inside the artboard and drives the per-frame render loop.
 *
 * This component owns the GPUCompositor, VideoDecoderController, and
 * VideoScheduler. It has its own requestAnimationFrame loop that is entirely
 * separate from the PlaybackScheduler — video must render correctly both
 * during playback and while the user scrubs the playhead.
 *
 * Registers with videoSync so the VideoScheduler can respond to play/pause/seek.
 */

import React, { useRef, useEffect } from 'react';
import { useVideo } from './VideoContext';
import { useAnimation } from '../animation-engine';
import { GPUCompositor } from './GPUCompositor';
import { VideoDecoderController } from './VideoDecoderController';
import { VideoScheduler } from './VideoScheduler';
import { videoSync } from './videoSync';

interface VideoRendererProps {
  canvasWidth: number;
  canvasHeight: number;
}

const VideoRenderer: React.FC<VideoRendererProps> = ({ canvasWidth, canvasHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<GPUCompositor | null>(null);
  const decoderCtrlRef = useRef<VideoDecoderController | null>(null);
  const schedulerRef = useRef<VideoScheduler | null>(null);
  const rafIdRef = useRef<number>(0);
  const destroyedRef = useRef(false);

  const { videoState } = useVideo();
  const { state: animState } = useAnimation();

  // Keep refs to avoid stale closures in RAF
  const videoStateRef = useRef(videoState);
  videoStateRef.current = videoState;

  const currentTimeRef = useRef(animState.timeline.currentTime);
  currentTimeRef.current = animState.timeline.currentTime;

  // Initialize GPU compositor and decoder pipeline on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let compositor: GPUCompositor;
    try {
      compositor = new GPUCompositor(canvas, canvasWidth, canvasHeight);
    } catch (err) {
      console.warn('[VideoRenderer] WebGL2 not available:', err);
      return;
    }

    const decoderCtrl = new VideoDecoderController((clipId, message) => {
      console.error(`[VideoRenderer] Fatal decode error on clip ${clipId}: ${message}`);
    });

    const scheduler = new VideoScheduler(compositor, decoderCtrl);

    compositorRef.current = compositor;
    decoderCtrlRef.current = decoderCtrl;
    schedulerRef.current = scheduler;
    destroyedRef.current = false;

    videoSync.register({
      onPlay: (time) => {
        schedulerRef.current?.onSeek(time, videoStateRef.current);
      },
      onPause: () => {
        schedulerRef.current?.onPause();
      },
      onSeek: (time) => {
        schedulerRef.current?.onSeek(time, videoStateRef.current);
      },
      onStop: () => {
        schedulerRef.current?.onPause();
        compositorRef.current?.clear();
      },
    });

    // Per-frame RAF loop
    const tick = () => {
      if (destroyedRef.current) return;
      rafIdRef.current = requestAnimationFrame(tick);

      const scheduler = schedulerRef.current;
      if (!scheduler) return;

      const currentTime = currentTimeRef.current;
      scheduler.renderFrame(currentTime, videoStateRef.current);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafIdRef.current);
      videoSync.unregister();
      decoderCtrl.destroy();
      compositor.destroy();
      compositorRef.current = null;
      decoderCtrlRef.current = null;
      schedulerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize compositor when canvas dimensions change
  useEffect(() => {
    compositorRef.current?.resize(canvasWidth, canvasHeight);
  }, [canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
};

export default VideoRenderer;
