import type { Vec2 } from '../core/types';

export interface ExpressionDef {
  code: string;
  enabled: boolean;
  error: string | null;
}

export interface KeyframeData {
  frame: number;
  value: number | Vec2;
}

export interface ExpressionContext {
  frame: number;
  fps: number;
  time: number;
  value: number | Vec2;
  index: number;
  duration: number;
  width: number;
  height: number;
  layerInPoint: number;
  layerOutPoint: number;
  keyframes: KeyframeData[];
  propertyPath: string;
}

export interface WorkerEvalRequest {
  type: 'eval';
  id: string;
  code: string;
  context: ExpressionContext;
}

export interface WorkerValidateRequest {
  type: 'validate';
  id: string;
  code: string;
}

export type WorkerInbound = WorkerEvalRequest | WorkerValidateRequest;

export interface WorkerEvalSuccess {
  type: 'eval-result';
  id: string;
  value: number | Vec2;
}

export interface WorkerEvalError {
  type: 'eval-error';
  id: string;
  error: string;
}

export interface WorkerValidateResult {
  type: 'validate-result';
  id: string;
  error: string | null;
}

export type WorkerOutbound = WorkerEvalSuccess | WorkerEvalError | WorkerValidateResult;

export type ExpressionValue = number | Vec2;
