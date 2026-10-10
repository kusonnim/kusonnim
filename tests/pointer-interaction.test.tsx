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
import { panLimits, restingRadius } from '../src/utils/geometry';
import { tactileConfig } from '../src/config/tactile';
import { palette } from '../src/config/theme';
import { curvePath, downstreamCurve, quadraticPoint } from '../src/utils/strandGeometry';

let root: Root;
let container: HTMLDivElement;
let svg: SVGSVGElement;
let simulation: NetworkSimulation;

const addedProjects = [
  { id: 'neuron-4-4', name: 'TikCat', url: 'https://tikcat.vercel.app/', preview: '/previews/tikcat.webp' },
  { id: 'neuron-1-2', name: 'My Fan', url: 'https://my-fan-two.vercel.app/', preview: '/previews/my-fan.webp' },
];

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

  it.each(addedProjects)('gives $name project ink, hover text, a first-click circular preview, and second-click navigation', ({ id, name, url, preview }) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const projectNode = node(id);
    const point = simulation.byId.get(id)!.base;
    expect(projectNode.classList.contains('project-neuron')).toBe(true);
    expect(projectNode.classList.contains('ordinary-neuron')).toBe(false);
    expect(projectNode.querySelector('[data-ink]')?.getAttribute('fill')).toBe(palette.projectNode);
    expect(projectNode.querySelector('[data-hover-label]')?.textContent).toBe(name);
    pointer('pointerover', projectNode, point.x, point.y, pointerType);
    const renderer = new SvgRenderer(svg, simulation);
    renderer.draw();
    if (pointerType === 'mouse') {
      expect(simulation.hovered).toBe(id);
      expect(Number(projectNode.querySelector<SVGTextElement>('[data-hover-label]')?.style.opacity)).toBe(1);
    }
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    pointer('pointerup', svg, point.x, point.y, pointerType);
    expect(simulation.selected).toBe(id);
    expect(projectNode.getAttribute('aria-expanded')).toBe('true');
    expect(open).not.toHaveBeenCalled();
    for (let i = 1; i <= 120; i++) simulation.step(i * 1000 / 60, 1 / 60);
    renderer.draw();
    const radius = Number(projectNode.querySelector('[data-ink]')?.getAttribute('r'));
    expect(radius).toBeGreaterThan(restingRadius());
    expect(projectNode.querySelector('img')?.getAttribute('src')).toBe(preview);
    expect(projectNode.querySelector('[data-preview]')?.getAttribute('clip-path')).toBe(`url(#preview-${id})`);
    expect(Number(projectNode.querySelector('[data-clip]')?.getAttribute('r'))).toBeCloseTo(radius - 0.8);
    expect(projectNode.querySelector('[data-label]')?.textContent).toBe(name);
    expect(Number(projectNode.querySelector('[data-label]')?.getAttribute('y'))).toBeGreaterThan(radius);
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    pointer('pointerup', svg, point.x, point.y, pointerType);
    expect(open).toHaveBeenCalledExactlyOnceWith(url, '_blank', 'noopener,noreferrer');
  });

  it.each(addedProjects)('preserves $name long-press charging and never navigates after charging or dragging', ({ id }) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const projectNode = node(id);
    const point = simulation.byId.get(id)!.base;
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    simulation.step(1600, 0.05);
    expect(simulation.gravityStrength).toBe(0);
    expect(simulation.connections.grabbedCount).toBe(0);
    pointer('pointerup', svg, point.x, point.y, pointerType);
    expect(simulation.selected).toBe(null);
    expect(simulation.waves).toHaveLength(1);
    expect(simulation.waves[0].origin).toBe(id);
    expect(simulation.waves[0].intensity).toBeGreaterThan(0.72);
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    pointer('pointerup', svg, point.x, point.y, pointerType);
    expect(simulation.selected).toBe(id);
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    simulation.step(3200, 0.05);
    pointer('pointerup', svg, point.x, point.y, pointerType);
    expect(simulation.selected).toBe(id);
    const waveCount = simulation.waves.length;
    pointer('pointerdown', projectNode, point.x, point.y, pointerType);
    pointer('pointermove', svg, point.x + 50, point.y, pointerType);
    pointer('pointerup', svg, point.x + 50, point.y, pointerType);
    expect(simulation.waves).toHaveLength(waveCount);
    expect(simulation.pan).toEqual({ x: 0, y: 0 });
    expect(open).not.toHaveBeenCalled();
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

  it('uses a stationary background hold for gravity, without closing a preview or sending a signal', () => {
    pointer('pointerdown', node(), 400, 200, pointerType);
    pointer('pointerup', svg, 400, 200, pointerType);
    pointer('pointerdown', svg, 420, 300, pointerType);
    for (let i = 1; i <= 120; i++) simulation.step(i * 1000 / 60, 1 / 60);
    expect(simulation.gesture?.mode).toBe('gravity');
    expect(simulation.gravityStrength).toBeGreaterThan(0.8);
    expect(simulation.pan).toEqual({ x: 0, y: 0 });
    pointer('pointerup', svg, 420, 300, pointerType);
    expect(simulation.selected).toBe('neuron-2-2');
    expect(simulation.waves).toHaveLength(0);
    expect(simulation.gesture).toBe(null);
  });

  it('does not activate gravity or grab strands while panning, even after a long hold', () => {
    pointer('pointerdown', svg, 500, 300, pointerType);
    pointer('pointermove', svg, 530, 300, pointerType);
    simulation.step(2000, 0.05);
    expect(simulation.pan).toEqual({ x: 30, y: 0 });
    expect(simulation.gravityStrength).toBe(0);
    expect(simulation.connections.grabbedCount).toBe(0);
    expect(simulation.waves).toHaveLength(0);
    pointer('pointerup', svg, 530, 300, pointerType);
  });

  it('cancels gravity rather than starting a pan from the same gravity gesture', () => {
    pointer('pointerdown', svg, 500, 300, pointerType);
    simulation.step(tactileConfig.gravityWell.holdThreshold + 1, 0.05);
    expect(simulation.gesture?.mode).toBe('gravity');
    pointer('pointermove', svg, 560, 300, pointerType);
    expect(simulation.pan).toEqual({ x: 0, y: 0 });
    pointer('pointerup', svg, 560, 300, pointerType);
    expect(simulation.waves).toHaveLength(0);
  });
});

