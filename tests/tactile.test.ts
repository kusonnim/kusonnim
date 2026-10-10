import { describe, expect, it } from 'vitest';
import { network } from '../src/data/network';
import { tactileConfig as config } from '../src/config/tactile';
import { motionConfig } from '../src/config/motion';
import { NetworkSimulation } from '../src/simulation/NetworkSimulation';
import { advancePanGesture, resolveGesture } from '../src/utils/gesture';
import { restingRadius } from '../src/utils/geometry';
import { distanceToCurve, downstreamCurve, quadraticPoint, sweptCurveContact } from '../src/utils/strandGeometry';
import { createConnectionSignal, reachesEdge, signalArrival, signalFinished, signalInkAt, signalProgress } from '../src/utils/signal';
import type { Point } from '../src/types/network';

function run(engine: NetworkSimulation, seconds: number) {
  const started = engine.clock;
  for (let i = 1; i <= seconds * 60; i++) engine.step(started + i * 1000 / 60, 1 / 60);
}

/** Put one input strand away from the other 84, for unambiguous contact tests. */
function strandFixture() {
  const engine = new NetworkSimulation();
  engine.resize(1200, 600, true);
  engine.reducedMotion = true;
  engine.nodes.forEach((node, i) => {
    node.base = { x: 10000 + i * 500, y: 10000 + i * 300 };
    Object.assign(node, node.base);
    node.radius = restingRadius();
  });
  const edge = network.edges[0];
  const source = engine.byId.get(edge.source)!, target = engine.byId.get(edge.target)!;
  source.base = { x: 100, y: 100 }; Object.assign(source, source.base);
  target.base = { x: 300, y: 100 }; Object.assign(target, target.base);
  engine.connections.updateGeometry();
  const state = engine.connections.byId.get(edge.id)!;
  const move = (from: Point, to: Point, now = engine.clock + 16) => {
    engine.clock = now;
    engine.connections.move(from, to, engine.pan, now);
  };
  return { engine, edge, source, target, state, move };
}

