import { useEffect, useRef, useState } from 'react';
import { NetworkSimulation } from '../simulation/NetworkSimulation';
import { useAnimationLoop } from './useAnimationLoop';
import { SvgRenderer } from '../simulation/SvgRenderer';

export function useNetworkSimulation() {
  const [simulation] = useState(() => new NetworkSimulation());
  const svgRef = useRef<SVGSVGElement>(null);
  const rendererRef = useRef<SvgRenderer | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    rendererRef.current = new SvgRenderer(svg, simulation);
    let initial = true;
    const resize = () => {
      const bounds = svg.getBoundingClientRect();
      simulation.resize(bounds.width, bounds.height, initial);
      initial = false;
      rendererRef.current?.draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(svg);
    resize();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reducedMotion = () => { simulation.reducedMotion = media.matches; };
    reducedMotion();
    media.addEventListener('change', reducedMotion);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', reducedMotion);
      rendererRef.current = null;
    };
  }, [simulation]);

  useAnimationLoop((now, dt) => {
    simulation.step(now, dt);
    rendererRef.current?.draw();
  }, () => {
    simulation.gesture = null;
    simulation.pointer.active = false;
    svgRef.current?.setAttribute('data-gesture', 'idle');
  });
  return { simulation, svgRef };
}
