// Keyframe property extraction + selection resolution, shared by the KeyframeTimeline component and
// global hotkeys (F9 easy-ease in App.tsx). Kept out of the component file so both can import it
// without tripping react-refresh's only-export-components rule.
import { useEditorStore, type KeyframeTarget } from '../../store/editor';
import type { Layer, AnimatableProperty, ShapeLayer, TextLayer, AudioLayer } from '../../core/types';
import type { KeyframeMenuContext } from '../context-menu/menuDefinitions';

export interface PropertyTrack {
  id: string;
  name: string;
  propertyPath: string;
  property: AnimatableProperty;
  groupId: string;
}

export interface PropertyGroup {
  id: string;
  name: string;
  tracks: PropertyTrack[];
}

export function extractAnimatableProperties(layer: Layer): PropertyGroup[] {
  const groups: PropertyGroup[] = [];

  const transformGroup: PropertyGroup = {
    id: 'transform',
    name: 'Transform',
    tracks: [
      { id: 'pos', name: 'Position', propertyPath: 'transform.position', property: layer.transform.position, groupId: 'transform' },
      { id: 'rot', name: 'Rotation', propertyPath: 'transform.rotation', property: layer.transform.rotation, groupId: 'transform' },
      { id: 'scale', name: 'Scale', propertyPath: 'transform.scale', property: layer.transform.scale, groupId: 'transform' },
      { id: 'anchor', name: 'Anchor Point', propertyPath: 'transform.anchorPoint', property: layer.transform.anchorPoint, groupId: 'transform' },
      { id: 'opacity', name: 'Opacity', propertyPath: 'transform.opacity', property: layer.transform.opacity, groupId: 'transform' },
    ],
  };
  // When position dimensions are separated, its keyframes live on per-axis sub-curves; hide the
  // combined Position track (per-axis timeline/graph editing is a follow-up - edit X/Y in the Inspector).
  if (layer.transform.position.separated) transformGroup.tracks = transformGroup.tracks.filter((t) => t.id !== 'pos');
  groups.push(transformGroup);

  if (layer.type === 'shape') {
    const sl = layer as ShapeLayer;
    const shapeGroup: PropertyGroup = { id: 'shape', name: 'Shape', tracks: [] };

    switch (sl.shape.type) {
      case 'rectangle':
        shapeGroup.tracks.push(
          { id: 'sh_w', name: 'Width', propertyPath: 'shape.width', property: sl.shape.width, groupId: 'shape' },
          { id: 'sh_h', name: 'Height', propertyPath: 'shape.height', property: sl.shape.height, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
          { id: 'sh_br', name: 'Border Radius', propertyPath: 'shape.borderRadius', property: sl.shape.borderRadius, groupId: 'shape' },
        );
        break;
      case 'circle':
        shapeGroup.tracks.push(
          { id: 'sh_r', name: 'Radius', propertyPath: 'shape.radius', property: sl.shape.radius, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
      case 'star':
        shapeGroup.tracks.push(
          { id: 'sh_pts', name: 'Points', propertyPath: 'shape.points', property: sl.shape.points, groupId: 'shape' },
          { id: 'sh_or', name: 'Outer Radius', propertyPath: 'shape.outerRadius', property: sl.shape.outerRadius, groupId: 'shape' },
          { id: 'sh_ir', name: 'Inner Radius', propertyPath: 'shape.innerRadius', property: sl.shape.innerRadius, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
      case 'polygon':
        shapeGroup.tracks.push(
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
    }
    if (shapeGroup.tracks.length > 0) groups.push(shapeGroup);
  }

  if (layer.type === 'text') {
    const tl = layer as TextLayer;
    const textGroup: PropertyGroup = {
      id: 'text',
      name: 'Text Style',
      tracks: [
        { id: 'tx_fs', name: 'Font Size', propertyPath: 'animOverrides.fontSize', property: tl.animOverrides.fontSize, groupId: 'text' },
        { id: 'tx_lh', name: 'Line Height', propertyPath: 'animOverrides.lineHeight', property: tl.animOverrides.lineHeight, groupId: 'text' },
        { id: 'tx_ls', name: 'Letter Spacing', propertyPath: 'animOverrides.letterSpacing', property: tl.animOverrides.letterSpacing, groupId: 'text' },
        { id: 'tx_sw', name: 'Stroke Width', propertyPath: 'animOverrides.strokeWidth', property: tl.animOverrides.strokeWidth, groupId: 'text' },
      ],
    };
    groups.push(textGroup);
  }

  if (layer.type === 'audio') {
    const al = layer as AudioLayer;
    const audioGroup: PropertyGroup = {
      id: 'audio',
      name: 'Audio',
      tracks: [
        { id: 'au_vol', name: 'Volume', propertyPath: 'audio.volume', property: al.audio.volume, groupId: 'audio' },
        { id: 'au_pitch', name: 'Pitch', propertyPath: 'audio.pitch', property: al.audio.pitch, groupId: 'audio' },
      ],
    };
    groups.push(audioGroup);
  }

  return groups;
}

// Resolve the current keyframe selection (ids of the form `${trackId}_${frame}`) into
// (layerId, propertyPath, frame) targets. Reads the store fresh (pointerdown selects before a
// contextmenu or hotkey fires). Used by the keyframe context menu and the F9 easy-ease hotkey.
export function resolveKeyframeContext(): KeyframeMenuContext | undefined {
  const ed = useEditorStore.getState();
  const layer = ed.composition.layers.find((l) => l.id === ed.selection.activeId);
  if (!layer) return undefined;
  const idToPath = new Map<string, string>();
  for (const g of extractAnimatableProperties(layer)) {
    for (const t of g.tracks) idToPath.set(t.id, t.propertyPath);
  }
  const targets: KeyframeTarget[] = [];
  for (const keyId of ed.selection.selectedKeyframes) {
    const us = keyId.lastIndexOf('_'); // trackId may contain '_', frame is the numeric suffix
    if (us < 0) continue;
    const path = idToPath.get(keyId.slice(0, us));
    const frame = Number(keyId.slice(us + 1));
    if (path && Number.isFinite(frame)) targets.push({ propertyPath: path, frame });
  }
  return { layerId: layer.id, targets };
}
