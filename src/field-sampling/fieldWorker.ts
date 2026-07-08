import { FieldSamplingEngine } from './FieldSamplingEngine';
import type { FieldSampledConfig } from './types';

let engine: FieldSamplingEngine | null = null;

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  switch (msg.type) {
    case 'INIT': {
      try {
        const canvas = msg.canvas as OffscreenCanvas;
        const config = msg.config as FieldSampledConfig;
        engine = new FieldSamplingEngine(canvas, config);
        await engine.initialize();
        self.postMessage({ type: 'READY' });
      } catch (err) {
        self.postMessage({ type: 'ERROR', message: (err as Error).message });
      }
      break;
    }

    case 'CONFIG_UPDATE': {
      if (engine) {
        try {
          await engine.updateConfig(msg.delta);
          self.postMessage({ type: 'CONFIG_APPLIED' });
        } catch (err) {
          self.postMessage({ type: 'ERROR', message: (err as Error).message });
        }
      }
      break;
    }

    case 'FRAME': {
      if (engine) {
        engine.renderFrame(msg.frameNumber, msg.t);
      }
      break;
    }

    case 'DESTROY': {
      if (engine) {
        engine.destroy();
        engine = null;
      }
      self.close();
      break;
    }
  }
};