describe('strand contact and release', () => {
  it('does not use a large proximity radius or grab a stationary pointer', () => {
    const { state, move } = strandFixture();
    move({ x: 195, y: 107 }, { x: 205, y: 107 });
    expect(state.grab).toBe(null);
    move({ x: 200, y: 100 }, { x: 200, y: 100 });
    expect(state.grab).toBe(null);
  });

  it('grabs on contact, stays attached past old thresholds, and releases at exactly 70px', () => {
    const { engine, edge, state, move } = strandFixture();
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    expect(state.grab?.pointerStart).toEqual({ x: 200, y: 100 });
    expect(state.grab?.lineContact).toEqual({ x: 200, y: 100 });
    move({ x: 200, y: 100 }, { x: 200, y: 120 });
    expect(state.grab).not.toBe(null);
    engine.step(engine.clock + 16, 1 / 60);
    expect(Math.hypot(state.bend.x, state.bend.y)).toBeGreaterThan(20);
    expect(distanceToCurve({ x: 200, y: 120 }, state.geometry)).toBeLessThan(5);
    for (const distance of [35, 45, 69.9]) {
      move({ x: 200, y: 120 }, { x: 200, y: 100 + distance });
      expect(state.grab).not.toBe(null);
      expect(engine.waves).toHaveLength(0);
    }
    move({ x: 200, y: 169.9 }, { x: 200, y: 170 });
    expect(state.grab).toBe(null);
    expect(engine.waves).toHaveLength(1);
    expect(engine.waves[0].edgeOrigin).toBe(edge.id);
    expect(engine.waves[0].contactFraction).toBeCloseTo(0.5);
    expect(engine.byId.get(edge.source)!.activation).toBe(0);
  });

  it.each([[70, 0], [0, 70], [42, 56], [-70, 0], [0, -70], [-42, -56]] as const)('releases for 2D displacement (%s, %s), including parallel movement', (dx, dy) => {
    const { state, engine, move } = strandFixture();
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    move({ x: 200, y: 100 }, { x: 200 + dx, y: 100 + dy });
    expect(state.grab).toBe(null);
    expect(engine.waves).toHaveLength(1);
  });

  it('uses displacement from contact, rather than total travel along a curved gesture', () => {
    const { state, move } = strandFixture();
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    let previous = { x: 200, y: 100 };
    for (let angle = 0; angle < Math.PI * 6; angle += 0.2) {
      const point = { x: 200 + Math.cos(angle) * 20, y: 100 + Math.sin(angle) * 20 };
      move(previous, point);
      expect(state.grab).not.toBe(null);
      previous = point;
    }
    move(previous, { x: 270, y: 100 });
    expect(state.grab).toBe(null);
  });

  it('detects a fast swept crossing even when neither final nor initial point touches', () => {
    const { engine, state, move } = strandFixture();
    move({ x: 200, y: 20 }, { x: 200, y: 170 });
    expect(state.grab).toBe(null);
    expect(state.armed).toBe(false);
    expect(engine.waves).toHaveLength(1);
  });

  it('hit-tests the actual deformed curve instead of the resting chord', () => {
    const { engine, state, move } = strandFixture();
    state.bend = { x: 0, y: 70 };
    engine.connections.updateGeometry();
    const point = quadraticPoint(state.geometry.start, state.geometry.control, state.geometry.end, 0.5);
    expect(point.y).toBeGreaterThan(130);
    const from = { x: point.x, y: point.y - 12 }, to = { x: point.x, y: point.y + 1 };
    expect(sweptCurveContact(from, to, state.geometry, config.connectionGrab.hitTolerance)).not.toBe(null);
    move(from, to);
    expect(state.grab).not.toBe(null);
  });

  it('gathers multiple strands, retains every grab, and releases them independently', () => {
    const { engine, edge, state, target, move } = strandFixture();
    target.base.y = 120; target.y = 120;
    const secondEdge = network.edges[1], second = engine.connections.byId.get(secondEdge.id)!;
    const secondTarget = engine.byId.get(secondEdge.target)!;
    secondTarget.base = { x: 300, y: 160 }; Object.assign(secondTarget, secondTarget.base);
    engine.connections.updateGeometry();
    move({ x: 200, y: 90 }, { x: 200, y: 110 });
    move({ x: 200, y: 110 }, { x: 200, y: 130 });
    expect(state.grab).not.toBe(null);
    expect(second.grab).not.toBe(null);
    expect(engine.connections.grabbedCount).toBe(2);
    const firstContact = state.grab!.fraction, secondContact = second.grab!.fraction;
    move({ x: 200, y: 130 }, { x: 200, y: 181 });
    expect(state.grab).toBe(null);
    expect(second.grab).not.toBe(null);
    expect(engine.waves.map(wave => wave.edgeOrigin)).toEqual([edge.id]);
    const firstWave = engine.waves[0];
    expect(firstWave.contactFraction).toBe(firstContact);
    move({ x: 200, y: 181 }, { x: 200, y: 201 });
    expect(second.grab).toBe(null);
    expect(engine.waves.map(wave => wave.edgeOrigin)).toEqual([edge.id, secondEdge.id]);
    expect(engine.waves[0]).toBe(firstWave);
    expect(engine.waves[1].contactFraction).toBe(secondContact);
  });

  it('requires exit and re-entry after release, even after the cooldown expires', () => {
    const { engine, state, move } = strandFixture();
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    move({ x: 200, y: 100 }, { x: 270, y: 100 });
    move({ x: 270, y: 100 }, { x: 272, y: 100 }, 1000);
    move({ x: 272, y: 100 }, { x: 273, y: 100 }, 1200);
    expect(state.grab).toBe(null);
    expect(engine.waves).toHaveLength(1);
    move({ x: 273, y: 100 }, { x: 200, y: 130 }, 1300);
    move({ x: 200, y: 130 }, { x: 200, y: 100 }, 1400);
    expect(state.grab).not.toBe(null);
  });

  it('cancels without a signal and smoothly restores the geometry', () => {
    const { engine, state, move } = strandFixture();
    engine.reducedMotion = false;
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    move({ x: 200, y: 100 }, { x: 200, y: 120 });
    run(engine, 0.15);
    const bend = Math.hypot(state.bend.x, state.bend.y);
    expect(bend).toBeGreaterThan(5);
    engine.cancelTactile(true);
    expect(state.grab).toBe(null);
    expect(Math.hypot(state.bend.x, state.bend.y)).toBe(bend);
    expect(engine.waves).toHaveLength(0);
    run(engine, 0.4);
    expect(Math.hypot(state.bend.x, state.bend.y)).toBeLessThan(bend * 0.01);
  });

  it('ignores a strand hidden behind an expanded preview', () => {
    const { engine, state, move } = strandFixture();
    const preview = engine.nodes.find(node => node.definition.project)!;
    preview.x = 200; preview.y = 100; preview.radius = 70; preview.expansion = 1;
    move({ x: 200, y: 80 }, { x: 200, y: 100 });
    expect(state.grab).toBe(null);
  });

  it('measures release in CSS viewport pixels under nonzero panning', () => {
    const { engine, state, move } = strandFixture();
    engine.pan = { x: 80, y: -30 };
    move({ x: 280, y: 50 }, { x: 280, y: 70 });
    expect(state.grab?.pointerStart).toEqual({ x: 280, y: 70 });
    move({ x: 280, y: 70 }, { x: 349, y: 70 });
    expect(state.grab).not.toBe(null);
    move({ x: 349, y: 70 }, { x: 350, y: 70 });
    expect(state.grab).toBe(null);
  });
});

