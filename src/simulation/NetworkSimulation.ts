import { motionConfig as config } from '../config/motion';
import { tactileConfig } from '../config/tactile';
import { network } from '../data/network';
import type { EdgeDefinition, Gesture, NeuronState, Point } from '../types/network';
import { chargeAt } from '../utils/gesture';
import { clamp, constrainPan, keepPreviewVisible, layoutPosition, lerp, limitVector, previewRadius, restingRadius, smoothFactor } from '../utils/geometry';
import { createConnectionSignal, createSignal, signalFinished } from '../utils/signal';
import type { SignalWave } from '../utils/signal';
import { ConnectionInteraction } from './ConnectionInteraction';
import { projectToSegment } from '../utils/strandGeometry';

/** Pure simulation; React owns semantic state, and the renderer owns SVG writes. */
export class NetworkSimulation {
  width = 1000;
  height = 600;
  pan: Point = { x: 0, y: 0 };
  pointer = { x: -1000, y: -1000, vx: 0, vy: 0, active: false };
  gesture: Gesture | null = null;
  selected: string | null = null;
  hovered: string | null = null;
  reducedMotion = false;
  waves: SignalWave[] = [];
  clock = 0;
  gravityStrength = 0;
  nodes: NeuronState[] = network.neurons.map(definition => ({
    definition, base: { x: 0, y: 0 }, x: 0, y: 0, radius: restingRadius(),
    expansion: 0, charge: 0, activation: 0,
    pointerOffset: { x: 0, y: 0 }, displacement: { x: 0, y: 0 },
    stirOffset: { x: 0, y: 0 }, stirVelocity: { x: 0, y: 0 },
    gravityOffset: { x: 0, y: 0 }, strandOffset: { x: 0, y: 0 },
  }));
  byId = new Map(this.nodes.map(node => [node.definition.id, node]));
  connections = new ConnectionInteraction(this.byId, edge => this.emitConnection(edge));

  resize(width: number, height: number, initial = false) {
    this.width = width;
    this.height = height;
    this.pan = constrainPan(this.pan, width, height);
    for (const node of this.nodes) {
      node.base = layoutPosition(node.definition.layer, node.definition.row, width, height);
      if (initial) { node.x = node.base.x; node.y = node.base.y; }
    }
    this.connections.updateGeometry();
  }

  emit(id: string, charge = 0) {
    const node = this.byId.get(id);
    if (!node) return;
    node.activation = Math.min(1.4, node.activation + 0.72 + charge * 0.5);
    if (node.definition.layer === 5) return;
    const wave = createSignal(id, this.clock, charge);
    this.queueWave(wave);
  }

  emitConnection(edge: EdgeDefinition) {
    const source = this.byId.get(edge.source)!;
    source.activation = Math.min(1.4, source.activation + 0.4);
    this.queueWave(createConnectionSignal(edge, this.clock));
  }

  private queueWave(wave: SignalWave) {
    // Reserve a place for each distinct seed (21 neurons + 85 edges). At extreme
    // rates, only identical seeds aggregate; earlier timelines never reset.
    const seedCount = this.nodes.length - 1 + network.edges.length;
    if (this.waves.length >= config.maxConcurrentSignals - seedCount + 1) {
      const existing = this.waves.slice().reverse().find(item => item.origin === wave.origin && item.edgeOrigin === wave.edgeOrigin);
      if (existing) { existing.intensity = Math.min(config.chargeMaxSignalIntensity, existing.intensity + 0.2); return; }
    }
    this.waves.push(wave);
  }

  cancelTactile(pointerLeft = false) {
    this.connections.cancel(this.clock, pointerLeft);
  }

  stirPointer(from: Point, to: Point) {
    if (this.reducedMotion) return;
    const settings = tactileConfig.pointerStirring;
    for (const node of this.nodes) {
      const screenPoint = { x: node.x + this.pan.x, y: node.y + this.pan.y };
      const contact = projectToSegment(screenPoint, from, to);
      const falloff = Math.max(0, 1 - contact.distance / settings.influenceRadius) ** 2;
      const contactFalloff = Math.min(1, contact.distance / (node.radius * 2));
      const gain = settings.impulseGain * settings.strength * falloff * contactFalloff * (1 - node.expansion * 0.95);
      node.stirVelocity = limitVector({ x: node.stirVelocity.x + (to.x - from.x) * gain,
        y: node.stirVelocity.y + (to.y - from.y) * gain }, settings.maxVelocity);
    }
  }

