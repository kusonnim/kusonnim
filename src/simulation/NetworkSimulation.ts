import { motionConfig as config } from '../config/motion';
import { network } from '../data/network';
import type { Gesture, NeuronState, Point } from '../types/network';
import { chargeAt } from '../utils/gesture';
import { clamp, constrainPan, keepPreviewVisible, layoutPosition, lerp, previewRadius, smoothFactor } from '../utils/geometry';
import { createSignal, signalFinished } from '../utils/signal';
import type { SignalWave } from '../utils/signal';

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
  nodes: NeuronState[] = network.neurons.map(definition => ({
    definition, base: { x: 0, y: 0 }, x: 0, y: 0, radius: config.baseRadius,
    expansion: 0, charge: 0, activation: 0,
    pointerOffset: { x: 0, y: 0 }, displacement: { x: 0, y: 0 },
  }));
  byId = new Map(this.nodes.map(node => [node.definition.id, node]));

  resize(width: number, height: number, initial = false) {
    this.width = width;
    this.height = height;
    this.pan = constrainPan(this.pan, width, height);
    for (const node of this.nodes) {
      node.base = layoutPosition(node.definition.layer, node.definition.row, width, height);
      if (initial) { node.x = node.base.x; node.y = node.base.y; }
    }
  }

  emit(id: string, charge = 0) {
    const node = this.byId.get(id);
    if (!node) return;
    node.activation = Math.min(1.4, node.activation + 0.72 + charge * 0.5);
    if (node.definition.layer === 5) return;
    const wave = createSignal(id, this.clock, charge);
    // At extreme input rates, aggregate a new impulse at its origin, preserving
    // every earlier wave's timeline. Normal interactions remain independent.
    if (this.waves.length >= config.maxConcurrentSignals - (this.nodes.length - 2)) {
      const existing = this.waves.slice().reverse().find(item => item.origin === id);
      if (existing) { existing.intensity = Math.min(config.chargeMaxSignalIntensity, existing.intensity + 0.2); return; }
    }
    this.waves.push(wave);
  }

  step(now: number, dt: number) {
    this.clock = now;
    dt = Math.min(dt, 0.05);
    const slow = this.reducedMotion;
    const positionFactor = slow ? 1 : smoothFactor(config.nodeReturnSmoothing, dt);
    const pointerFactor = smoothFactor(config.pointerSmoothing, dt);
    const expansionFactor = slow ? 1 : smoothFactor(config.expansionSmoothing, dt);
    const baseRadius = this.width < 600 ? config.mobileRadius : config.baseRadius;
    const maxPreview = previewRadius(baseRadius, this.width, this.height);
    const targets: Point[] = [];
    const time = now / 1000 * config.idleSpeed;

    for (const wave of this.waves) {
      for (const node of this.nodes) {
        if (node.definition.layer <= wave.layer || wave.arrived.has(node.definition.id)) continue;
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
      const influence = this.pointer.active && !slow ? Math.max(0, 1 - distance / config.pointerRadius) ** 2 * config.mouseInfluence * (1 - node.expansion * 0.85) : 0;
      const px = (dx / Math.max(1, distance) * config.pointerMaxOffset + clamp(this.pointer.vx * 0.02, -12, 12)) * influence;
      const py = (dy / Math.max(1, distance) * config.pointerMaxOffset + clamp(this.pointer.vy * 0.02, -12, 12)) * influence;
      node.pointerOffset.x = lerp(node.pointerOffset.x, px, pointerFactor);
      node.pointerOffset.y = lerp(node.pointerOffset.y, py, pointerFactor);
      let target = { x: node.base.x + idleX + node.pointerOffset.x, y: node.base.y + idleY + node.pointerOffset.y };
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
    this.pointer.vx *= Math.exp(-6 * dt);
    this.pointer.vy *= Math.exp(-6 * dt);
  }
}
