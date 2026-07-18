import type { Layer } from '../core/types';
import type { PropertyDescriptor } from './types';

export function discoverProperties(layer: Layer): PropertyDescriptor[] {
  const props: PropertyDescriptor[] = [];

  props.push(
    { path: 'transform.position', name: 'Position', valueType: 'vec2', defaultValue: layer.transform.position.defaultValue as [number, number] },
    { path: 'transform.rotation', name: 'Rotation', valueType: 'number', defaultValue: layer.transform.rotation.defaultValue as number, min: -360, max: 360 },
    { path: 'transform.scale', name: 'Scale', valueType: 'vec2', defaultValue: layer.transform.scale.defaultValue as [number, number] },
    { path: 'transform.opacity', name: 'Opacity', valueType: 'number', defaultValue: layer.transform.opacity.defaultValue as number, min: 0, max: 1 },
    { path: 'transform.anchorPoint', name: 'Anchor Point', valueType: 'vec2', defaultValue: layer.transform.anchorPoint.defaultValue as [number, number] }
  );

  if (layer.type === 'shape') {
    const s = layer.shape;
    if (s.type === 'rectangle') {
      props.push(
        { path: 'shape.width', name: 'Width', valueType: 'number', defaultValue: s.width.defaultValue as number, min: 1 },
        { path: 'shape.height', name: 'Height', valueType: 'number', defaultValue: s.height.defaultValue as number, min: 1 },
        { path: 'shape.borderRadius', name: 'Border Radius', valueType: 'number', defaultValue: s.borderRadius.defaultValue as number, min: 0 },
        { path: 'shape.strokeWidth', name: 'Stroke Width', valueType: 'number', defaultValue: s.strokeWidth.defaultValue as number, min: 0 }
      );
    } else if (s.type === 'circle') {
      props.push(
        { path: 'shape.radius', name: 'Radius', valueType: 'number', defaultValue: s.radius.defaultValue as number, min: 1 },
        { path: 'shape.strokeWidth', name: 'Stroke Width', valueType: 'number', defaultValue: s.strokeWidth.defaultValue as number, min: 0 }
      );
    } else if (s.type === 'star') {
      props.push(
        { path: 'shape.outerRadius', name: 'Outer Radius', valueType: 'number', defaultValue: s.outerRadius.defaultValue as number, min: 1 },
        { path: 'shape.innerRadius', name: 'Inner Radius', valueType: 'number', defaultValue: s.innerRadius.defaultValue as number, min: 1 },
        { path: 'shape.points', name: 'Points', valueType: 'number', defaultValue: s.points.defaultValue as number, min: 3, max: 50 },
        { path: 'shape.strokeWidth', name: 'Stroke Width', valueType: 'number', defaultValue: s.strokeWidth.defaultValue as number, min: 0 }
      );
    }
  }

  if (layer.type === 'text') {
    props.push(
      { path: 'animOverrides.fontSize', name: 'Font Size', valueType: 'number', defaultValue: layer.animOverrides.fontSize.defaultValue as number, min: 1 },
      { path: 'animOverrides.lineHeight', name: 'Line Height', valueType: 'number', defaultValue: layer.animOverrides.lineHeight.defaultValue as number, min: 0.5, max: 5 },
      { path: 'animOverrides.letterSpacing', name: 'Letter Spacing', valueType: 'number', defaultValue: layer.animOverrides.letterSpacing.defaultValue as number },
      { path: 'animOverrides.strokeWidth', name: 'Stroke Width', valueType: 'number', defaultValue: layer.animOverrides.strokeWidth.defaultValue as number, min: 0 }
    );
  }

  if (layer.type === 'audio') {
    props.push(
      { path: 'audio.volume', name: 'Volume', valueType: 'number', defaultValue: layer.audio.volume.defaultValue as number, min: 0, max: 2 },
      { path: 'audio.pitch', name: 'Pitch', valueType: 'number', defaultValue: layer.audio.pitch.defaultValue as number, min: -24, max: 24 }
    );
  }

  return props;
}

export function getPropertyDefaultMap(layer: Layer): Map<string, number | [number, number]> {
  const descriptors = discoverProperties(layer);
  const map = new Map<string, number | [number, number]>();
  for (const d of descriptors) {
    map.set(d.path, d.defaultValue);
  }
  return map;
}
