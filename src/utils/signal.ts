import { motionConfig as config } from '../config/motion';
import { network } from '../data/network';
import { clamp } from './geometry';
import type { EdgeDefinition } from '../types/network';

export interface SignalWave {
  origin: string;
  layer: number;
  started: number;
  duration: number;
  intensity: number;
  tail: number;
  arrived: Set<string>;
  edgeOrigin?: string;
  destination?: string;
}

export function createConnectionSignal(edge: EdgeDefinition, started: number): SignalWave {
  return { ...createSignal(edge.source, started, 0), edgeOrigin: edge.id, destination: edge.target };
}

export function createSignal(origin: string, started: number, charge: number): SignalWave {
  const node = network.neurons.find(node => node.id === origin);
  if (!node) throw new Error(`Unknown signal origin: ${origin}`);
  charge = clamp(charge, 0, 1);
  return {
    origin, layer: node.layer, started,
    duration: config.signalLayerDuration * (0.15 / config.signalSpeed) / (1 + charge * (config.chargeMaxSignalSpeed - 1)),
    intensity: 0.72 + charge * (config.chargeMaxSignalIntensity - 0.72),
    tail: config.signalTail + charge * 0.15,
    arrived: new Set([origin]),
  };
}

/** Every reachable edge is visited once per wave, rather than once per path. */
export function reachesEdge(wave: SignalWave, edge: EdgeDefinition): boolean {
  if (wave.edgeOrigin) {
    if (edge.layer === wave.layer) return edge.id === wave.edgeOrigin;
    if (edge.layer === wave.layer + 1) return edge.source === wave.destination;
    return edge.layer > wave.layer + 1;
  }
  return edge.layer > wave.layer || (edge.layer === wave.layer && edge.source === wave.origin);
}

export function signalProgress(wave: SignalWave, edge: EdgeDefinition, now: number): number {
  return (now - wave.started) / wave.duration - (edge.layer - wave.layer);
}

export function inkAt(progress: number, position: number, tail: number): number {
  const behind = progress - position;
  if (behind < -0.08 || behind > tail) return 0;
  const leading = clamp((behind + 0.08) / 0.12, 0, 1);
  const trailing = clamp(1 - Math.max(0, behind) / tail, 0, 1);
  return leading * trailing * trailing;
}

export function signalFinished(wave: SignalWave, now: number): boolean {
  return now - wave.started > (5 - wave.layer + wave.tail) * wave.duration + config.signalFadeDuration;
}
