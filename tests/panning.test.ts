import { describe, expect, it } from 'vitest';
import { advancePanGesture, resolveGesture } from '../src/utils/gesture';
import { panLimits } from '../src/utils/geometry';
import type { Gesture, Point } from '../src/types/network';

const width = 1280, height = 600;
const bounds = panLimits(width, height);

function startGesture(nodeId: string | null = null): Gesture {
  return { pointerId: 1, nodeId, started: 0, origin: { x: 500, y: 300 }, lastPoint: { x: 500, y: 300 }, moved: false };
}

describe('incremental bounded panning', () => {
  it.each([
    ['left', 'x', -1], ['right', 'x', 1], ['top', 'y', -1], ['bottom', 'y', 1],
  ] as const)('moves immediately inward after overscrolling the %s boundary', (_, axis, direction) => {
    const gesture = startGesture();
    let pan: Point = { x: 0, y: 0 };
    const point = { ...gesture.origin };
    point[axis] += direction * 300;
    pan = advancePanGesture(gesture, point, pan, width, height);
    expect(pan[axis]).toBe(direction * bounds[axis]);
    point[axis] += direction * 500;
    pan = advancePanGesture(gesture, point, pan, width, height);
    expect(pan[axis]).toBe(direction * bounds[axis]);
    expect(gesture.lastPoint).toEqual(point);
    point[axis] -= direction * 2;
    pan = advancePanGesture(gesture, point, pan, width, height);
    expect(pan[axis]).toBe(direction * (bounds[axis] - 2));
    point[axis] -= direction * 3;
    pan = advancePanGesture(gesture, point, pan, width, height);
    expect(pan[axis]).toBe(direction * (bounds[axis] - 5));
  });

  it('handles diagonal clamps and repeated reversals with independent axes', () => {
    const gesture = startGesture();
    let pan = advancePanGesture(gesture, { x: 1000, y: 800 }, { x: 0, y: 0 }, width, height);
    expect(pan).toEqual(bounds);
    for (let i = 0; i < 50; i++) {
      pan = advancePanGesture(gesture, { x: 2000, y: 1800 }, pan, width, height);
      expect(pan).toEqual(bounds);
      pan = advancePanGesture(gesture, { x: 1999, y: 1798 }, pan, width, height);
      expect(pan).toEqual({ x: bounds.x - 1, y: bounds.y - 2 });
      pan = advancePanGesture(gesture, { x: 2000, y: 1800 }, pan, width, height);
      expect(pan).toEqual(bounds);
    }
    expect(resolveGesture(gesture, 100)).toBe('pan');
  });

  it('does not turn small hand movements into pan or click a node after dragging', () => {
    const gesture = startGesture();
    const pan = { x: 0, y: 0 };
    expect(advancePanGesture(gesture, { x: 502, y: 303 }, pan, width, height)).toBe(pan);
    expect(gesture.lastPoint).toEqual({ x: 502, y: 303 });
    expect(gesture.moved).toBe(false);
    const nodeGesture = startGesture('neuron-2-2');
    expect(advancePanGesture(nodeGesture, { x: 800, y: 300 }, pan, width, height)).toBe(pan);
    expect(resolveGesture(nodeGesture, 100)).toBe('pan');
    expect(resolveGesture(nodeGesture, 1000)).toBe('pan');
  });
});
