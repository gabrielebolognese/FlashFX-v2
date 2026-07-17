import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX, Trash2, X, Clock, Radio } from 'lucide-react';
import { useAudio } from '../../audio/AudioContext';
import { usePlayback } from '../../animation-engine';
import { audioEngineInstance } from '../../audio/AudioEngine';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

const VUMeter: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const peakRef = useRef(0);
  const peakHoldRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const analyser = audioEngineInstance.getAnalyser();
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      let level = 0;
      if (analyser && isPlaying) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.sqrt(sum / data.length);
      }

      if (level > peakRef.current) {
        peakRef.current = level;
        peakHoldRef.current = 60;
      } else {
        peakRef.current = Math.max(0, peakRef.current - 0.02);
        peakHoldRef.current = Math.max(0, peakHoldRef.current - 1);
      }

      const segments = 20;
      const segH = (h - segments + 1) / segments;
      for (let i = 0; i < segments; i++) {
        const threshold = (segments - 1 - i) / segments;
        const active = level >= threshold || (peakHoldRef.current > 0 && peakRef.current >= threshold);
        const isPeak = peakHoldRef.current > 0 && Math.abs(peakRef.current - threshold) < 1 / segments;
        let color = 'rgba(74,222,128,0.85)';
        if (threshold > 0.8) color = 'rgba(239,68,68,0.85)';
        else if (threshold > 0.6) color = 'rgba(251,191,36,0.85)';

        if (isPeak) {
          ctx.fillStyle = color;
        } else if (active) {
          ctx.fillStyle = color;
        } else {
          ctx.fillStyle = 'rgba(55,65,81,0.6)';
        }
        const y = i * (segH + 1);
        ctx.fillRect(0, y, w, segH);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={16}
      height={80}
      className="rounded-sm"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

const SpectrumAnalyzer: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BAR_COUNT = 28;

    const draw = () => {
      const analyser = audioEngineInstance.getAnalyser();
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(17,24,39,0.6)';
      ctx.fillRect(0, 0, w, h);

      if (analyser && isPlaying) {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        const barW = (w - BAR_COUNT + 1) / BAR_COUNT;
        const nyquist = freqData.length;

        for (let i = 0; i < BAR_COUNT; i++) {
          const logMin = Math.log10(20);
          const logMax = Math.log10(20000);
          const freqMin = Math.pow(10, logMin + (i / BAR_COUNT) * (logMax - logMin));
          const freqMax = Math.pow(10, logMin + ((i + 1) / BAR_COUNT) * (logMax - logMin));
          const sampleRate = audioEngineInstance.getAudioContext()?.sampleRate ?? 44100;
          const binMin = Math.floor((freqMin / (sampleRate / 2)) * nyquist);
          const binMax = Math.ceil((freqMax / (sampleRate / 2)) * nyquist);
          let sum = 0;
          let count = 0;
          for (let b = binMin; b <= Math.min(binMax, nyquist - 1); b++) {
            sum += freqData[b];
            count++;
          }
          const avg = count > 0 ? sum / count : 0;
          const barH = (avg / 255) * (h - 2);

          const t = i / BAR_COUNT;
          const r = Math.round(74 + t * (239 - 74));
          const g = Math.round(222 - t * (222 - 68));
          const bl = Math.round(128 + t * (68 - 128));
          ctx.fillStyle = `rgba(${r},${g},${bl},0.9)`;

          const x = i * (barW + 1);
          ctx.fillRect(x, h - barH - 1, barW, barH);
        }
      } else {
        const barW = (w - BAR_COUNT + 1) / BAR_COUNT;
        for (let i = 0; i < BAR_COUNT; i++) {
          ctx.fillStyle = 'rgba(55,65,81,0.5)';
          ctx.fillRect(i * (barW + 1), h - 3, barW, 2);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={56}
      className="w-full rounded"
      style={{ imageRendering: 'auto' }}
    />
  );
};

const AudioClipPropertiesPanel: React.FC = () => {
  const {
    audioState,
    updateClip,
    updateTrack,
    removeClip,
    selectedAudioClipId,
    setSelectedAudioClipId,
  } = useAudio();

  const { isPlaying } = usePlayback();
  const [showSpectrum, setShowSpectrum] = useState(false);

  const clip = selectedAudioClipId ? audioState.clips[selectedAudioClipId] : null;
  const asset = clip ? audioState.assets[clip.assetId] : null;
  const track = clip ? audioState.tracks[clip.trackId] : null;

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAudioClipId) return;
    updateClip(selectedAudioClipId, { name: e.target.value });
  }, [selectedAudioClipId, updateClip]);

  const handleStartTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedAudioClipId) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val < clip.endTime) {
      updateClip(selectedAudioClipId, { startTime: val });
    }
  }, [clip, selectedAudioClipId, updateClip]);

  const handleEndTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedAudioClipId) return;
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > clip.startTime) {
      updateClip(selectedAudioClipId, { endTime: val });
    }
  }, [clip, selectedAudioClipId, updateClip]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!track) return;
    updateTrack(track.id, { volume: parseFloat(e.target.value) });
  }, [track, updateTrack]);

  const handleFadeInChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAudioClipId) return;
    updateClip(selectedAudioClipId, { fadeIn: parseFloat(e.target.value) });
  }, [selectedAudioClipId, updateClip]);

  const handleFadeOutChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAudioClipId) return;
    updateClip(selectedAudioClipId, { fadeOut: parseFloat(e.target.value) });
  }, [selectedAudioClipId, updateClip]);

  const handleDelete = useCallback(() => {
    if (!selectedAudioClipId) return;
    removeClip(selectedAudioClipId);
    setSelectedAudioClipId(null);
  }, [selectedAudioClipId, removeClip, setSelectedAudioClipId]);

  if (!clip || !track) return null;

  const duration = clip.endTime - clip.startTime;
  const maxFade = Math.max(0.1, duration * 0.5);

  const waveform = asset?.waveform ?? [];
  const rmsWaveform = asset?.rmsWaveform ?? [];

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50 bg-gray-800/60">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-green-900/60">
            <Music className="w-3 h-3 text-green-400" />
          </div>
          <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">Audio Clip</span>
        </div>
        <button
          onClick={() => setSelectedAudioClipId(null)}
          className="p-1 rounded hover:bg-gray-700/60 text-gray-500 hover:text-gray-300 transition-colors"
          title="Deselect clip"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-3 flex flex-col gap-4">
        {/* Clip name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={clip.name}
            onChange={handleNameChange}
            className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-green-500/60 transition-colors"
          />
        </div>

        {/* Track info */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Track</label>
          <div className="flex items-center gap-2 bg-gray-700/40 rounded px-2 py-1.5">
            <Music className="w-3 h-3 text-green-500/70 flex-shrink-0" />
            <span className="text-xs text-gray-300 truncate">{track.name}</span>
          </div>
        </div>

        {/* VU Meter + Waveform/Spectrum */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {showSpectrum ? 'Spectrum' : 'Waveform'}
            </label>
            <button
              onClick={() => setShowSpectrum(v => !v)}
              title={showSpectrum ? 'Show waveform' : 'Show spectrum'}
              className={`p-1 rounded transition-colors ${showSpectrum ? 'bg-green-500/20 text-green-400' : 'bg-gray-700/50 text-gray-400 hover:text-gray-200'}`}
            >
              <Radio className="w-3 h-3" />
            </button>
          </div>

          <div className="flex gap-2 items-end">
            <VUMeter isPlaying={isPlaying} />
            <div className="flex-1">
              {showSpectrum ? (
                <SpectrumAnalyzer isPlaying={isPlaying} />
              ) : (
                <div className="h-14 bg-gray-700/40 rounded overflow-hidden border border-gray-600/30">
                  {waveform.length > 0 ? (
                    <svg
                      className="w-full h-full"
                      viewBox={`0 0 ${waveform.length} 1`}
                      preserveAspectRatio="none"
                    >
                      <polygon
                        points={[
                          ...waveform.map((p, i) => `${i},${(0.5 - p * 0.44).toFixed(4)}`),
                          ...[...waveform].reverse().map((p, i) => `${waveform.length - 1 - i},${(0.5 + p * 0.44).toFixed(4)}`),
                        ].join(' ')}
                        fill={clip.muted ? 'rgba(156,163,175,0.25)' : 'rgba(74,222,128,0.3)'}
                      />
                      {rmsWaveform.length > 0 && (
                        <polygon
                          points={[
                            ...rmsWaveform.map((p, i) => `${i},${(0.5 - p * 0.44).toFixed(4)}`),
                            ...[...rmsWaveform].reverse().map((p, i) => `${rmsWaveform.length - 1 - i},${(0.5 + p * 0.44).toFixed(4)}`),
                          ].join(' ')}
                          fill={clip.muted ? 'rgba(156,163,175,0.5)' : 'rgba(74,222,128,0.8)'}
                        />
                      )}
                    </svg>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-gray-600">No waveform data</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Timing
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Start</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={clip.startTime.toFixed(2)}
                onChange={handleStartTimeChange}
                className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-green-500/60 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">End</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={clip.endTime.toFixed(2)}
                onChange={handleEndTimeChange}
                className="w-full bg-gray-700/60 border border-gray-600/60 rounded text-xs text-gray-100 px-2 py-1.5 focus:outline-none focus:border-green-500/60 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 bg-gray-700/30 rounded">
            <span className="text-xs text-gray-500">Duration</span>
            <span className="text-xs font-mono text-gray-300">{formatTime(duration)}</span>
          </div>
          {asset && (
            <div className="flex items-center justify-between px-2 py-1 bg-gray-700/20 rounded">
              <span className="text-xs text-gray-500">Source duration</span>
              <span className="text-xs font-mono text-gray-400">{formatTime(asset.duration)}</span>
            </div>
          )}
        </div>

        {/* Fade In / Fade Out */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Fades</label>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Fade In</span>
                <span className="text-xs font-mono text-gray-400">{(clip.fadeIn ?? 0).toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxFade}
                step="0.01"
                value={clip.fadeIn ?? 0}
                onChange={handleFadeInChange}
                className="w-full accent-green-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Fade Out</span>
                <span className="text-xs font-mono text-gray-400">{(clip.fadeOut ?? 0).toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxFade}
                step="0.01"
                value={clip.fadeOut ?? 0}
                onChange={handleFadeOutChange}
                className="w-full accent-green-500"
              />
            </div>
          </div>
        </div>

        {/* Volume */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Volume</label>
            <span className="text-xs font-mono text-gray-400">{Math.round(track.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={track.volume}
            onChange={handleVolumeChange}
            className="w-full accent-green-500"
          />
        </div>

        {/* Mute / Solo controls */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Controls</label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => updateClip(clip.id, { muted: !clip.muted })}
              title="Mute this clip"
              className={`flex flex-col items-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                clip.muted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/60 hover:text-gray-200'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">Clip</span>
            </button>
            <button
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              title="Mute this track"
              className={`flex flex-col items-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                track.muted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/60 hover:text-gray-200'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">Track</span>
            </button>
            <button
              onClick={() => updateTrack(track.id, { solo: !track.solo })}
              title="Solo this track"
              className={`flex flex-col items-center gap-1 py-1.5 rounded text-xs font-medium transition-colors ${
                track.solo
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-600/60 hover:text-gray-200'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">Solo</span>
            </button>
          </div>
        </div>

        {/* Source file */}
        {asset && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Source File</label>
            <div className="px-2 py-1.5 bg-gray-700/30 rounded">
              <span className="text-xs text-gray-400 truncate block">{asset.fileName}</span>
            </div>
          </div>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 w-full py-2 rounded text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove Clip
        </button>
      </div>
    </div>
  );
};

export default AudioClipPropertiesPanel;