describe('released-edge signal routing', () => {
  it('activates only the released seed and its destination, then all reachable later layers', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    const edge = network.edges.find(edge => edge.layer === 2)!;
    engine.emitConnection(edge);
    const wave = engine.waves[0];
    const seeds = network.edges.filter(candidate => candidate.layer === edge.layer && reachesEdge(wave, candidate));
    expect(seeds).toEqual([edge]);
    const next = network.edges.filter(candidate => candidate.layer === edge.layer + 1 && reachesEdge(wave, candidate));
    expect(next).toHaveLength(5);
    expect(next.every(candidate => candidate.source === edge.target)).toBe(true);
    engine.step(wave.duration + 1, 0.016);
    expect(wave.arrived).toEqual(new Set([edge.target]));
    engine.step(wave.duration * 2 + 1, 0.016);
    expect(wave.arrived.size).toBe(6);
    engine.step(wave.duration * 3 + 1, 0.016);
    expect(wave.arrived.size).toBe(7);
    expect(engine.selected).toBe(null);
  });

  it.each([0.15, 0.37, 0.75, 0.9])('starts at contact %s, never lights upstream, and uses the remaining travel time', fraction => {
    const engine = new NetworkSimulation();
    const edge = network.edges.find(edge => edge.layer === 2)!;
    engine.emitConnection(edge, fraction);
    const wave = engine.waves[0];
    expect(signalProgress(wave, edge, wave.started)).toBeCloseTo(fraction);
    expect(signalInkAt(wave, edge, wave.started, fraction)).toBeGreaterThan(0);
    for (const elapsed of [0, 0.1, 0.3, 0.6]) {
      expect(signalInkAt(wave, edge, wave.started + elapsed * wave.duration, fraction - 0.001)).toBe(0);
    }
    expect(wave.arrived.size).toBe(0);
    expect(engine.byId.get(edge.source)!.activation).toBe(0);
    const arrival = signalArrival(wave, edge.layer + 1);
    expect(arrival).toBeCloseTo(wave.started + (1 - fraction) * wave.duration);
    engine.step(arrival - 1, 0.016);
    expect(wave.arrived.size).toBe(0);
    engine.step(arrival, 0.016);
    expect(wave.arrived).toEqual(new Set([edge.target]));
    const nextEdge = network.edges.find(candidate => candidate.source === edge.target)!;
    expect(signalProgress(wave, nextEdge, arrival)).toBeCloseTo(0);
    engine.step(signalArrival(wave, edge.layer + 2), 0.016);
    expect(wave.arrived.size).toBe(6);
    expect(wave.arrived.has(edge.source)).toBe(false);
  });

  it('expires a contact-started signal only after its final downstream tail has faded', () => {
    const edge = network.edges[0];
    const wave = createConnectionSignal(edge, 100, 0.6);
    const end = signalArrival(wave, 5) + wave.tail * wave.duration + motionConfig.signalFadeDuration;
    expect(signalFinished(wave, end - 1)).toBe(false);
    expect(signalFinished(wave, end + 1)).toBe(true);
  });

  it('keeps clipped ink on the original curved strand while it deforms and returns', () => {
    const { engine, state } = strandFixture();
    for (const bend of [{ x: 0, y: 0 }, { x: 70, y: 90 }, { x: -120, y: 40 }]) {
      state.bend = bend;
      engine.connections.updateGeometry();
      const original = state.geometry;
      const fraction = 0.37;
      const clipped = downstreamCurve(original, fraction);
      expect(clipped.start).toEqual(quadraticPoint(original.start, original.control, original.end, fraction));
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const actual = quadraticPoint(clipped.start, clipped.control, clipped.end, t);
        const expected = quadraticPoint(original.start, original.control, original.end, fraction + (1 - fraction) * t);
        expect(actual.x).toBeCloseTo(expected.x);
        expect(actual.y).toBeCloseTo(expected.y);
      }
    }
  });

  it('bounds concurrent mixed seeds without resetting any earlier timeline', () => {
    const engine = new NetworkSimulation();
    engine.emit('neuron-0-1');
    const first = engine.waves[0];
    for (let i = 0; i < 2000; i++) {
      engine.emitConnection(network.edges[i % 85]);
      engine.emit(network.neurons[i % 21].id);
    }
    expect(engine.waves.length).toBeLessThanOrEqual(motionConfig.maxConcurrentSignals);
    expect(engine.waves[0]).toBe(first);
    expect(first.started).toBe(0);
    expect(engine.waves.every(wave => wave.intensity <= motionConfig.chargeMaxSignalIntensity)).toBe(true);
  });

  it('preserves distinct original contact positions when the same edge releases repeatedly', () => {
    const engine = new NetworkSimulation();
    const edge = network.edges[0];
    for (let i = 0; i < 24; i++) engine.emit('neuron-1-1');
    engine.emitConnection(edge, 0.2);
    const first = engine.waves.at(-1)!;
    engine.clock = 200;
    engine.emitConnection(edge, 0.7);
    const second = engine.waves.at(-1)!;
    expect(first).not.toBe(second);
    expect(first.contactFraction).toBe(0.2);
    expect(second.contactFraction).toBe(0.7);
    expect(first.started).toBe(0);
    expect(second.started).toBe(200);
    for (let i = 0; i < 2000; i++) engine.emitConnection(edge, (i % 1000) / 1000);
    expect(engine.waves.length).toBeLessThanOrEqual(motionConfig.maxConcurrentSignals);
    expect(first.contactFraction).toBe(0.2);
    expect(first.started).toBe(0);
  });
});

