import { useMemo } from 'react';
import { useEditorStore } from '../store/editor';
import type { FieldSampledConfig } from './types';

export interface FieldOverlapWarning {
  show: boolean;
  activeCount: number;
  estimatedSamples: number;
  severity: 'warning' | 'critical';
}

const EMPTY_WARNING: FieldOverlapWarning = { show: false, activeCount: 0, estimatedSamples: 0, severity: 'warning' };

export function useFieldOverlapWarning(): FieldOverlapWarning {
  const composition = useEditorStore((s) => s.composition);
  const currentFrame = useEditorStore((s) => s.currentFrame);

  return useMemo(() => {
    const fieldLayers = composition.layers.filter(
      (l) => l.type === 'fieldSampled' && l.visible && currentFrame >= l.inPoint && currentFrame < l.outPoint
    );

    if (fieldLayers.length < 2) return EMPTY_WARNING;

    let totalEstimatedSamples = 0;
    for (const layer of fieldLayers) {
      try {
        const config: FieldSampledConfig = JSON.parse((layer as any).fieldSampled?.configJSON || '{}');
        totalEstimatedSamples += estimateSampleCount(config);
      } catch {
        totalEstimatedSamples += 10000;
      }
    }

    return {
      show: true,
      activeCount: fieldLayers.length,
      estimatedSamples: totalEstimatedSamples,
      severity: totalEstimatedSamples > 300_000 ? 'critical' : 'warning',
    };
  }, [composition.layers, currentFrame]);
}

function estimateSampleCount(config: FieldSampledConfig): number {
  const w = config.canvasWidth || 600;
  const h = config.canvasHeight || 800;
  const sampler = config.sampler;

  switch (sampler.type) {
    case 'grid': {
      const cols = Math.ceil(w / sampler.cellSize);
      const rows = Math.ceil(h / sampler.cellSize);
      return cols * rows;
    }
    case 'scanline': {
      const lines = Math.ceil(h / sampler.lineSpacing);
      const segsPerLine = Math.ceil(w / sampler.dashMaxLength);
      return lines * segsPerLine;
    }
    case 'offsetBundle': {
      return sampler.copyCount * 80;
    }
  }
}
