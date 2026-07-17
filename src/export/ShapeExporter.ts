import { toPng } from 'html-to-image';
import { DesignElement } from '../types/design';

export class ShapeExporter {
  async exportShape(
    element: DesignElement,
    canvasWidth: number,
    canvasHeight: number,
    allElements: DesignElement[]
  ): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const pixelRatio = 2;

    canvas.width = canvasWidth * pixelRatio;
    canvas.height = canvasHeight * pixelRatio;

    const ctx = canvas.getContext('2d', { alpha: true });

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const domElement = document.querySelector(
      `[data-element-id="${element.id}"]`
    ) as HTMLElement;

    if (!domElement) {
      throw new Error(`Element ${element.id} not found in DOM`);
    }

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-99999px';
    tempContainer.style.top = '-99999px';
    tempContainer.style.width = `${canvasWidth}px`;
    tempContainer.style.height = `${canvasHeight}px`;
    tempContainer.style.backgroundColor = 'transparent';
    tempContainer.style.overflow = 'visible';

    const clonedElement = domElement.cloneNode(true) as HTMLElement;

    clonedElement.style.position = 'absolute';
    clonedElement.style.left = `${element.x}px`;
    clonedElement.style.top = `${element.y}px`;
    clonedElement.style.margin = '0';
    clonedElement.style.padding = '0';

    tempContainer.appendChild(clonedElement);
    document.body.appendChild(tempContainer);

    try {
      const dataUrl = await toPng(tempContainer, {
        cacheBust: true,
        backgroundColor: 'transparent',
        pixelRatio,
        width: canvasWidth,
        height: canvasHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      document.body.removeChild(tempContainer);

      const response = await fetch(dataUrl);
      return response.blob();
    } catch (error) {
      document.body.removeChild(tempContainer);
      console.error(`Failed to export shape ${element.name}:`, error);
      throw new Error(`Failed to export shape: ${element.name}`);
    }
  }

  async exportShapeIsolated(
    element: DesignElement
  ): Promise<Blob> {
    const domElement = document.querySelector(
      `[data-element-id="${element.id}"]`
    ) as HTMLElement;

    if (!domElement) {
      throw new Error(`Element ${element.id} not found in DOM`);
    }

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-99999px';
    tempContainer.style.top = '-99999px';
    tempContainer.style.width = `${element.width}px`;
    tempContainer.style.height = `${element.height}px`;
    tempContainer.style.backgroundColor = 'transparent';
    tempContainer.style.overflow = 'visible';

    const clonedElement = domElement.cloneNode(true) as HTMLElement;

    clonedElement.style.position = 'absolute';
    clonedElement.style.left = '0';
    clonedElement.style.top = '0';
    clonedElement.style.transform = 'none';
    clonedElement.style.margin = '0';
    clonedElement.style.padding = '0';

    tempContainer.appendChild(clonedElement);
    document.body.appendChild(tempContainer);

    try {
      const pixelRatio = 2;
      const dataUrl = await toPng(tempContainer, {
        cacheBust: true,
        backgroundColor: 'transparent',
        pixelRatio,
        width: element.width,
        height: element.height,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      document.body.removeChild(tempContainer);

      const response = await fetch(dataUrl);
      return response.blob();
    } catch (error) {
      document.body.removeChild(tempContainer);
      console.error(`Failed to export isolated shape ${element.name}:`, error);
      throw new Error(`Failed to export shape: ${element.name}`);
    }
  }
}
