import { DesignElement } from '../types/design';
import { CanvasExporter } from './CanvasExporter';
import { ShapeExporter } from './ShapeExporter';
import { ZipExporter } from './ZipExporter';
import { MP4ExportPipeline, MP4ExportConfig, MP4ExportProgress } from './MP4ExportPipeline';
import { BackgroundConfig } from '../types/background';
import { ElementAnimation } from '../animation-engine/types';

export interface ExportProgress {
  current: number;
  total: number;
  status: 'idle' | 'exporting' | 'completed' | 'error';
  message: string;
  error?: string;
}

export type ExportMode = 'canvas' | 'zip' | 'selection' | 'stacked' | 'video';

export interface ExportConfig {
  mode: ExportMode;
  projectName: string;
  canvasWidth: number;
  canvasHeight: number;
  customWidth?: number;
  customHeight?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export class ExportManager {
  private canvasExporter: CanvasExporter;
  private shapeExporter: ShapeExporter;
  private zipExporter: ZipExporter;
  private progressCallback?: (progress: ExportProgress) => void;
  private mp4Pipeline: MP4ExportPipeline | null = null;

  constructor() {
    this.canvasExporter = new CanvasExporter();
    this.shapeExporter = new ShapeExporter();
    this.zipExporter = new ZipExporter();
  }

  setProgressCallback(callback: (progress: ExportProgress) => void) {
    this.progressCallback = callback;
  }

  private getAllElementsFlat(elements: DesignElement[]): DesignElement[] {
    const result: DesignElement[] = [];
    for (const element of elements) {
      result.push(element);
      if (element.type === 'group' && element.children && element.children.length > 0) {
        result.push(...this.getAllElementsFlat(element.children));
      }
    }
    return result;
  }

  private getAllChildIds(element: DesignElement): string[] {
    if (element.type !== 'group' || !element.children || element.children.length === 0) {
      return [];
    }
    const childIds: string[] = [];
    for (const child of element.children) {
      childIds.push(child.id);
      if (child.type === 'group' && child.children) {
        childIds.push(...this.getAllChildIds(child));
      }
    }
    return childIds;
  }

  private findDomElementById(elementId: string): HTMLElement | null {
    return document.querySelector(`[data-element-id="${elementId}"]`);
  }

  private collectDomElements(elementIds: string[]): Map<string, { element: HTMLElement; originalOpacity: string }> {
    const domElements = new Map<string, { element: HTMLElement; originalOpacity: string }>();
    for (const id of elementIds) {
      const domEl = this.findDomElementById(id);
      if (domEl) {
        domElements.set(id, {
          element: domEl,
          originalOpacity: domEl.style.opacity || '1'
        });
      }
    }
    return domElements;
  }

  private setDomOpacity(domElements: Map<string, { element: HTMLElement; originalOpacity: string }>, targetIds: Set<string>, originalOpacities: Map<string, number>): void {
    for (const [id, { element }] of domElements) {
      if (targetIds.has(id)) {
        const originalOpacity = originalOpacities.get(id) ?? 1;
        element.style.opacity = String(originalOpacity);
      } else {
        element.style.opacity = '0';
      }
    }
  }

  private restoreDomOpacities(domElements: Map<string, { element: HTMLElement; originalOpacity: string }>): void {
    for (const [, { element, originalOpacity }] of domElements) {
      element.style.opacity = originalOpacity;
    }
  }

  private updateProgress(progress: Partial<ExportProgress>) {
    if (this.progressCallback) {
      const currentProgress: ExportProgress = {
        current: progress.current || 0,
        total: progress.total || 0,
        status: progress.status || 'idle',
        message: progress.message || '',
        error: progress.error
      };
      this.progressCallback(currentProgress);
    }
  }

  async exportCanvas(config: ExportConfig, elements: DesignElement[]): Promise<void> {
    try {
      this.updateProgress({
        status: 'exporting',
        current: 0,
        total: 1,
        message: 'Exporting entire canvas...'
      });

      const width = config.customWidth || config.canvasWidth;
      const height = config.customHeight || config.canvasHeight;
      const format = config.format || 'png';

      await this.canvasExporter.exportFullCanvas(
        elements,
        width,
        height,
        format,
        config.projectName,
        config.quality
      );

      this.updateProgress({
        status: 'completed',
        current: 1,
        total: 1,
        message: 'Canvas exported successfully'
      });
    } catch (error) {
      this.updateProgress({
        status: 'error',
        current: 0,
        total: 1,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async exportShapesAsZip(
    config: ExportConfig,
    elements: DesignElement[]
  ): Promise<void> {
    try {
      const visibleShapes = elements.filter(el => el.visible && el.type !== 'group');
      const total = visibleShapes.length;

      if (total === 0) {
        throw new Error('No visible shapes to export');
      }

      this.updateProgress({
        status: 'exporting',
        current: 0,
        total,
        message: 'Starting export...'
      });

      const exportedBlobs: { name: string; blob: Blob }[] = [];

      for (let i = 0; i < visibleShapes.length; i++) {
        const shape = visibleShapes[i];

        this.updateProgress({
          status: 'exporting',
          current: i,
          total,
          message: `Exporting shape ${i + 1}/${total}: ${shape.name}`
        });

        const blob = await this.shapeExporter.exportShape(
          shape,
          config.canvasWidth,
          config.canvasHeight,
          elements
        );

        const fileName = `${config.projectName}_shape_${String(i).padStart(2, '0')}.png`;
        exportedBlobs.push({ name: fileName, blob });
      }

      this.updateProgress({
        status: 'exporting',
        current: total,
        total,
        message: 'Creating ZIP file...'
      });

      await this.zipExporter.createAndDownloadZip(
        exportedBlobs,
        `${config.projectName}_shapes.zip`
      );

      this.updateProgress({
        status: 'completed',
        current: total,
        total,
        message: `Successfully exported ${total} shapes`
      });
    } catch (error) {
      this.updateProgress({
        status: 'error',
        current: 0,
        total: 0,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async exportSelection(
    config: ExportConfig,
    selectedElements: DesignElement[],
    allElements: DesignElement[]
  ): Promise<void> {
    if (selectedElements.length === 0) {
      throw new Error('No elements selected');
    }

    if (selectedElements.length === 1) {
      try {
        this.updateProgress({
          status: 'exporting',
          current: 0,
          total: 1,
          message: `Exporting ${selectedElements[0].name}...`
        });

        const blob = await this.shapeExporter.exportShape(
          selectedElements[0],
          config.canvasWidth,
          config.canvasHeight,
          allElements
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedElements[0].name}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.updateProgress({
          status: 'completed',
          current: 1,
          total: 1,
          message: 'Export completed'
        });
      } catch (error) {
        this.updateProgress({
          status: 'error',
          current: 0,
          total: 1,
          message: 'Export failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    } else {
      const total = selectedElements.length;

      try {
        this.updateProgress({
          status: 'exporting',
          current: 0,
          total,
          message: 'Starting export...'
        });

        const exportedBlobs: { name: string; blob: Blob }[] = [];

        for (let i = 0; i < selectedElements.length; i++) {
          const shape = selectedElements[i];

          this.updateProgress({
            status: 'exporting',
            current: i,
            total,
            message: `Exporting ${i + 1}/${total}: ${shape.name}`
          });

          const blob = await this.shapeExporter.exportShape(
            shape,
            config.canvasWidth,
            config.canvasHeight,
            allElements
          );

          const fileName = `${shape.name}.png`;
          exportedBlobs.push({ name: fileName, blob });
        }

        this.updateProgress({
          status: 'exporting',
          current: total,
          total,
          message: 'Creating ZIP file...'
        });

        await this.zipExporter.createAndDownloadZip(
          exportedBlobs,
          `${config.projectName}_selection.zip`
        );

        this.updateProgress({
          status: 'completed',
          current: total,
          total,
          message: `Successfully exported ${total} elements`
        });
      } catch (error) {
        this.updateProgress({
          status: 'error',
          current: 0,
          total,
          message: 'Export failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
  }

  async exportShapesStacked(
    config: ExportConfig,
    elements: DesignElement[]
  ): Promise<void> {
    const allElementsFlat = this.getAllElementsFlat(elements);

    const visibleLayers = elements.filter(el => el.visible);
    const total = visibleLayers.length;

    if (total === 0) {
      throw new Error('No visible layers to export');
    }

    const originalOpacities = new Map<string, number>();
    allElementsFlat.forEach(el => {
      originalOpacities.set(el.id, el.opacity);
    });

    const elementIds = allElementsFlat.map(el => el.id);
    const domElements = this.collectDomElements(elementIds);

    try {
      this.updateProgress({
        status: 'exporting',
        current: 0,
        total,
        message: 'Starting stacked export...'
      });

      const exportedBlobs: { name: string; blob: Blob }[] = [];
      const width = config.customWidth || config.canvasWidth;
      const height = config.customHeight || config.canvasHeight;

      for (let i = 0; i < visibleLayers.length; i++) {
        const targetLayer = visibleLayers[i];

        this.updateProgress({
          status: 'exporting',
          current: i,
          total,
          message: `Exporting layer ${i + 1}/${total}: ${targetLayer.name}`
        });

        const targetIds = new Set<string>([targetLayer.id]);
        if (targetLayer.type === 'group') {
          this.getAllChildIds(targetLayer).forEach(id => targetIds.add(id));
        }

        this.setDomOpacity(domElements, targetIds, originalOpacities);

        await new Promise(resolve => requestAnimationFrame(resolve));

        const blob = await this.canvasExporter.captureCanvasAsBlob(width, height);

        const fileName = `layer_${i + 1}.png`;
        exportedBlobs.push({ name: fileName, blob });
      }

      this.restoreDomOpacities(domElements);

      this.updateProgress({
        status: 'exporting',
        current: total,
        total,
        message: 'Creating ZIP file...'
      });

      await this.zipExporter.createAndDownloadZip(
        exportedBlobs,
        `${config.projectName}_stacked_layers.zip`
      );

      this.updateProgress({
        status: 'completed',
        current: total,
        total,
        message: `Successfully exported ${total} layers`
      });
    } catch (error) {
      this.restoreDomOpacities(domElements);
      this.updateProgress({
        status: 'error',
        current: 0,
        total: 0,
        message: 'Export failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async exportMP4(
    config: MP4ExportConfig,
    elements: DesignElement[],
    animations: Record<string, ElementAnimation>,
    background?: BackgroundConfig,
    onProgress?: (progress: MP4ExportProgress) => void
  ): Promise<Blob> {
    this.mp4Pipeline = new MP4ExportPipeline();
    try {
      return await this.mp4Pipeline.export(config, elements, animations, background, onProgress);
    } finally {
      this.mp4Pipeline = null;
    }
  }

  cancelMP4Export() {
    this.mp4Pipeline?.abort();
  }

  estimateTime(elementCount: number): number {
    const secondsPerElement = 0.5;
    return Math.ceil(elementCount * secondsPerElement);
  }

  estimateVideoRenderTime(duration: number, fps: number): number {
    const totalFrames = Math.ceil(duration * fps);
    return Math.ceil(totalFrames * 0.1);
  }
}
