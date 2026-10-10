import { motionConfig as config } from '../config/motion';
import { tactileConfig } from '../config/tactile';
import type { Point } from '../types/network';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothFactor = (rate: number, seconds: number) => 1 - Math.exp(-rate * seconds);

export function limitVector(point: Point, maximum: number): Point {
  const length = Math.hypot(point.x, point.y);
  const scale = length > maximum ? maximum / length : 1;
  return { x: point.x * scale, y: point.y * scale };
}

export function restingRadius(width = 1000): number {
  return (width < 600 ? config.mobileRadius : config.baseRadius) * tactileConfig.neuronSizeMultiplier;
}

export function layoutPosition(layer: number, row: number, width: number, height: number): Point {
  const sceneWidth = Math.max(config.minimumNetworkWidth, width);
  const horizontalInset = Math.max(44, Math.min(100, sceneWidth * 0.07));
  const verticalInset = Math.max(48, Math.min(86, height * 0.135));
  const horizontalSpan = (sceneWidth - horizontalInset * 2) * config.horizontalSpacingScale;
  const verticalSpan = (height - verticalInset * 2) * config.verticalSpacingScale;
  return {
    x: width / 2 + (layer / 5 - 0.5) * horizontalSpan,
    y: layer === 0 || layer === 5 ? height / 2 : height / 2 + ((row - 1) / 4 - 0.5) * verticalSpan,
  };
}

export function panLimits(width: number, height: number): Point {
  return {
    x: Math.max(config.panBounds.x, (config.minimumNetworkWidth - width) / 2 + 48),
    y: Math.min(config.panBounds.y, height * 0.15),
  };
}

export function constrainPan(point: Point, width: number, height: number): Point {
  const bounds = panLimits(width, height);
  return { x: clamp(point.x, -bounds.x, bounds.x), y: clamp(point.y, -bounds.y, bounds.y) };
}

export function previewRadius(baseRadius: number, width: number, height: number): number {
  return Math.max(baseRadius, Math.min(baseRadius * config.projectScale,
    (width - config.viewportPadding * 2) / 2,
    (height - config.viewportPadding * 2 - config.previewLabelSpace) / 2));
}

export function keepPreviewVisible(point: Point, radius: number, pan: Point, width: number, height: number): Point {
  const padding = config.viewportPadding;
  return {
    x: clamp(point.x + pan.x, radius + padding, width - radius - padding) - pan.x,
    y: clamp(point.y + pan.y, radius + padding, height - radius - padding - config.previewLabelSpace) - pan.y,
  };
}
