import { motionConfig as config } from '../config/motion';
import { clamp } from './geometry';
import type { Gesture, GestureResult, Point } from '../types/network';

export function movedBeyondSlop(origin: Point, point: Point): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) > config.gestureSlop;
}

export function chargeAt(elapsed: number): number {
  const progress = clamp((elapsed - config.longPressThreshold) / (config.chargeDuration - config.longPressThreshold), 0, 1);
  return 1 - (1 - progress) ** 2;
}

export function resolveGesture(gesture: Gesture, elapsed: number, canceled = false): GestureResult {
  if (canceled) return 'cancel';
  if (gesture.moved) return 'pan';
  if (gesture.nodeId === null) return 'background';
  return elapsed >= config.longPressThreshold ? 'charge' : 'activate';
}