  step(now: number, dt: number) {
    this.clock = now;
    dt = Math.min(dt, 0.05);
    const slow = this.reducedMotion;
    const positionFactor = slow ? 1 : smoothFactor(config.nodeReturnSmoothing, dt);
    const pointerFactor = smoothFactor(config.pointerSmoothing, dt);
    const expansionFactor = slow ? 1 : smoothFactor(config.expansionSmoothing, dt);
    const baseRadius = restingRadius(this.width);
    const maxPreview = previewRadius(baseRadius, this.width, this.height);
    const targets: Point[] = [];
    const time = now / 1000 * config.idleSpeed;
    const gravity = tactileConfig.gravityWell;
    const backgroundHold = this.gesture && this.gesture.nodeId === null && !this.gesture.moved && this.gesture.mode !== 'pan';
    const elapsedHold = backgroundHold ? now - this.gesture!.started : 0;
    if (backgroundHold && elapsedHold >= gravity.holdThreshold) this.gesture!.mode = 'gravity';
    const gravityTarget = backgroundHold ? clamp((elapsedHold - gravity.holdThreshold) / gravity.buildupDuration, 0, 1) * gravity.maxStrength : 0;
    this.gravityStrength = lerp(this.gravityStrength, gravityTarget, smoothFactor(gravity.smoothing, dt));
    const endpointForces = this.connections.step(dt, this.pan, slow);

    for (const wave of this.waves) {
      for (const node of this.nodes) {
        if (node.definition.layer <= wave.layer || wave.arrived.has(node.definition.id)) continue;
        if (wave.edgeOrigin && node.definition.layer === wave.layer + 1 && node.definition.id !== wave.destination) continue;
        if (now >= wave.started + (node.definition.layer - wave.layer) * wave.duration) {
          wave.arrived.add(node.definition.id);
          node.activation = Math.min(1.4, node.activation + wave.intensity * 0.65);
        }
      }
    }
    this.waves = this.waves.filter(wave => !signalFinished(wave, now));

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const selected = this.selected === node.definition.id;
      const held = this.gesture?.nodeId === node.definition.id && !this.gesture.moved;
      const chargeTarget = held ? chargeAt(now - this.gesture!.started) : 0;
      node.charge = lerp(node.charge, chargeTarget, expansionFactor);
      node.expansion = lerp(node.expansion, selected ? 1 : 0, expansionFactor);
      node.activation *= Math.exp(-config.activationDecay * dt);
      const hover = this.hovered === node.definition.id ? 1.08 : 1;
      const normalRadius = baseRadius * hover * (1 + node.charge * (config.chargeMaxScale - 1) + node.activation * 0.09);
      const selectedRadius = maxPreview * (1 + node.charge * 0.07);
      // Even a charged selected preview must fit within the viewport.
      node.radius = lerp(normalRadius, Math.min(selectedRadius, previewRadius(baseRadius * 1.1, this.width, this.height)), node.expansion);

      const phase = i * 2.39996;
      const amplitude = slow ? 0 : config.idleAmplitude * (1 + node.charge * 0.3) * (1 - node.expansion * 0.78);
      const idleX = amplitude * (Math.sin(time * (0.69 + i * 0.013) + phase) * 0.62 + Math.sin(time * 1.17 + phase * 1.7) * 0.38);
      const idleY = amplitude * (Math.cos(time * (0.81 + i * 0.009) + phase * 1.3) * 0.65 + Math.sin(time * 0.47 + phase) * 0.35);

      const dx = node.x + this.pan.x - this.pointer.x;
      const dy = node.y + this.pan.y - this.pointer.y;
      const distance = Math.hypot(dx, dy);
      // Ease the disturbance inside the circle's immediate contact region so
      // stronger movement does not make a neuron dodge a click or long press.
      const contactFalloff = Math.min(1, distance / (node.radius * 2));
      const influence = this.pointer.active && !slow && !this.gesture ? Math.max(0, 1 - distance / config.pointerRadius) ** 2 * config.mouseInfluence * (1 - node.expansion * 0.85) * contactFalloff : 0;
      const px = (dx / Math.max(1, distance) * config.pointerMaxOffset + clamp(this.pointer.vx * config.pointerVelocityInfluence, -config.pointerMaxVelocityOffset, config.pointerMaxVelocityOffset)) * influence;
      const py = (dy / Math.max(1, distance) * config.pointerMaxOffset + clamp(this.pointer.vy * config.pointerVelocityInfluence, -config.pointerMaxVelocityOffset, config.pointerMaxVelocityOffset)) * influence;
      node.pointerOffset.x = lerp(node.pointerOffset.x, px, pointerFactor);
      node.pointerOffset.y = lerp(node.pointerOffset.y, py, pointerFactor);
      const stirring = tactileConfig.pointerStirring;
      const velocityDecay = Math.exp(-stirring.damping * dt);
      const travel = (1 - velocityDecay) / stirring.damping;
      const returnFactor = Math.exp(-stirring.returnSmoothing * dt);
      node.stirOffset = slow ? { x: 0, y: 0 } : limitVector({ x: (node.stirOffset.x + node.stirVelocity.x * travel) * returnFactor,
        y: (node.stirOffset.y + node.stirVelocity.y * travel) * returnFactor }, stirring.maxDisplacement);
      node.stirVelocity = slow ? { x: 0, y: 0 } : { x: node.stirVelocity.x * velocityDecay, y: node.stirVelocity.y * velocityDecay };
      let gravityOffset = { x: 0, y: 0 };
      if (backgroundHold && this.gravityStrength > 0) {
        const gx = this.gesture!.origin.x - this.pan.x - node.base.x;
        const gy = this.gesture!.origin.y - this.pan.y - node.base.y;
        const distance = Math.hypot(gx, gy);
        const falloff = Math.max(0, 1 - distance / gravity.influenceRadius);
        const amount = Math.min(gravity.maxDisplacement, Math.max(0, distance - node.radius * 1.4)) * falloff * this.gravityStrength * (1 - node.expansion * 0.95);
        gravityOffset = { x: gx / Math.max(1, distance) * amount, y: gy / Math.max(1, distance) * amount };
      }
      const gravityFactor = slow ? 1 : smoothFactor(gravity.smoothing, dt);
      node.gravityOffset.x = lerp(node.gravityOffset.x, gravityOffset.x, gravityFactor);
      node.gravityOffset.y = lerp(node.gravityOffset.y, gravityOffset.y, gravityFactor);
      const strandTarget = endpointForces.get(node.definition.id) ?? { x: 0, y: 0 };
      const strandFactor = slow ? 1 : smoothFactor(tactileConfig.connectionGrab.endpointSmoothing, dt);
      node.strandOffset.x = lerp(node.strandOffset.x, strandTarget.x * (1 - node.expansion * 0.95), strandFactor);
      node.strandOffset.y = lerp(node.strandOffset.y, strandTarget.y * (1 - node.expansion * 0.95), strandFactor);
      let target = { x: node.base.x + idleX + node.pointerOffset.x + node.stirOffset.x + node.gravityOffset.x + node.strandOffset.x,
        y: node.base.y + idleY + node.pointerOffset.y + node.stirOffset.y + node.gravityOffset.y + node.strandOffset.y };
      if (node.expansion > 0.001) {
        const compensated = keepPreviewVisible(target, node.radius, this.pan, this.width, this.height);
        target = { x: lerp(target.x, compensated.x, node.expansion), y: lerp(target.y, compensated.y, node.expansion) };
      }
      targets.push(target);
    }

