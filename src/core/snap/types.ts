export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapLine {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: 'edge' | 'center' | 'canvas-edge' | 'canvas-center' | 'grid' | 'guideline';
}

export interface SnapOutput {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

export interface GuidelineInput {
  axis: 'vertical' | 'horizontal';
  position: number;
  visible: boolean;
}

export interface SnapTarget {
  axis: 'x' | 'y';
  value: number;
  kind: SnapLine['kind'];
  from: number;
  to: number;
}