it.each(addedProjects)('retains the established $name placeholder if its preview cannot load', ({ id, name }) => {
  const projectNode = node(id);
  const image = projectNode.querySelector('img')!;
  act(() => { image.dispatchEvent(new Event('error')); });
  expect(projectNode.querySelector('.preview-missing')?.textContent).toBe(name);
  expect(node('neuron-2-2').querySelector('.preview-missing')).toBe(null);
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
  expect(node().querySelector('[data-hit]')?.getAttribute('r')).toBe(restingRadius().toFixed(2));
  for (const selected of [null, 'neuron-2-2']) {
    simulation.selected = selected;
    simulation.step(simulation.clock + 100, 0.05);
    renderer.draw();
    for (const element of svg.querySelectorAll('[data-node]')) {
      expect(element.querySelector('[data-hit]')?.getAttribute('r')).toBe(element.querySelector('[data-ink]')?.getAttribute('r'));
    }
  }
});

it('touches and releases at 70px without buttons, with ink clipped at the original contact', () => {
  const state = simulation.connections.states[0];
  const contact = quadraticPoint(state.geometry.start, state.geometry.control, state.geometry.end, 0.5);
  pointer('pointermove', svg, contact.x, contact.y - 12, 'mouse');
  pointer('pointermove', svg, contact.x, contact.y, 'mouse');
  expect(state.grab).not.toBe(null);
  expect(simulation.gesture).toBe(null);
  pointer('pointermove', svg, contact.x, contact.y + 20, 'mouse');
  for (let i = 1; i <= 10; i++) simulation.step(i * 1000 / 60, 1 / 60);
  const renderer = new SvgRenderer(svg, simulation);
  renderer.draw();
  const path = svg.querySelector(`[data-edge="${state.definition.id}"]`)!;
  const ink = svg.querySelector(`[data-signal="${state.definition.id}"]`)!;
  expect(path.tagName.toLowerCase()).toBe('path');
  expect(path.getAttribute('data-grabbed')).toBe('true');
  expect(Number(path.getAttribute('data-bend'))).toBeGreaterThan(5);
  expect(path.getAttribute('d')).toBe(ink.getAttribute('d'));
  const fraction = state.grab!.fraction;
  pointer('pointermove', svg, contact.x, contact.y + 69, 'mouse');
  expect(state.grab).not.toBe(null);
  pointer('pointermove', svg, contact.x, contact.y + 70, 'mouse');
  expect(state.grab).toBe(null);
  expect(simulation.waves.some(wave => wave.edgeOrigin === state.definition.id)).toBe(true);
  simulation.step(simulation.clock + 50, 0.05);
  renderer.draw();
  expect(path.getAttribute('d')).toBe(curvePath(state.geometry));
  expect(ink.getAttribute('d')).toBe(curvePath(downstreamCurve(state.geometry, fraction)));
  expect(Number(ink.getAttribute('data-contact-start'))).toBeCloseTo(fraction);
  expect(ink.getAttribute('opacity')).toBe('1');
  expect(simulation.selected).toBe(null);
});

it('clears temporary grabs on cancellation without navigation or a release signal', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const state = simulation.connections.states[0];
  const contact = quadraticPoint(state.geometry.start, state.geometry.control, state.geometry.end, 0.5);
  pointer('pointermove', svg, contact.x, contact.y - 12, 'mouse');
  pointer('pointermove', svg, contact.x, contact.y, 'mouse');
  expect(state.grab).not.toBe(null);
  pointer('pointercancel', svg, contact.x, contact.y, 'mouse');
  expect(simulation.connections.grabbedCount).toBe(0);
  expect(simulation.waves).toHaveLength(0);
  expect(open).not.toHaveBeenCalled();
});

it('gives neuron presses priority over pending strand pulls and background gravity', () => {
  const state = simulation.connections.states[0];
  const contact = quadraticPoint(state.geometry.start, state.geometry.control, state.geometry.end, 0.5);
  pointer('pointermove', svg, contact.x, contact.y - 12, 'mouse');
  pointer('pointermove', svg, contact.x, contact.y, 'mouse');
  expect(state.grab).not.toBe(null);
  pointer('pointerdown', node(), 400, 200, 'mouse');
  expect(simulation.connections.grabbedCount).toBe(0);
  simulation.step(1600, 0.05);
  expect(simulation.gravityStrength).toBe(0);
  pointer('pointerup', svg, 400, 200, 'mouse');
  expect(simulation.selected).toBe(null);
  expect(simulation.waves).toHaveLength(1);
  expect(simulation.waves[0].edgeOrigin).toBeUndefined();
});