    // Projected local collisions, solved from base-derived targets each frame.
    // Expanded circles have more mass; no velocity springs or cumulative drift.
    const solved = targets.map(point => ({ ...point }));
    for (let pass = 0; pass < config.collisionPasses; pass++) {
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i], b = this.nodes[j];
          const dx = solved[j].x - solved[i].x, dy = solved[j].y - solved[i].y;
          const distance = Math.hypot(dx, dy);
          const overlap = a.radius + b.radius + config.collisionGap - distance;
          if (overlap <= 0) continue;
          const nx = distance > 0.1 ? dx / distance : (i % 2 ? 1 : -1);
          const ny = distance > 0.1 ? dy / distance : 0;
          const aWeight = this.selected === a.definition.id ? 0 : this.selected === b.definition.id ? 1 : 0.5;
          const bWeight = 1 - aWeight;
          solved[i].x -= nx * overlap * aWeight;
          solved[i].y -= ny * overlap * aWeight;
          solved[j].x += nx * overlap * bWeight;
          solved[j].y += ny * overlap * bWeight;
        }
      }
      const selectedIndex = this.nodes.findIndex(node => node.definition.id === this.selected);
      if (selectedIndex >= 0 && this.nodes[selectedIndex].expansion > 0.2) {
        const selected = this.nodes[selectedIndex];
        const center = solved[selectedIndex];
        const labelHalfWidth = Math.min(110, (selected.definition.project?.name.length ?? 0) * 5.5);
        for (let index = 0; index < this.nodes.length; index++) {
          if (index === selectedIndex) continue;
          const node = this.nodes[index], point = solved[index];
          const labelY = center.y + selected.radius + 23;
          const dx = point.x - center.x, dy = point.y - labelY;
          const horizontalOverlap = labelHalfWidth + node.radius + 5 - Math.abs(dx);
          const verticalOverlap = 14 + node.radius - Math.abs(dy);
          if (horizontalOverlap <= 0 || verticalOverlap <= 0) continue;
          if (horizontalOverlap < verticalOverlap) point.x += (dx >= 0 ? 1 : -1) * horizontalOverlap;
          else point.y += (dy >= 0 ? 1 : -1) * verticalOverlap;
        }
      }
    }
    const displacementFactor = slow ? 1 : smoothFactor(config.displacementSmoothing, dt);
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      node.displacement.x = lerp(node.displacement.x, solved[i].x - targets[i].x, displacementFactor);
      node.displacement.y = lerp(node.displacement.y, solved[i].y - targets[i].y, displacementFactor);
      node.x = lerp(node.x, targets[i].x + node.displacement.x, positionFactor);
      node.y = lerp(node.y, targets[i].y + node.displacement.y, positionFactor);
    }
    this.connections.updateGeometry();
    this.pointer.vx *= Math.exp(-6 * dt);
    this.pointer.vy *= Math.exp(-6 * dt);
  }
}
