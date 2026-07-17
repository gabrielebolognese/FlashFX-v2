export interface AudioAsset {
  id: string;
  fileName: string;
  duration: number;
  waveform: number[];
  rmsWaveform: number[];
}

export interface AudioClip {
  id: string;
  assetId: string;
  startTime: number;
  endTime: number;
  offset: number;
  trackId: string;
  muted: boolean;
  name: string;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioTrack {
  id: string;
  name: string;
  clipIds: string[];
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface AudioState {
  assets: Record<string, AudioAsset>;
  clips: Record<string, AudioClip>;
  tracks: Record<string, AudioTrack>;
  trackOrder: string[];
}

export type AudioAction =
  | { type: 'ADD_ASSET'; asset: AudioAsset }
  | { type: 'REMOVE_ASSET'; assetId: string }
  | { type: 'ADD_TRACK'; track: AudioTrack }
  | { type: 'ADD_CLIP'; clip: AudioClip }
  | { type: 'UPDATE_CLIP'; clipId: string; updates: Partial<AudioClip> }
  | { type: 'REMOVE_CLIP'; clipId: string }
  | { type: 'UPDATE_TRACK'; trackId: string; updates: Partial<AudioTrack> }
  | { type: 'REMOVE_TRACK'; trackId: string };
