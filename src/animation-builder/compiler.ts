import type {
  FlowChart,
  Block,
  CompilerOutput,
  GeneratedKeyframe,
  CompilerError,
  AnimateBlock,
  RelativeAnimateBlock,
  InstantSetBlock,
  WaitBlock,
  LoopBlock,
  PingPongBlock,
  RandomBlock,
  ConditionBlock,
  MacroBlock,
  MacroDefinition,
  PropertyDescriptor,
} from './types';
import type { InterpolationType } from '../core/types';

interface CompilerState {
  tv: number;
  properties: Map<string, number | [number, number]>;
  keyframes: GeneratedKeyframe[];
  errors: CompilerError[];
  seed: number;
  rngState: number;
}

function seededRandom(state: { rngState: number }): number {
  state.rngState = (state.rngState * 1664525 + 1013904223) & 0xffffffff;
  return (state.rngState >>> 0) / 4294967296;
}

function resolveLinearOrder(chart: FlowChart): string[] {
  const startBlock = Object.values(chart.blocks).find((b) => b.type === 'start');
  if (!startBlock) return [];

  const order: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = startBlock.id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const block = chart.blocks[currentId];
    if (!block) break;

    if (block.type !== 'start') {
      order.push(currentId);
    }

    if (block.type === 'end') break;

    const conn = chart.connections.find((c) => c.from === currentId && c.fromPort !== 'true' && c.fromPort !== 'false');
    currentId = conn ? conn.to : null;
  }

  return order;
}

export function compile(
  chart: FlowChart,
  frameRate: number,
  propertyDefaults: Map<string, number | [number, number]>,
  macros?: Map<string, MacroDefinition>,
  conditionContext?: Record<string, unknown>
): CompilerOutput {
  const state: CompilerState = {
    tv: 0,
    properties: new Map(propertyDefaults),
    keyframes: [],
    errors: [],
    seed: chart.seed,
    rngState: chart.seed,
  };

  const blockOrder = resolveLinearOrder(chart);
  compileBlockSequence(blockOrder, chart, state, frameRate, macros ?? new Map(), conditionContext ?? {});

  return {
    keyframes: state.keyframes,
    totalDuration: state.tv,
    errors: state.errors,
  };
}

function compileBlockSequence(
  blockIds: string[],
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  for (const blockId of blockIds) {
    const block = chart.blocks[blockId];
    if (!block || block.type === 'end') continue;
    compileBlock(block, chart, state, frameRate, macros, conditionContext);
  }
}

function compileBlock(
  block: Block,
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  switch (block.type) {
    case 'animate':
      compileAnimate(block, state, frameRate);
      break;
    case 'relativeAnimate':
      compileRelativeAnimate(block, state, frameRate);
      break;
    case 'instantSet':
      compileInstantSet(block, state, frameRate);
      break;
    case 'wait':
      compileWait(block, state, frameRate);
      break;
    case 'loop':
      compileLoop(block, chart, state, frameRate, macros, conditionContext);
      break;
    case 'pingPong':
      compilePingPong(block, chart, state, frameRate, macros, conditionContext);
      break;
    case 'condition':
      compileCondition(block, chart, state, frameRate, macros, conditionContext);
      break;
    case 'random':
      compileRandom(block, state, frameRate);
      break;
    case 'macro':
      compileMacro(block, chart, state, frameRate, macros, conditionContext);
      break;
    default:
      break;
  }
}

function timeToFrame(seconds: number, frameRate: number): number {
  return Math.round(seconds * frameRate);
}

function compileAnimate(block: AnimateBlock, state: CompilerState, frameRate: number): void {
  const { property, targetValue, duration, interpolation } = block;
  const currentValue = state.properties.get(property);
  if (currentValue === undefined) {
    state.errors.push({ blockId: block.id, message: `Unknown property: ${property}` });
    return;
  }

  const startFrame = timeToFrame(state.tv, frameRate);
  const endFrame = timeToFrame(state.tv + duration, frameRate);

  state.keyframes.push({
    property,
    frame: startFrame,
    value: currentValue as number | [number, number],
    interpolation: 'linear',
  });

  state.keyframes.push({
    property,
    frame: endFrame,
    value: targetValue,
    interpolation,
  });

  state.properties.set(property, targetValue);
  state.tv += duration;
}

function compileRelativeAnimate(block: RelativeAnimateBlock, state: CompilerState, frameRate: number): void {
  const { property, delta, duration, interpolation } = block;
  const currentValue = state.properties.get(property);
  if (currentValue === undefined) {
    state.errors.push({ blockId: block.id, message: `Unknown property: ${property}` });
    return;
  }

  const startFrame = timeToFrame(state.tv, frameRate);
  const endFrame = timeToFrame(state.tv + duration, frameRate);

  let finalValue: number | [number, number];
  if (typeof currentValue === 'number' && typeof delta === 'number') {
    finalValue = currentValue + delta;
  } else if (Array.isArray(currentValue) && Array.isArray(delta)) {
    finalValue = [currentValue[0] + delta[0], currentValue[1] + delta[1]];
  } else {
    state.errors.push({ blockId: block.id, message: `Type mismatch for property: ${property}` });
    return;
  }

  state.keyframes.push({
    property,
    frame: startFrame,
    value: currentValue as number | [number, number],
    interpolation: 'linear',
  });

  state.keyframes.push({
    property,
    frame: endFrame,
    value: finalValue,
    interpolation,
  });

  state.properties.set(property, finalValue);
  state.tv += duration;
}

