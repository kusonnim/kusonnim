import { describe, expect, it } from 'vitest';
import { network } from '../src/data/network';
import { projects } from '../src/data/projects';
import { motionConfig as config } from '../src/config/motion';
import { NetworkSimulation } from '../src/simulation/NetworkSimulation';
import { createSignal, inkAt, reachesEdge, signalProgress } from '../src/utils/signal';
import { constrainPan, keepPreviewVisible, layoutPosition, panLimits, previewRadius } from '../src/utils/geometry';

function simulate(engine: NetworkSimulation, seconds: number) {
  const started = engine.clock;
  for (let frame = 1; frame <= seconds * 60; frame++) engine.step(started + frame * 1000 / 60, 1 / 60);
}

describe('signal propagation', () => {
  it('visits all reachable edges exactly once and never travels backward', () => {
    for (const origin of network.neurons) {
      const wave = createSignal(origin.id, 0, 0);
      const reachable = network.edges.filter(edge => reachesEdge(wave, edge));
      expect(reachable.every(edge => edge.layer >= origin.layer)).toBe(true);
      expect(new Set(reachable.map(edge => edge.id)).size).toBe(reachable.length);
      if (origin.layer === 0) expect(reachable).toHaveLength(85);
      if (origin.layer === 5) expect(reachable).toHaveLength(0);
      expect(reachable.filter(edge => edge.layer === origin.layer).every(edge => edge.source === origin.id)).toBe(true);
    }
  });
  it('makes charged signals stronger and faster, with a strict cap', () => {
    const normal = createSignal('neuron-0-1', 0, 0);
    const charged = createSignal('neuron-0-1', 0, 1);
    const overcharged = createSignal('neuron-0-1', 0, 100);
    expect(charged.duration).toBeLessThan(normal.duration);
    expect(charged.intensity).toBeGreaterThan(normal.intensity);
    expect(overcharged.duration).toBe(charged.duration);
    expect(overcharged.intensity).toBe(charged.intensity);
  });
  it('advances the ink front from source to destination and fades its tail', () => {
    const wave = createSignal('neuron-0-1', 0, 0);
    const edge = network.edges[0];
    expect(signalProgress(wave, edge, wave.duration / 2)).toBeCloseTo(0.5);
    expect(inkAt(0.5, 0.48, wave.tail)).toBeGreaterThan(0.5);
    expect(inkAt(0.5, 0.9, wave.tail)).toBe(0);
    expect(inkAt(0.9, 0.1, wave.tail)).toBe(0);
  });
  it('aggregates incoming paths and activates each downstream neuron once per wave', () => {
    const engine = new NetworkSimulation();
    engine.resize(1280, 500, true);
    engine.emit('neuron-0-1');
    const wave = engine.waves[0];
    engine.step(wave.duration + 1, 0.016);
    expect(wave.arrived.size).toBe(6);
    engine.step(wave.duration * 2 + 1, 0.016);
    expect(wave.arrived.size).toBe(11);
    engine.step(wave.duration * 5 + 1, 0.016);
    expect(wave.arrived.size).toBe(22);
    expect(engine.selected).toBe(null);
  });
  it('gives the output local feedback without outgoing signals', () => {
    const engine = new NetworkSimulation();
    engine.emit('neuron-5-1', 1);
    expect(engine.waves).toHaveLength(0);
    expect(engine.byId.get('neuron-5-1')!.activation).toBeGreaterThan(0);
  });
  it('preserves concurrent waves during selection, charging and closing', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    engine.emit('neuron-0-1');
    engine.emit('neuron-1-1', 0.8);
    const originals = [...engine.waves];
    engine.selected = 'neuron-2-2';
    simulate(engine, 0.5);
    expect(engine.waves).toEqual(originals);
    engine.selected = null;
    simulate(engine, 0.5);
    expect(engine.waves).toHaveLength(2);
  });
  it('bounds extreme repeated input without deleting earlier waves', () => {
    const engine = new NetworkSimulation();
    engine.emit('neuron-0-1');
    const first = engine.waves[0];
    for (let i = 0; i < 3000; i++) engine.emit(network.neurons[i % 21].id);
    expect(engine.waves.length).toBeLessThanOrEqual(config.maxConcurrentSignals);
    expect(engine.waves[0]).toBe(first);
    expect(engine.waves.every(wave => wave.intensity <= config.chargeMaxSignalIntensity)).toBe(true);
  });
});

