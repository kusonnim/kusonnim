import { motionConfig as config } from '../config/motion';
import { clamp, constrainPan } from './geometry';
import type { Gesture, GestureResult, Point } from '../types/network';

export function movedBeyondSlop(origin: Point, point: Point): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) > config.gestureSlop;
}

/** Consume every delta, including clamped moves, so reversal has no overscroll debt. */
export function advancePanGesture(gesture: Gesture, point: Point, pan: Point, width: number, height: number): Point {
  const delta = { x: point.x - gesture.lastPoint.x, y: point.y - gesture.lastPoint.y };
  gesture.lastPoint = { ...point };
  gesture.moved ||= movedBeyondSlop(gesture.origin, point);
  if (!gesture.moved || gesture.nodeId !== null) return pan;
  return constrainPan({ x: pan.x + delta.x, y: pan.y + delta.y }, width, height);
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
