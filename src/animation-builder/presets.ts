import { uid } from '../core/factory';
import type { FlowChart, Block, Connection, AnimateBlock, RelativeAnimateBlock, WaitBlock, LoopBlock, PingPongBlock } from './types';
import type { InterpolationType } from '../core/types';

export interface PresetDefinition {
  id: string;
  name: string;
  category: 'intro' | 'idle' | 'outro' | 'effect';
  description: string;
  buildChart: (layerId: string, property: string) => FlowChart;
}

function makeChart(layerId: string, name: string, blocks: Block[], connections: Connection[]): FlowChart {
  return {
    id: uid(),
    name,
    layerId,
    blocks: Object.fromEntries(blocks.map((b) => [b.id, b])),
    connections,
    mode: 'live',
    seed: Math.floor(Math.random() * 2147483647),
    anchorMode: 'clipStart',
  };
}

function chain(blocks: Block[]): Connection[] {
  const conns: Connection[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    conns.push({ id: uid(), from: blocks[i].id, to: blocks[i + 1].id, fromPort: 'bottom', toPort: 'top' });
  }
  return conns;
}

export const PRESETS: PresetDefinition[] = [
  {
    id: 'fade-in',
    name: 'Fade In',
    category: 'intro',
    description: 'Fade from transparent to opaque',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const setOp: Block = { id: uid(), type: 'instantSet', position: { x: 300, y: 120 }, property: 'transform.opacity', value: 0 };
      const animate: Block = { id: uid(), type: 'animate', position: { x: 300, y: 200 }, property: 'transform.opacity', targetValue: 1, duration: 0.5, interpolation: 'bezier' as InterpolationType };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 300 } };
      return makeChart(layerId, 'Fade In', [start, setOp, animate, end], chain([start, setOp, animate, end]));
    },
  },
  {
    id: 'fade-out',
    name: 'Fade Out',
    category: 'outro',
    description: 'Fade from opaque to transparent',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const animate: Block = { id: uid(), type: 'animate', position: { x: 300, y: 120 }, property: 'transform.opacity', targetValue: 0, duration: 0.5, interpolation: 'bezier' as InterpolationType };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 220 } };
      return makeChart(layerId, 'Fade Out', [start, animate, end], chain([start, animate, end]));
    },
  },
  {
    id: 'scale-pop',
    name: 'Scale Pop',
    category: 'intro',
    description: 'Pop in from zero scale with overshoot',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const setScale: Block = { id: uid(), type: 'instantSet', position: { x: 300, y: 120 }, property: 'transform.scale', value: [0, 0] };
      const overshoot: Block = { id: uid(), type: 'animate', position: { x: 300, y: 200 }, property: 'transform.scale', targetValue: [1.15, 1.15], duration: 0.3, interpolation: 'bezier' as InterpolationType };
      const settle: Block = { id: uid(), type: 'animate', position: { x: 300, y: 280 }, property: 'transform.scale', targetValue: [1, 1], duration: 0.15, interpolation: 'bezier' as InterpolationType };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 360 } };
      return makeChart(layerId, 'Scale Pop', [start, setScale, overshoot, settle, end], chain([start, setScale, overshoot, settle, end]));
    },
  },
  {
    id: 'slide-in-left',
    name: 'Slide In Left',
    category: 'intro',
    description: 'Slide in from the left',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const setPos: Block = { id: uid(), type: 'relativeAnimate', position: { x: 300, y: 120 }, property: 'transform.position', delta: [-500, 0], duration: 0, interpolation: 'linear' as InterpolationType };
      const animate: Block = { id: uid(), type: 'relativeAnimate', position: { x: 300, y: 200 }, property: 'transform.position', delta: [500, 0], duration: 0.6, interpolation: 'bezier' as InterpolationType };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 300 } };
      return makeChart(layerId, 'Slide In Left', [start, setPos, animate, end], chain([start, setPos, animate, end]));
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    category: 'idle',
    description: 'Continuous pulsing scale animation',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const upId = uid();
      const downId = uid();
      const up: Block = { id: upId, type: 'animate', position: { x: 300, y: 180 }, property: 'transform.scale', targetValue: [1.1, 1.1], duration: 0.4, interpolation: 'bezier' as InterpolationType };
      const down: Block = { id: downId, type: 'animate', position: { x: 300, y: 260 }, property: 'transform.scale', targetValue: [1, 1], duration: 0.4, interpolation: 'bezier' as InterpolationType };
      const loop: Block = { id: uid(), type: 'loop', position: { x: 300, y: 120 }, iterations: 5, children: [upId, downId] };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 360 } };
      const blocks = [start, loop, up, down, end];
      return makeChart(layerId, 'Pulse', blocks, chain([start, loop, end]));
    },
  },
  {
    id: 'shake',
    name: 'Shake',
    category: 'effect',
    description: 'Random position shake',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const r1Id = uid();
      const r2Id = uid();
      const r1: Block = { id: r1Id, type: 'random', position: { x: 300, y: 180 }, property: 'transform.position', min: -10, max: 10, duration: 0.05, interpolation: 'linear' as InterpolationType };
      const r2: Block = { id: r2Id, type: 'relativeAnimate', position: { x: 300, y: 260 }, property: 'transform.position', delta: [0, 0], duration: 0.05, interpolation: 'linear' as InterpolationType };
      const loop: Block = { id: uid(), type: 'loop', position: { x: 300, y: 120 }, iterations: 10, children: [r1Id, r2Id] };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 360 } };
      return makeChart(layerId, 'Shake', [start, loop, r1, r2, end], chain([start, loop, end]));
    },
  },
  {
    id: 'rotate-continuous',
    name: 'Continuous Rotation',
    category: 'idle',
    description: 'Spin continuously',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const rotId = uid();
      const rot: Block = { id: rotId, type: 'relativeAnimate', position: { x: 300, y: 180 }, property: 'transform.rotation', delta: 360, duration: 2.0, interpolation: 'linear' as InterpolationType };
      const loop: Block = { id: uid(), type: 'loop', position: { x: 300, y: 120 }, iterations: 3, children: [rotId] };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 280 } };
      return makeChart(layerId, 'Continuous Rotation', [start, loop, rot, end], chain([start, loop, end]));
    },
  },
  {
    id: 'breathe',
    name: 'Breathe',
    category: 'idle',
    description: 'Smooth ping-pong opacity pulse',
    buildChart: (layerId) => {
      const start: Block = { id: uid(), type: 'start', position: { x: 300, y: 40 } };
      const fadeId = uid();
      const fade: Block = { id: fadeId, type: 'animate', position: { x: 300, y: 180 }, property: 'transform.opacity', targetValue: 0.5, duration: 1.0, interpolation: 'bezier' as InterpolationType };
      const pp: Block = { id: uid(), type: 'pingPong', position: { x: 300, y: 120 }, iterations: 4, children: [fadeId] };
      const end: Block = { id: uid(), type: 'end', position: { x: 300, y: 300 } };
      return makeChart(layerId, 'Breathe', [start, pp, fade, end], chain([start, pp, end]));
    },
  },
];