function compileInstantSet(block: InstantSetBlock, state: CompilerState, frameRate: number): void {
  const { property, value } = block;
  const frame = timeToFrame(state.tv, frameRate);

  state.keyframes.push({
    property,
    frame,
    value,
    interpolation: 'hold',
  });

  state.properties.set(property, value);
}

function compileWait(block: WaitBlock, state: CompilerState, frameRate: number): void {
  state.tv += block.duration;
}

function compileLoop(
  block: LoopBlock,
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  for (let i = 0; i < block.iterations; i++) {
    compileBlockSequence(block.children, chart, state, frameRate, macros, conditionContext);
  }
}

function compilePingPong(
  block: PingPongBlock,
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  for (let i = 0; i < block.iterations; i++) {
    if (i % 2 === 0) {
      compileBlockSequence(block.children, chart, state, frameRate, macros, conditionContext);
    } else {
      const reversed = [...block.children].reverse();
      const savedStates = new Map<string, number | [number, number]>();

      for (const childId of reversed) {
        const child = chart.blocks[childId];
        if (!child) continue;

        if (child.type === 'animate') {
          const prev = state.properties.get(child.property);
          if (prev !== undefined) savedStates.set(child.id, prev);
          const invertedBlock: AnimateBlock = {
            ...child,
            targetValue: savedStates.get(child.id) ?? child.targetValue,
          };
          compileAnimate(invertedBlock, state, frameRate);
        } else if (child.type === 'relativeAnimate') {
          const invertedBlock: RelativeAnimateBlock = {
            ...child,
            delta: typeof child.delta === 'number' ? -child.delta : [-child.delta[0], -child.delta[1]],
          };
          compileRelativeAnimate(invertedBlock, state, frameRate);
        } else {
          compileBlock(child, chart, state, frameRate, macros, conditionContext);
        }
      }
    }
  }
}

function compileCondition(
  block: ConditionBlock,
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  const result = evaluateCondition(block.conditionExpression, conditionContext);
  const branch = result ? block.trueBranch : block.falseBranch;
  compileBlockSequence(branch, chart, state, frameRate, macros, conditionContext);
}

function evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
  try {
    const parts = expression.split(/\s*(>|<|>=|<=|==|!=)\s*/);
    if (parts.length === 3) {
      const left = resolveValue(parts[0].trim(), context);
      const op = parts[1].trim();
      const right = resolveValue(parts[2].trim(), context);
      switch (op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==': return left === right;
        case '!=': return left !== right;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function resolveValue(token: string, context: Record<string, unknown>): number {
  const num = Number(token);
  if (!isNaN(num)) return num;
  const val = context[token];
  return typeof val === 'number' ? val : 0;
}

function compileRandom(block: RandomBlock, state: CompilerState, frameRate: number): void {
  const { property, min, max, duration, interpolation } = block;
  const currentValue = state.properties.get(property);
  if (currentValue === undefined) {
    state.errors.push({ blockId: block.id, message: `Unknown property: ${property}` });
    return;
  }

  const startFrame = timeToFrame(state.tv, frameRate);
  const endFrame = timeToFrame(state.tv + duration, frameRate);
  const randomValue = min + seededRandom(state) * (max - min);

  let finalValue: number | [number, number];
  if (typeof currentValue === 'number') {
    finalValue = randomValue;
  } else {
    const rx = min + seededRandom(state) * (max - min);
    const ry = min + seededRandom(state) * (max - min);
    finalValue = [rx, ry];
  }

  state.keyframes.push({
    property,
    frame: startFrame,
    value: currentValue as number | [number, number],
    interpolation: 'linear',
  });

  state.keyframes.push({
    property,
    frame: endFrame,
    value: finalValue,
    interpolation,
  });

  state.properties.set(property, finalValue);
  state.tv += duration;
}

function compileMacro(
  block: MacroBlock,
  chart: FlowChart,
  state: CompilerState,
  frameRate: number,
  macros: Map<string, MacroDefinition>,
  conditionContext: Record<string, unknown>
): void {
  const macro = macros.get(block.macroId);
  if (!macro) {
    state.errors.push({ blockId: block.id, message: `Macro not found: ${block.macroId}` });
    return;
  }

  const expandedChart: FlowChart = {
    ...chart,
    blocks: { ...chart.blocks, ...macro.blocks },
    connections: [...chart.connections, ...macro.connections],
  };

  const macroOrder = resolveLinearOrder({
    ...expandedChart,
    blocks: macro.blocks,
    connections: macro.connections,
  });

  compileBlockSequence(macroOrder, expandedChart, state, frameRate, macros, conditionContext);
}

export function deduplicateKeyframes(keyframes: GeneratedKeyframe[]): GeneratedKeyframe[] {
  const map = new Map<string, GeneratedKeyframe>();
  for (const kf of keyframes) {
    const key = `${kf.property}@${kf.frame}`;
    map.set(key, kf);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.property !== b.property) return a.property.localeCompare(b.property);
    return a.frame - b.frame;
  });
}
