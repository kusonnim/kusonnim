import { tactileConfig } from '../config/tactile';
import { network } from '../data/network';
import type { EdgeDefinition, NeuronState, Point } from '../types/network';
import { clamp, lerp, limitVector, smoothFactor } from '../utils/geometry';
import { contactControlOffset, distanceToCurve, strandGeometry, sweptCurveContact } from '../utils/strandGeometry';
import type { StrandGeometry } from '../utils/strandGeometry';

interface Grab {
  pointerStart: Point;
  lineContact: Point;
  contactOffset: Point;
  fraction: number;
  pointer: Point;
}

export interface StrandState {
  definition: EdgeDefinition;
  bend: Point;
  pull: Point;
  pullFraction: number;
  grab: Grab | null;
  armed: boolean;
  leftHitRegion: boolean;
  releasedAt: number;
  geometry: StrandGeometry;
}

/** Independent grabs; geometry is shared by the renderer and swept hit detection. */
export class ConnectionInteraction {
  states: StrandState[];
  byId: Map<string, StrandState>;
  private config = tactileConfig.connectionGrab;

  constructor(private nodes: Map<string, NeuronState>, private emit: (edge: EdgeDefinition) => void) {
    this.states = network.edges.map(definition => ({ definition, bend: { x: 0, y: 0 }, pull: { x: 0, y: 0 }, pullFraction: 0.5, grab: null,
      armed: true, leftHitRegion: false, releasedAt: -Infinity,
      geometry: strandGeometry(nodes.get(definition.source)!, nodes.get(definition.target)!, { x: 0, y: 0 }) }));
    this.byId = new Map(this.states.map(state => [state.definition.id, state]));
  }

  get grabbedCount() { return this.states.filter(state => state.grab).length; }

  private release(state: StrandState, now: number, signal: boolean) {
    state.grab = null;
    state.armed = false;
    state.leftHitRegion = false;
    state.releasedAt = now;
    if (signal) this.emit(state.definition);
  }

  cancel(now: number, pointerLeft = false) {
    for (const state of this.states) {
      if (state.grab) this.release(state, now, false);
      if (pointerLeft) state.leftHitRegion = true;
    }
  }

  move(from: Point | null, to: Point, pan: Point, now: number) {
    if (!from || Math.hypot(to.x - from.x, to.y - from.y) < this.config.minimumPointerMovement) return;
    const localFrom = { x: from.x - pan.x, y: from.y - pan.y };
    const localTo = { x: to.x - pan.x, y: to.y - pan.y };
    const nodes = [...this.nodes.values()];
    const insidePreview = nodes.some(node => node.expansion > 0.1 && Math.hypot(localTo.x - node.x, localTo.y - node.y) <= node.radius);
    for (const state of this.states) {
      if (state.grab) {
        state.grab.pointer = { ...to };
        if (Math.hypot(to.x - state.grab.pointerStart.x, to.y - state.grab.pointerStart.y) >= this.config.maxGrabDistance) this.release(state, now, true);
        else if (insidePreview) this.release(state, now, false);
        continue;
      }
      if (!state.armed) {
        const ready = state.leftHitRegion && now - state.releasedAt >= this.config.releaseCooldown;
        state.leftHitRegion ||= distanceToCurve(localTo, state.geometry) > this.config.hitTolerance + this.config.rearmMargin;
        if (!ready) continue;
        state.armed = true;
      }
      if (insidePreview) continue;
      const contact = sweptCurveContact(localFrom, localTo, state.geometry, this.config.hitTolerance);
      if (!contact || contact.lineT < this.config.contactEndInset || contact.lineT > 1 - this.config.contactEndInset) continue;
      // Opaque neurons (especially screenshots) cover any strands behind them.
      if (nodes.some(node => Math.hypot(contact.line.x - node.x, contact.line.y - node.y) < node.radius)) continue;
      const pointerStart = { x: contact.pointer.x + pan.x, y: contact.pointer.y + pan.y };
      state.grab = { pointerStart, lineContact: contact.line,
        contactOffset: { x: contact.line.x - contact.pointer.x, y: contact.line.y - contact.pointer.y },
        fraction: clamp(contact.lineT, this.config.contactEndInset, 1 - this.config.contactEndInset), pointer: { ...to } };
      // A fast swept crossing may already have traveled 35px beyond its contact.
      if (Math.hypot(to.x - pointerStart.x, to.y - pointerStart.y) >= this.config.maxGrabDistance) this.release(state, now, true);
    }
  }

  step(dt: number, pan: Point, reducedMotion: boolean): Map<string, Point> {
    const endpointForces = new Map<string, Point>();
    for (const state of this.states) {
      const source = this.nodes.get(state.definition.source)!, target = this.nodes.get(state.definition.target)!;
      let desiredBend = { x: 0, y: 0 }, desiredPull = { x: 0, y: 0 };
      if (state.grab) {
        const grab = state.grab, t = grab.fraction;
        state.pullFraction = t;
        const desiredPoint = { x: grab.pointer.x - pan.x + grab.contactOffset.x, y: grab.pointer.y - pan.y + grab.contactOffset.y };
        desiredBend = contactControlOffset(source, target, t, desiredPoint, this.config.maxControlOffset);
        desiredPull = { x: (grab.pointer.x - grab.pointerStart.x) * this.config.endpointInfluence,
          y: (grab.pointer.y - grab.pointerStart.y) * this.config.endpointInfluence };
      }
      const factor = reducedMotion ? 1 : smoothFactor(state.grab ? this.config.stretchSmoothing : this.config.releaseSmoothing, dt);
      state.bend.x = lerp(state.bend.x, desiredBend.x, factor);
      state.bend.y = lerp(state.bend.y, desiredBend.y, factor);
      state.pull.x = lerp(state.pull.x, desiredPull.x, factor);
      state.pull.y = lerp(state.pull.y, desiredPull.y, factor);
      for (const [id, weight] of [[state.definition.source, 1 - state.pullFraction], [state.definition.target, state.pullFraction]] as const) {
        const force = endpointForces.get(id) ?? { x: 0, y: 0 };
        force.x += state.pull.x * weight;
        force.y += state.pull.y * weight;
        endpointForces.set(id, force);
      }
    }
    for (const [id, force] of endpointForces) endpointForces.set(id, limitVector(force, this.config.maxEndpointDisplacement));
    return endpointForces;
  }

  updateGeometry() {
    for (const state of this.states) state.geometry = strandGeometry(this.nodes.get(state.definition.source)!, this.nodes.get(state.definition.target)!, state.bend);
  }
}
