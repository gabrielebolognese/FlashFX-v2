import type { InterpolationType } from '../core/types';

export type BlockType =
  | 'start'
  | 'end'
  | 'animate'
  | 'relativeAnimate'
  | 'instantSet'
  | 'wait'
  | 'loop'
  | 'pingPong'
  | 'condition'
  | 'random'
  | 'macro';

export interface BlockBase {
  id: string;
  type: BlockType;
  position: { x: number; y: number };
  label?: string;
}

export interface StartBlock extends BlockBase {
  type: 'start';
}

export interface EndBlock extends BlockBase {
  type: 'end';
}

export interface AnimateBlock extends BlockBase {
  type: 'animate';
  property: string;
  targetValue: number | [number, number];
  duration: number;
  interpolation: InterpolationType;
}

export interface RelativeAnimateBlock extends BlockBase {
  type: 'relativeAnimate';
  property: string;
  delta: number | [number, number];
  duration: number;
  interpolation: InterpolationType;
}

export interface InstantSetBlock extends BlockBase {
  type: 'instantSet';
  property: string;
  value: number | [number, number];
}

export interface WaitBlock extends BlockBase {
  type: 'wait';
  duration: number;
}

export interface LoopBlock extends BlockBase {
  type: 'loop';
  iterations: number;
  children: string[];
}

export interface PingPongBlock extends BlockBase {
  type: 'pingPong';
  iterations: number;
  children: string[];
}

export interface ConditionBlock extends BlockBase {
  type: 'condition';
  conditionExpression: string;
  trueBranch: string[];
  falseBranch: string[];
}

export interface RandomBlock extends BlockBase {
  type: 'random';
  property: string;
  min: number;
  max: number;
  duration: number;
  interpolation: InterpolationType;
}

export interface MacroBlock extends BlockBase {
  type: 'macro';
  macroId: string;
  parameters: Record<string, number | string>;
}

export type Block =
  | StartBlock
  | EndBlock
  | AnimateBlock
  | RelativeAnimateBlock
  | InstantSetBlock
  | WaitBlock
  | LoopBlock
  | PingPongBlock
  | ConditionBlock
  | RandomBlock
  | MacroBlock;

export type PortSide = 'top' | 'bottom' | 'left' | 'right';

export interface Connection {
  id: string;
  from: string;
  to: string;
  fromPort: PortSide | 'true' | 'false';
  toPort: PortSide;
}

export interface FlowChart {
  id: string;
  name: string;
  layerId: string;
  blocks: Record<string, Block>;
  connections: Connection[];
  mode: 'live' | 'baked';
  seed: number;
  anchorMode: 'absolute' | 'clipStart' | 'clipEnd';
}

export interface MacroDefinition {
  id: string;
  name: string;
  description: string;
  parameters: MacroParameter[];
  blocks: Record<string, Block>;
  connections: Connection[];
}

export interface MacroParameter {
  id: string;
  name: string;
  type: 'number' | 'string' | 'interpolation';
  defaultValue: number | string;
  min?: number;
  max?: number;
}

export interface CompilerOutput {
  keyframes: GeneratedKeyframe[];
  totalDuration: number;
  errors: CompilerError[];
}

export interface GeneratedKeyframe {
  property: string;
  frame: number;
  value: number | [number, number];
  interpolation: InterpolationType;
}

export interface CompilerError {
  blockId: string;
  message: string;
}

export interface PropertyDescriptor {
  path: string;
  name: string;
  valueType: 'number' | 'vec2';
  defaultValue: number | [number, number];
  min?: number;
  max?: number;
}
