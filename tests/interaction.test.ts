import { describe, expect, it } from 'vitest';
import { chargeAt, movedBeyondSlop, resolveGesture } from '../src/utils/gesture';
import { motionConfig as config } from '../src/config/motion';
import type { Gesture } from '../src/types/network';

const gesture: Gesture = { pointerId: 1, nodeId: 'neuron-2-2', started: 0, origin: { x: 0, y: 0 }, lastPoint: { x: 0, y: 0 }, moved: false };

describe('gesture transitions', () => {
  it('distinguishes short activation from long-press release', () => {
    expect(resolveGesture(gesture, 120)).toBe('activate');
    expect(resolveGesture(gesture, config.longPressThreshold)).toBe('charge');
    expect(resolveGesture(gesture, 3000)).toBe('charge');
  });
  it('never activates or navigates on cancellation or dragging', () => {
    expect(resolveGesture(gesture, 100, true)).toBe('cancel');
    expect(resolveGesture(gesture, 3000, true)).toBe('cancel');
    expect(resolveGesture({ ...gesture, moved: true }, 100)).toBe('pan');
    expect(resolveGesture({ ...gesture, moved: true }, 3000)).toBe('pan');
  });
  it('closes on an empty-space click, but preserves selection during a pan', () => {
    expect(resolveGesture({ ...gesture, nodeId: null }, 100)).toBe('background');
    expect(resolveGesture({ ...gesture, nodeId: null, moved: true }, 500)).toBe('pan');
  });
  it('builds continuous, monotonic charge and caps both time and intensity', () => {
    expect(chargeAt(100)).toBe(0);
    expect(chargeAt(config.longPressThreshold)).toBe(0);
    let previous = 0;
    for (let time = 0; time < 5000; time += 50) {
      const charge = chargeAt(time);
      expect(charge).toBeGreaterThanOrEqual(previous);
      expect(charge).toBeLessThanOrEqual(1);
      previous = charge;
    }
    expect(chargeAt(config.chargeDuration)).toBe(1);
    expect(chargeAt(1e9)).toBe(1);
  });
  it('tolerates hand tremor while rejecting deliberate movement', () => {
    expect(movedBeyondSlop({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(false);
    expect(movedBeyondSlop({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(true);
  });
});
