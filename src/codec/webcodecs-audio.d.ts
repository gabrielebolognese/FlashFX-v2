// Minimal ambient declarations for the WebCodecs *audio* APIs used by the export
// mixer. This project's TS lib exposes the WebCodecs video types (VideoEncoder,
// VideoFrame, …) but not the audio ones, and @types/dom-webcodecs is installed
// but not enabled via tsconfig `types`. Declaring only what we use here avoids
// changing global type configuration or duplicating the video declarations.

type AudioSampleFormat =
  | 'u8' | 's16' | 's32' | 'f32'
  | 'u8-planar' | 's16-planar' | 's32-planar' | 'f32-planar';

interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

interface AudioEncoderSupport {
  supported: boolean;
  config: AudioEncoderConfig;
}

interface AudioDataInit {
  format: AudioSampleFormat;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: BufferSource;
}

declare class AudioData {
  constructor(init: AudioDataInit);
  readonly format: AudioSampleFormat | null;
  readonly sampleRate: number;
  readonly numberOfFrames: number;
  readonly numberOfChannels: number;
  readonly duration: number;
  readonly timestamp: number;
  close(): void;
}

interface EncodedAudioChunkMetadata {
  decoderConfig?: {
    codec: string;
    sampleRate: number;
    numberOfChannels: number;
    description?: BufferSource;
  };
}

declare class EncodedAudioChunk {
  readonly type: 'key' | 'delta';
  readonly timestamp: number;
  readonly duration: number | null;
  readonly byteLength: number;
}

interface AudioEncoderInit {
  output: (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;
  error: (error: DOMException) => void;
}

declare class AudioEncoder {
  constructor(init: AudioEncoderInit);
  readonly encodeQueueSize: number;
  readonly state: 'unconfigured' | 'configured' | 'closed';
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
  static isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport>;
}