describe('motion and boundaries', () => {
  it('moves every neuron during idle and remains bounded over time', () => {
    const engine = new NetworkSimulation();
    engine.resize(1280, 600, true);
    simulate(engine, 1);
    const positions = engine.nodes.map(node => ({ x: node.x, y: node.y }));
    simulate(engine, 3);
    expect(engine.nodes.every((node, i) => Math.hypot(node.x - positions[i].x, node.y - positions[i].y) > 0.01)).toBe(true);
    simulate(engine, 120);
    expect(engine.nodes.every(node => Math.hypot(node.x - node.base.x, node.y - node.base.y) < config.idleAmplitude * 1.6)).toBe(true);
  });
  it('disables decorative idle movement for reduced motion', () => {
    const engine = new NetworkSimulation();
    engine.resize(1280, 600, true);
    engine.reducedMotion = true;
    simulate(engine, 4);
    expect(engine.nodes.every(node => node.x === node.base.x && node.y === node.base.y)).toBe(true);
  });
  it('uses local coordinates for pointer influence under pan', () => {
    const engine = new NetworkSimulation();
    engine.resize(1280, 600, true);
    const node = engine.nodes[5];
    engine.pan = { x: 80, y: 0 };
    engine.pointer = { x: node.base.x + 80 - 40, y: node.base.y, vx: 0, vy: 0, active: true };
    simulate(engine, 1);
    expect(node.pointerOffset.x).toBeGreaterThan(3);
    expect(engine.nodes.at(-1)!.pointerOffset.x).toBe(0);
  });
  it('expands to eightfold, displaces neighbors and returns without drift', () => {
    const engine = new NetworkSimulation();
    engine.resize(1000, 600, true);
    engine.selected = 'neuron-2-2';
    simulate(engine, 3);
    const selected = engine.byId.get(engine.selected)!;
    expect(selected.radius).toBeCloseTo(config.baseRadius * 8, 1);
    expect(engine.nodes.some(node => Math.hypot(node.displacement.x, node.displacement.y) > 10)).toBe(true);
    for (const node of engine.nodes.filter(node => node !== selected)) {
      expect(Math.hypot(node.x - selected.x, node.y - selected.y)).toBeGreaterThan(selected.radius + node.radius - 2);
    }
    engine.selected = null;
    simulate(engine, 4);
    expect(engine.nodes.every(node => Math.hypot(node.x - node.base.x, node.y - node.base.y) < 12)).toBe(true);
  });
  it('keeps every selected project and its external label within small viewports', () => {
    for (const size of [[390, 500], [280, 300], [740, 230], [1280, 500]]) {
      const [width, height] = size;
      for (const project of projects) {
        const engine = new NetworkSimulation();
        engine.resize(width, height, true);
        engine.pan = constrainPan({ x: -999, y: 999 }, width, height);
        engine.selected = `neuron-${project.layer}-${project.row}`;
        simulate(engine, 4);
        const node = engine.byId.get(engine.selected)!;
        expect(node.x + engine.pan.x - node.radius).toBeGreaterThanOrEqual(config.viewportPadding - 1);
        expect(node.x + engine.pan.x + node.radius).toBeLessThanOrEqual(width - config.viewportPadding + 1);
        expect(node.y + engine.pan.y - node.radius).toBeGreaterThanOrEqual(config.viewportPadding - 1);
        expect(node.y + engine.pan.y + node.radius + config.previewLabelSpace).toBeLessThanOrEqual(height - config.viewportPadding + 1);
      }
    }
  });
  it('bounds panning and keeps all mobile project positions reachable', () => {
    const width = 320, height = 500;
    const bounds = panLimits(width, height);
    expect(constrainPan({ x: 9999, y: -9999 }, width, height)).toEqual({ x: bounds.x, y: -bounds.y });
    for (const project of projects) {
      const point = layoutPosition(project.layer, project.row, width, height);
      expect(point.x + bounds.x).toBeGreaterThan(0);
      expect(point.x - bounds.x).toBeLessThan(width);
    }
    const radius = previewRadius(12, width, height);
    const point = keepPreviewVisible({ x: -100, y: 900 }, radius, { x: 0, y: 0 }, width, height);
    expect(point.x).toBe(radius + config.viewportPadding);
    expect(point.y + radius + config.previewLabelSpace).toBe(height - config.viewportPadding);
  });
  it('survives repeated expansion, switching and saturated charging with finite positions', () => {
    const engine = new NetworkSimulation();
    engine.resize(390, 450, true);
    for (let round = 0; round < 30; round++) {
      const project = projects[round % projects.length];
      engine.selected = `neuron-${project.layer}-${project.row}`;
      engine.emit('neuron-0-1', 1);
      simulate(engine, 0.2);
      expect(engine.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.radius))).toBe(true);
    }
    engine.selected = null;
    simulate(engine, 8);
    expect(engine.nodes.every(node => Math.hypot(node.x - node.base.x, node.y - node.base.y) < 12)).toBe(true);
    expect(engine.waves).toHaveLength(0);
  });
});
