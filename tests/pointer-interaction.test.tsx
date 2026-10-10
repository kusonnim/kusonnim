// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePointerInteraction } from '../src/hooks/usePointerInteraction';
import { NetworkSimulation } from '../src/simulation/NetworkSimulation';
import { SvgRenderer } from '../src/simulation/SvgRenderer';
import { Connection, ConnectionGradient } from '../src/components/Connection';
import { Neuron } from '../src/components/Neuron';
import { network } from '../src/data/network';
import { motionConfig as config } from '../src/config/motion';
import { panLimits } from '../src/utils/geometry';

let root: Root;
let container: HTMLDivElement;
let svg: SVGSVGElement;
let simulation: NetworkSimulation;

function Harness() {
  const ref = createRef<SVGSVGElement>();
  const interaction = usePointerInteraction(simulation, ref);
  return <svg ref={ref} className="network" {...interaction.sceneEvents}>
    <defs>{network.edges.map(edge => <ConnectionGradient key={edge.id} edge={edge} />)}</defs>
    <g data-scene>
      {network.edges.map(edge => <Connection key={edge.id} edge={edge} />)}
      <g>{network.neurons.map(node => <Neuron key={node.id} node={node}
        selected={interaction.selected === node.id}
        onKeyDown={event => interaction.onKeyDown(node.id, event)}
        onKeyUp={event => interaction.onKeyUp(node.id, event)}
        onBlur={() => interaction.onBlur(node.id)}
        onHover={hovered => interaction.hover(hovered ? node.id : null)} />)}</g>
    </g>
  </svg>;
}

/** Dispatch browser-shaped input through the actual React handlers, for both pointer types. */
function pointer(type: string, target: Element, x: number, y: number, pointerType: string, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: pointerId === 1 } });
  act(() => { target.dispatchEvent(event); });
}

