import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { NetworkSimulation } from '../simulation/NetworkSimulation';
import { advancePanGesture, chargeAt, movedBeyondSlop, resolveGesture } from '../utils/gesture';

export function usePointerInteraction(simulation: NetworkSimulation, svgRef: RefObject<SVGSVGElement | null>) {
  const [selected, setSelected] = useState<string | null>(null);
  const lastPointer = useRef({ x: 0, y: 0, time: 0 });
  const boundsRef = useRef({ left: 0, top: 0 });
  const keyboardPress = useRef<{ id: string; started: number; key: string } | null>(null);

  const select = useCallback((id: string | null) => {
    simulation.selected = id;
    setSelected(id);
    if (id && svgRef.current) {
      const group = svgRef.current.querySelector<SVGGElement>(`[data-node="${id}"]`);
      const wasFocused = document.activeElement === group;
      // Paint the selected preview last, so its complete circle receives input.
      group?.parentNode?.appendChild(group);
      if (wasFocused) group?.focus({ preventScroll: true });
    }
  }, [simulation, svgRef]);

  const activate = useCallback((id: string) => {
    const node = simulation.byId.get(id);
    if (!node) return;
    if (!node.definition.project) simulation.emit(id);
    else if (simulation.selected === id) window.open(node.definition.project.url, '_blank', 'noopener,noreferrer');
    else select(id);
  }, [simulation, select]);

  const cancel = useCallback(() => {
    simulation.gesture = null;
    keyboardPress.current = null;
    svgRef.current?.setAttribute('data-gesture', 'idle');
  }, [simulation, svgRef]);

  useEffect(() => {
    let outsidePress: { x: number; y: number; pointerId: number } | null = null;
    const outsideDown = (event: globalThis.PointerEvent) => {
      if (event.isPrimary && event.button === 0 && !(event.target as Element).closest('.network')) {
        outsidePress = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }
    };
    const outsideUp = (event: globalThis.PointerEvent) => {
      if (outsidePress?.pointerId === event.pointerId && !movedBeyondSlop(outsidePress, { x: event.clientX, y: event.clientY })) select(null);
      outsidePress = null;
    };
    const outsideCancel = () => { outsidePress = null; };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { cancel(); select(null); }
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    document.addEventListener('pointerdown', outsideDown);
    document.addEventListener('pointerup', outsideUp);
    document.addEventListener('pointercancel', outsideCancel);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('pointerdown', outsideDown);
      document.removeEventListener('pointerup', outsideUp);
      document.removeEventListener('pointercancel', outsideCancel);
    };
  }, [cancel, select]);

  const getPoint = (event: PointerEvent<SVGSVGElement>) => ({ x: event.clientX - boundsRef.current.left, y: event.clientY - boundsRef.current.top });

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || simulation.gesture) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    boundsRef.current = { left: bounds.left, top: bounds.top };
    const element = (event.target as Element).closest<SVGGElement>('[data-node]');
    const id = element?.dataset.node ?? null;
    const point = getPoint(event);
    lastPointer.current = { ...point, time: event.timeStamp };
    simulation.gesture = { pointerId: event.pointerId, nodeId: id, started: simulation.clock, origin: point, lastPoint: { ...point }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute('data-gesture', id ? 'pointer-down' : 'panning');
    element?.focus({ preventScroll: true });
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = getPoint(event);
    const now = event.timeStamp;
    const elapsed = Math.max(16, now - lastPointer.current.time);
    simulation.pointer = { ...point, active: event.pointerType !== 'touch' || !!simulation.gesture, vx: (point.x - lastPointer.current.x) / elapsed * 1000, vy: (point.y - lastPointer.current.y) / elapsed * 1000 };
    lastPointer.current = { ...point, time: now };
    const gesture = simulation.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    simulation.pan = advancePanGesture(gesture, point, simulation.pan, simulation.width, simulation.height);
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const gesture = simulation.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.moved ||= movedBeyondSlop(gesture.origin, getPoint(event));
    const elapsed = simulation.clock - gesture.started;
    const result = resolveGesture(gesture, elapsed);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch') { simulation.pointer.active = false; simulation.hovered = null; }
    if (result === 'background') select(null);
    else if (result === 'charge') simulation.emit(gesture.nodeId!, Math.max(0.08, chargeAt(elapsed)));
    else if (result === 'activate') activate(gesture.nodeId!);
  };

  const onPointerEnter = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    boundsRef.current = { left: bounds.left, top: bounds.top };
  };

  const onKeyDown = (id: string, event: KeyboardEvent<SVGGElement>) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat || keyboardPress.current || simulation.gesture) return;
    keyboardPress.current = { id, started: simulation.clock, key: event.key };
    simulation.gesture = { pointerId: -1, nodeId: id, started: simulation.clock, origin: { x: 0, y: 0 }, lastPoint: { x: 0, y: 0 }, moved: false };
  };

  const onKeyUp = (id: string, event: KeyboardEvent<SVGGElement>) => {
    const press = keyboardPress.current;
    if (!press || press.id !== id || press.key !== event.key) return;
    event.preventDefault();
    const elapsed = simulation.clock - press.started;
    const gesture = simulation.gesture;
    cancel();
    if (!gesture) return;
    if (resolveGesture(gesture, elapsed) === 'charge') simulation.emit(id, Math.max(0.08, chargeAt(elapsed)));
    else activate(id);
  };

  return {
    selected, select, cancel, onKeyDown, onKeyUp,
    onBlur: (id: string) => { if (keyboardPress.current?.id === id) cancel(); },
    hover: (id: string | null) => { simulation.hovered = id; },
    sceneEvents: {
      onPointerDown, onPointerMove, onPointerUp, onPointerEnter,
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onPointerLeave: () => { simulation.pointer.active = false; simulation.hovered = null; },
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    },
  };
}
