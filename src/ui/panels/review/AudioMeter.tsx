import { useRef, useEffect, memo } from 'react';
import { audioPlaybackEngine } from '../../../engine/media/audioPlayback';
import { useTimelineStore } from '../../../store/timeline';

const DB_MIN = -60;
const DB_MAX = 3;
const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_RATE = 0.15;

function rmsToDb(rms: number): number {
  if (rms <= 0) return DB_MIN;
  return Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(rms)));
}

function dbToPercent(db: number): number {
  return Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));
}

function getSegmentColor(percent: number): string {
  if (percent > 0.92) return '#ef4444';
  if (percent > 0.75) return '#f59e0b';
  return '#22c55e';
}

const DB_MARKS = [0, -3, -6, -12, -24, -48];

export const AudioMeter = memo(function AudioMeter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const peakL = useRef({ value: DB_MIN, time: 0 });
  const peakR = useRef({ value: DB_MIN, time: 0 });
  const smoothL = useRef(0);
  const smoothR = useRef(0);
  const bufferL = useRef<Float32Array | null>(null);
  const bufferR = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const analyserL = audioPlaybackEngine.getAnalyserLeft();
      const analyserR = audioPlaybackEngine.getAnalyserRight();
      const isPlaying = useTimelineStore.getState().isPlaying;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      let dbL = DB_MIN;
      let dbR = DB_MIN;

      if (isPlaying && analyserL && analyserR) {
        if (!bufferL.current || bufferL.current.length !== analyserL.fftSize) {
          bufferL.current = new Float32Array(analyserL.fftSize);
        }
        if (!bufferR.current || bufferR.current.length !== analyserR.fftSize) {
          bufferR.current = new Float32Array(analyserR.fftSize);
        }

        analyserL.getFloatTimeDomainData(bufferL.current);
        analyserR.getFloatTimeDomainData(bufferR.current);

        let sumL = 0;
        let sumR = 0;
        for (let i = 0; i < bufferL.current.length; i++) {
          sumL += bufferL.current[i] * bufferL.current[i];
        }
        for (let i = 0; i < bufferR.current.length; i++) {
          sumR += bufferR.current[i] * bufferR.current[i];
        }

        const rmsL = Math.sqrt(sumL / bufferL.current.length);
        const rmsR = Math.sqrt(sumR / bufferR.current.length);
        dbL = rmsToDb(rmsL);
        dbR = rmsToDb(rmsR);
      }

      // Smooth
      const smoothing = 0.7;
      smoothL.current = smoothL.current * smoothing + dbToPercent(dbL) * (1 - smoothing);
      smoothR.current = smoothR.current * smoothing + dbToPercent(dbR) * (1 - smoothing);

      // Peak hold
      if (dbL > peakL.current.value) {
        peakL.current = { value: dbL, time: now };
      } else if (now - peakL.current.time > PEAK_HOLD_MS) {
        peakL.current.value -= PEAK_DECAY_RATE;
      }
      if (dbR > peakR.current.value) {
        peakR.current = { value: dbR, time: now };
      } else if (now - peakR.current.time > PEAK_HOLD_MS) {
        peakR.current.value -= PEAK_DECAY_RATE;
      }

      // Draw background
      ctx.fillStyle = '#06101a';
      ctx.fillRect(0, 0, w, h);

      const meterPadding = 4;
      const labelWidth = 22;
      const channelLabelHeight = 14;
      const meterTop = meterPadding;
      const meterBottom = h - meterPadding - channelLabelHeight;
      const meterHeight = meterBottom - meterTop;
      const barWidth = 8;
      const gap = 3;
      const totalBarWidth = barWidth * 2 + gap;
      const meterLeft = (w - totalBarWidth - labelWidth) / 2;

      // Draw meter track backgrounds
      ctx.fillStyle = '#151a24';
      ctx.fillRect(meterLeft, meterTop, barWidth, meterHeight);
      ctx.fillRect(meterLeft + barWidth + gap, meterTop, barWidth, meterHeight);

      // Draw level bars (bottom to top)
      const segments = 40;
      const segHeight = meterHeight / segments;
      const segGap = 1;

      for (let i = 0; i < segments; i++) {
        const percent = i / segments;
        const yBottom = meterBottom - i * segHeight;
        const yTop = yBottom - segHeight + segGap;

        const color = getSegmentColor(percent);

        if (percent <= smoothL.current) {
          ctx.fillStyle = color;
          ctx.fillRect(meterLeft, yTop, barWidth, segHeight - segGap);
        }
        if (percent <= smoothR.current) {
          ctx.fillStyle = color;
          ctx.fillRect(meterLeft + barWidth + gap, yTop, barWidth, segHeight - segGap);
        }
      }

      // Draw peak indicators
      const peakLPercent = dbToPercent(peakL.current.value);
      const peakRPercent = dbToPercent(peakR.current.value);

      if (peakLPercent > 0.01) {
        const peakY = meterBottom - peakLPercent * meterHeight;
        ctx.fillStyle = peakLPercent > 0.92 ? '#ef4444' : '#ffffff';
        ctx.fillRect(meterLeft, peakY, barWidth, 2);
      }
      if (peakRPercent > 0.01) {
        const peakY = meterBottom - peakRPercent * meterHeight;
        ctx.fillStyle = peakRPercent > 0.92 ? '#ef4444' : '#ffffff';
        ctx.fillRect(meterLeft + barWidth + gap, peakY, barWidth, 2);
      }

      // Draw dB scale
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      const scaleX = meterLeft + totalBarWidth + 4;

      for (const mark of DB_MARKS) {
        const percent = dbToPercent(mark);
        const y = meterBottom - percent * meterHeight;
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(meterLeft - 2, y, totalBarWidth + 4, 1);
        ctx.fillStyle = '#6b7280';
        ctx.fillText(mark === 0 ? '0' : `${mark}`, scaleX, y + 3);
      }

      // Channel labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('L', meterLeft + barWidth / 2, h - meterPadding);
      ctx.fillText('R', meterLeft + barWidth + gap + barWidth / 2, h - meterPadding);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * window.devicePixelRatio);
      canvas.height = Math.round(rect.height * window.devicePixelRatio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
    observer.observe(container);
    const rect = container.getBoundingClientRect();
    canvas.width = Math.round(rect.width * window.devicePixelRatio);
    canvas.height = Math.round(rect.height * window.devicePixelRatio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
});