describe('tactile node motion', () => {
  it('increases desktop and mobile resting diameters by exactly 25%', () => {
    expect(restingRadius(1200)).toBe(motionConfig.baseRadius * 1.25);
    expect(restingRadius(390)).toBe(motionConfig.mobileRadius * 1.25);
  });

  it('gathers neighbors gradually, preserves separation, and returns after release', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    const node = engine.nodes[2];
    const origin = { x: node.base.x + 65, y: node.base.y };
    engine.gesture = { pointerId: 1, nodeId: null, origin, lastPoint: { ...origin }, started: 0, moved: false };
    engine.step(config.gravityWell.holdThreshold - 1, 1 / 60);
    expect(engine.gravityStrength).toBe(0);
    run(engine, 2.5);
    expect(engine.gesture.mode).toBe('gravity');
    expect(engine.gravityStrength).toBeGreaterThan(0.9);
    expect(node.gravityOffset.x).toBeGreaterThan(8);
    expect(Math.abs(node.gravityOffset.y)).toBeLessThan(0.01);
    for (let i = 0; i < engine.nodes.length; i++) for (let j = i + 1; j < engine.nodes.length; j++) {
      const a = engine.nodes[i], b = engine.nodes[j];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius - 1);
    }
    const offset = node.gravityOffset.x;
    engine.gesture = null;
    engine.step(engine.clock + 16, 1 / 60);
    expect(node.gravityOffset.x).toBeGreaterThan(0);
    expect(node.gravityOffset.x).toBeLessThan(offset);
    run(engine, 4);
    expect(node.gravityOffset.x).toBeLessThan(0.01);
    expect(Math.hypot(node.x - node.base.x, node.y - node.base.y)).toBeLessThan(12);
  });

  it('pulls substantially farther and more strongly, with a post-strength displacement cap', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    // Isolate three neighbors so collision packing cannot hide the force comparison.
    engine.nodes.forEach((node, i) => {
      node.base = { x: 10000 + i * 500, y: 10000 + i * 300 };
      Object.assign(node, node.base);
    });
    const origin = { x: 500, y: 300 };
    const near = engine.nodes[0], broad = engine.nodes[1], far = engine.nodes[2];
    for (const [node, point] of [[near, { x: 435, y: 300 }], [broad, { x: 700, y: 300 }], [far, { x: 500, y: 600 }]] as const) {
      node.base = point; Object.assign(node, point);
    }
    engine.gesture = { pointerId: 1, nodeId: null, origin, lastPoint: origin, started: 0, moved: false };
    run(engine, 3);
    expect(engine.gravityStrength).toBeGreaterThan(2.4);
    const oldNearPull = Math.min(48, 65 - near.radius * 1.4) * (1 - 65 / 160);
    // The 65px neighbor stops at the clearance rather than overshooting the hand.
    expect(near.gravityOffset.x).toBeGreaterThan(oldNearPull * 1.6);
    expect(-broad.gravityOffset.x).toBeGreaterThan(110);
    expect(-far.gravityOffset.y).toBeGreaterThan(35);
    expect(Math.abs(far.gravityOffset.y)).toBeLessThan(Math.abs(broad.gravityOffset.x));
    expect(near.x).toBeGreaterThan(near.base.x + oldNearPull * 1.5);
    expect(broad.x).toBeLessThan(broad.base.x - 100);
    for (const node of engine.nodes) {
      expect(Math.hypot(node.gravityOffset.x, node.gravityOffset.y)).toBeLessThanOrEqual(config.gravityWell.maxDisplacement);
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
    }
    const offset = Math.abs(broad.gravityOffset.x);
    engine.gesture = null;
    engine.step(engine.clock + 16, 1 / 60);
    expect(Math.abs(broad.gravityOffset.x)).toBeGreaterThan(0);
    expect(Math.abs(broad.gravityOffset.x)).toBeLessThan(offset);
    run(engine, 5);
    expect(Math.hypot(broad.gravityOffset.x, broad.gravityOffset.y)).toBeLessThan(0.01);
    expect(Math.hypot(broad.x - broad.base.x, broad.y - broad.base.y)).toBeLessThan(12);
  });

  it('locks gravity and panning to separate gestures and preserves long-press release behavior', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    const origin = { x: 500, y: 300 };
    engine.gesture = { pointerId: 1, nodeId: null, origin, lastPoint: { ...origin }, started: 0, moved: false };
    engine.pan = advancePanGesture(engine.gesture, { x: 520, y: 300 }, engine.pan, 1200, 600);
    run(engine, 2);
    expect(engine.gravityStrength).toBe(0);
    expect(engine.gesture.mode).toBe('pan');
    engine.gesture = { pointerId: 1, nodeId: null, origin, lastPoint: { ...origin }, started: engine.clock, moved: false };
    run(engine, 1);
    const pan = { ...engine.pan };
    engine.pan = advancePanGesture(engine.gesture, { x: 540, y: 300 }, engine.pan, 1200, 600);
    expect(engine.pan).toEqual(pan);
    expect(resolveGesture(engine.gesture, 1000)).toBe('cancel');
    engine.gesture = { pointerId: 1, nodeId: null, origin, lastPoint: { ...origin }, started: engine.clock, moved: false };
    expect(resolveGesture(engine.gesture, 500)).toBe('gravity');
    expect(resolveGesture(engine.gesture, 100)).toBe('background');
  });

  it('stores a short directional stirring aftereffect, bounds it, and settles without drift', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    const node = engine.nodes[5];
    const from = { x: node.x - 60, y: node.y + 45 }, to = { x: node.x + 60, y: node.y + 45 };
    engine.stirPointer(from, to);
    expect(node.stirVelocity.x).toBeGreaterThan(50);
    expect(node.stirVelocity.y).toBe(0);
    run(engine, 0.2);
    expect(node.stirOffset.x).toBeGreaterThan(1);
    expect(node.stirOffset.y).toBe(0);
    const velocity = node.stirVelocity.x;
    run(engine, 0.2);
    expect(node.stirVelocity.x).toBeLessThan(velocity);
    for (let i = 0; i < 100; i++) engine.stirPointer(from, to);
    expect(Math.hypot(node.stirVelocity.x, node.stirVelocity.y)).toBeLessThanOrEqual(config.pointerStirring.maxVelocity);
    run(engine, 6);
    expect(Math.hypot(node.stirOffset.x, node.stirOffset.y)).toBeLessThan(0.01);
    expect(Math.hypot(node.x - node.base.x, node.y - node.base.y)).toBeLessThan(12);
  });

  it('aggregates dense strand pulls within limits without deleting independent grabs', () => {
    const engine = new NetworkSimulation();
    engine.resize(1200, 600, true);
    for (const state of engine.connections.states) {
      const point = quadraticPoint(state.geometry.start, state.geometry.control, state.geometry.end, 0.5);
      state.grab = { pointerStart: point, pointer: { x: point.x + 30, y: point.y }, lineContact: point, contactOffset: { x: 0, y: 0 }, fraction: 0.5 };
    }
    run(engine, 2);
    expect(engine.connections.grabbedCount).toBe(85);
    expect(engine.nodes.every(node => Math.hypot(node.strandOffset.x, node.strandOffset.y) <= config.connectionGrab.maxEndpointDisplacement + 0.001)).toBe(true);
    expect(engine.connections.states.every(state => Math.hypot(state.bend.x, state.bend.y) <= config.connectionGrab.maxControlOffset + 0.001)).toBe(true);
    expect(engine.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    engine.cancelTactile();
    run(engine, 4);
    expect(engine.nodes.every(node => Math.hypot(node.strandOffset.x, node.strandOffset.y) < 0.01)).toBe(true);
    expect(engine.nodes.every(node => Math.hypot(node.x - node.base.x, node.y - node.base.y) < 12)).toBe(true);
  });
});
