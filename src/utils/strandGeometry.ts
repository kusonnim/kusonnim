import type { NeuronState, Point } from '../types/network';
import { clamp, lerp, limitVector } from './geometry';
import { tactileConfig } from '../config/tactile';

export interface StrandGeometry { start: Point; control: Point; end: Point; samples: Point[] }
export interface Contact { pointer: Point; line: Point; pointerT: number; lineT: number; distance: number }

export function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const a = 1 - t;
  return { x: a * a * start.x + 2 * a * t * control.x + t * t * end.x,
    y: a * a * start.y + 2 * a * t * control.y + t * t * end.y };
}

function strandShape(source: NeuronState, target: NeuronState, bend: Point) {
  const control = { x: (source.x + target.x) / 2 + bend.x, y: (source.y + target.y) / 2 + bend.y };
  const ax = control.x - source.x, ay = control.y - source.y;
  const bx = target.x - control.x, by = target.y - control.y;
  const al = Math.max(1, Math.hypot(ax, ay)), bl = Math.max(1, Math.hypot(bx, by));
  const start = { x: source.x + ax / al * Math.min(source.radius, al), y: source.y + ay / al * Math.min(source.radius, al) };
  const end = { x: target.x - bx / bl * Math.min(target.radius, bl), y: target.y - by / bl * Math.min(target.radius, bl) };
  return { start, control, end };
}

export function strandGeometry(source: NeuronState, target: NeuronState, bend: Point): StrandGeometry {
  const { start, control, end } = strandShape(source, target, bend);
  const samples = Array.from({ length: tactileConfig.connectionGrab.curveSegments + 1 }, (_, i) => quadraticPoint(start, control, end, i / tactileConfig.connectionGrab.curveSegments));
  return { start, control, end, samples };
}

/** Account for tangent-trimmed circular endpoints so the strand meets the hand. */
export function contactControlOffset(source: NeuronState, target: NeuronState, fraction: number, desired: Point, maximum: number): Point {
  const straight = strandShape(source, target, { x: 0, y: 0 });
  const weight = 2 * fraction * (1 - fraction);
  let bend = limitVector({ x: (desired.x - lerp(straight.start.x, straight.end.x, fraction)) / weight,
    y: (desired.y - lerp(straight.start.y, straight.end.y, fraction)) / weight }, maximum);
  for (let i = 0; i < 4; i++) {
    const shape = strandShape(source, target, bend);
    const actual = quadraticPoint(shape.start, shape.control, shape.end, fraction);
    bend = limitVector({ x: bend.x + (desired.x - actual.x) / weight,
      y: bend.y + (desired.y - actual.y) / weight }, maximum);
  }
  return bend;
}

export function projectToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-8 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1) : 0;
  const projected = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  return { point: projected, t, distance: Math.hypot(projected.x - point.x, projected.y - point.y) };
}

/** Closest points of a swept pointer segment and one flattened curve segment. */
function segmentContact(a: Point, b: Point, c: Point, d: Point): Contact {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) > 1e-8) {
    const tx = c.x - a.x, ty = c.y - a.y;
    const pointerT = (tx * sy - ty * sx) / denominator;
    const lineT = (tx * ry - ty * rx) / denominator;
    if (pointerT >= 0 && pointerT <= 1 && lineT >= 0 && lineT <= 1) {
      const point = { x: a.x + rx * pointerT, y: a.y + ry * pointerT };
      return { pointer: point, line: { ...point }, pointerT, lineT, distance: 0 };
    }
  }
  const onC = projectToSegment(a, c, d), onD = projectToSegment(b, c, d);
  const onA = projectToSegment(c, a, b), onB = projectToSegment(d, a, b);
  return [
    { pointer: a, line: onC.point, pointerT: 0, lineT: onC.t, distance: onC.distance },
    { pointer: b, line: onD.point, pointerT: 1, lineT: onD.t, distance: onD.distance },
    { pointer: onA.point, line: c, pointerT: onA.t, lineT: 0, distance: onA.distance },
    { pointer: onB.point, line: d, pointerT: onB.t, lineT: 1, distance: onB.distance },
  ].sort((left, right) => left.distance - right.distance || left.pointerT - right.pointerT)[0];
}

export function sweptCurveContact(from: Point, to: Point, geometry: StrandGeometry, tolerance: number): Contact | null {
  // A quadratic stays inside its control-point hull. Skip distant strands before
  // flattening contact tests; fast swept crossings still use the entire segment.
  const { start, control, end } = geometry;
  if (Math.max(from.x, to.x) + tolerance < Math.min(start.x, control.x, end.x)
    || Math.min(from.x, to.x) - tolerance > Math.max(start.x, control.x, end.x)
    || Math.max(from.y, to.y) + tolerance < Math.min(start.y, control.y, end.y)
    || Math.min(from.y, to.y) - tolerance > Math.max(start.y, control.y, end.y)) return null;
  let first: Contact | null = null;
  for (let i = 0; i < geometry.samples.length - 1; i++) {
    const candidate = segmentContact(from, to, geometry.samples[i], geometry.samples[i + 1]);
    if (candidate.distance > tolerance) continue;
    candidate.lineT = (i + candidate.lineT) / (geometry.samples.length - 1);
    if (!first || candidate.pointerT < first.pointerT) first = candidate;
  }
  return first;
}

export function distanceToCurve(point: Point, geometry: StrandGeometry): number {
  let distance = Infinity;
  for (let i = 0; i < geometry.samples.length - 1; i++) distance = Math.min(distance, projectToSegment(point, geometry.samples[i], geometry.samples[i + 1]).distance);
  return distance;
}

export function curvePath(geometry: StrandGeometry): string {
  const { start, control, end } = geometry;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