function node(id = 'neuron-2-2') { return svg.querySelector<SVGGElement>(`[data-node="${id}"]`)!; }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  simulation = new NetworkSimulation();
  simulation.resize(1280, 600, true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<Harness />); });
  svg = container.querySelector('svg')!;
  svg.setPointerCapture = vi.fn();
  svg.releasePointerCapture = vi.fn();
  svg.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(['mouse', 'touch'])('%s pointer interactions', pointerType => {
  it.each([
    ['left', 'x', -1], ['right', 'x', 1], ['top', 'y', -1], ['bottom', 'y', 1],
  ] as const)('reverses immediately at the %s boundary without accidental activation', (_, axis, direction) => {
    const bounds = panLimits(simulation.width, simulation.height);
    const point = { x: 500, y: 300 };
    const emit = vi.spyOn(simulation, 'emit');
    pointer('pointerdown', svg, point.x, point.y, pointerType);
    point[axis] += direction * 300;
    pointer('pointermove', svg, point.x, point.y, pointerType);
    expect(simulation.pan[axis]).toBe(direction * bounds[axis]);
    point[axis] += direction * 500;
    pointer('pointermove', svg, point.x, point.y, pointerType);
    expect(simulation.pan[axis]).toBe(direction * bounds[axis]);
    point[axis] -= direction * 2;
    pointer('pointermove', svg, point.x, point.y, pointerType);
    expect(simulation.pan[axis]).toBe(direction * (bounds[axis] - 2));
    pointer('pointerup', svg, point.x, point.y, pointerType);
    const releasedPan = { ...simulation.pan };
    pointer('pointermove', svg, point.x + 80, point.y + 80, pointerType);
    expect(simulation.pan).toEqual(releasedPan);
    expect(simulation.gesture).toBe(null);
    expect(emit).not.toHaveBeenCalled();
  });

  it('handles repeated direction changes, starting from a persisted pan offset', () => {
    simulation.pan = { x: 30, y: -20 };
    pointer('pointerdown', svg, 500, 300, pointerType);
    pointer('pointermove', svg, 520, 315, pointerType);
    expect(simulation.pan).toEqual({ x: 50, y: -5 });
    for (let i = 0; i < 10; i++) {
      pointer('pointermove', svg, 900, 800, pointerType);
      expect(simulation.pan).toEqual({ x: 105, y: 72 });
      pointer('pointermove', svg, 897, 795, pointerType);
      expect(simulation.pan).toEqual({ x: 102, y: 67 });
    }
    pointer('pointerup', svg, 897, 795, pointerType);
  });

  it('preserves project preview, switching, navigation and ordinary activation', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(simulation.selected).toBe('neuron-2-2');
    expect(node().getAttribute('aria-expanded')).toBe('true');
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(open).toHaveBeenCalledWith('https://chararak-pdf.vercel.app/', '_blank', 'noopener,noreferrer');
    pointer('pointerdown', node('neuron-3-2'), 600, 200, pointerType);
    pointer('pointerup', svg, 600, 200, pointerType);
    expect(simulation.selected).toBe('neuron-3-2');
    pointer('pointerdown', node('neuron-0-1'), 50, 300, pointerType);
    pointer('pointerup', svg, 50, 300, pointerType);
    expect(simulation.waves).toHaveLength(1);
    expect(simulation.selected).toBe('neuron-3-2');
    pointer('pointerdown', svg, 500, 580, pointerType);
    pointer('pointerup', svg, 500, 580, pointerType);
    expect(simulation.selected).toBe(null);
  });

  it('charges without selecting or navigating, including an already selected project', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    pointer('pointerdown', node(), 400, 200, pointerType);
    simulation.step(1600, 0.05);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(simulation.selected).toBe(null);
    expect(simulation.waves).toHaveLength(1);
    expect(simulation.waves[0].intensity).toBeGreaterThan(0.72);
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(simulation.selected).toBe('neuron-2-2');
    pointer('pointerdown', node(), 400, 200, pointerType);
    simulation.step(3200, 0.05);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(simulation.selected).toBe('neuron-2-2');
    expect(open).not.toHaveBeenCalled();
  });

  it('cancels safely and never activates a neuron after dragging it', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointermove', svg, 460, 200, pointerType);
    pointer('pointerup', svg, 460, 200, pointerType);
    expect(simulation.selected).toBe(null);
    expect(simulation.waves).toHaveLength(0);
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointercancel', svg, 400, 200, pointerType);
    pointer('pointerup', svg, 400, 200, pointerType);
    expect(simulation.selected).toBe(null);
    expect(open).not.toHaveBeenCalled();
  });
});

it('ignores a secondary touch while a primary drag is captured', () => {
  pointer('pointerdown', svg, 500, 300, 'touch');
  pointer('pointermove', svg, 520, 300, 'touch');
  pointer('pointermove', svg, 1000, 1000, 'touch', 2);
  expect(simulation.pan).toEqual({ x: 20, y: 0 });
  pointer('pointermove', svg, 521, 300, 'touch');
  expect(simulation.pan).toEqual({ x: 21, y: 0 });
});

it('keeps hover working and hit circles matched to rendered circles during all size changes', () => {
  pointer('pointerover', node(), 400, 200, 'mouse');
  expect(simulation.hovered).toBe('neuron-2-2');
  const renderer = new SvgRenderer(svg, simulation);
  renderer.draw();
  expect(node().querySelector('[data-hit]')?.getAttribute('r')).toBe(String(config.baseRadius.toFixed(2)));
  for (const selected of [null, 'neuron-2-2']) {
    simulation.selected = selected;
    simulation.step(simulation.clock + 100, 0.05);
    renderer.draw();
    for (const element of svg.querySelectorAll('[data-node]')) {
      expect(element.querySelector('[data-hit]')?.getAttribute('r')).toBe(element.querySelector('[data-ink]')?.getAttribute('r'));
    }
  }
});
