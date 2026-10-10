import { network } from '../data/network';
import { palette } from '../config/theme';
import { motionConfig } from '../config/motion';
import { clamp, lerp } from '../utils/geometry';
import { inkAt, reachesEdge, signalProgress } from '../utils/signal';
import type { NetworkSimulation } from './NetworkSimulation';

export const gradientSamples = Array.from({ length: 17 }, (_, index) => index / 16);

const number = (value: number) => value.toFixed(2);

function mixInk(hex: string, amount: number): string {
  const origin = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const target = [117, 61, 39];
  return `rgb(${origin.map((channel, i) => Math.round(lerp(channel, target[i], clamp(amount, 0, 1)))).join(',')})`;
}

export class SvgRenderer {
  private scene: SVGGElement;
  private neuronElements;
  private edgeElements;

  constructor(private svg: SVGSVGElement, private simulation: NetworkSimulation) {
    this.scene = svg.querySelector<SVGGElement>('[data-scene]')!;
    // Resolve once. No per-frame queries or layout reads.
    this.neuronElements = simulation.nodes.map(node => {
      const group = svg.querySelector<SVGGElement>(`[data-node="${node.definition.id}"]`)!;
      return {
        group,
        circle: group.querySelector<SVGCircleElement>('[data-ink]')!,
        hit: group.querySelector<SVGCircleElement>('[data-hit]')!,
        focus: group.querySelector<SVGCircleElement>('[data-focus]')!,
        clip: group.querySelector<SVGCircleElement>('[data-clip]'),
        image: group.querySelector<SVGForeignObjectElement>('[data-image]'),
        label: group.querySelector<SVGTextElement>('[data-label]'),
        hoverLabel: group.querySelector<SVGTextElement>('[data-hover-label]'),
        preview: group.querySelector<SVGGElement>('[data-preview]'),
      };
    });
    this.edgeElements = network.edges.map(edge => ({
      line: svg.querySelector<SVGLineElement>(`[data-edge="${edge.id}"]`)!,
      active: svg.querySelector<SVGLineElement>(`[data-signal="${edge.id}"]`)!,
      gradient: svg.querySelector<SVGLinearGradientElement>(`#ink-${edge.id}`)!,
      stops: Array.from(svg.querySelectorAll<SVGStopElement>(`#ink-${edge.id} stop`)),
      visible: false,
    }));
  }

  draw() {
    const simulation = this.simulation;
    this.scene.setAttribute('transform', `translate(${number(simulation.pan.x)} ${number(simulation.pan.y)})`);
    this.svg.setAttribute('data-wave-count', String(simulation.waves.length));
    if (simulation.gesture?.nodeId && !simulation.gesture.moved) {
      this.svg.setAttribute('data-gesture', simulation.clock - simulation.gesture.started >= motionConfig.longPressThreshold ? 'charging' : 'pointer-down');
    }
    for (let i = 0; i < simulation.nodes.length; i++) {
      const node = simulation.nodes[i], elements = this.neuronElements[i];
      const radius = number(node.radius);
      const isProject = !!node.definition.project;
      elements.group.setAttribute('transform', `translate(${number(node.x)} ${number(node.y)})`);
      elements.group.setAttribute('data-charge', number(node.charge));
      elements.group.setAttribute('data-expansion', number(node.expansion));
      elements.group.setAttribute('data-activation', number(node.activation));
      elements.group.setAttribute('data-phase', node.expansion > 0.99 ? 'selected' : node.expansion > 0.01 ? (simulation.selected === node.definition.id ? 'expanding' : 'collapsing') : 'idle');
      elements.circle.setAttribute('r', radius);
      elements.circle.setAttribute('fill', mixInk(isProject ? palette.projectNode : palette.ordinaryNode, node.activation * 0.65 + node.charge * 0.8));
      elements.hit.setAttribute('r', radius);
      elements.focus.setAttribute('r', number(node.radius + 6));
      elements.clip?.setAttribute('r', number(Math.max(0, node.radius - 0.8)));
      if (elements.image) {
        elements.image.setAttribute('x', number(-node.radius));
        elements.image.setAttribute('y', number(-node.radius));
        elements.image.setAttribute('width', number(node.radius * 2));
        elements.image.setAttribute('height', number(node.radius * 2));
      }
      const previewOpacity = clamp((node.expansion - 0.2) / 0.65, 0, 1);
      elements.preview?.setAttribute('opacity', number(previewOpacity));
      if (elements.label) {
        elements.label.setAttribute('y', number(node.radius + 28));
        elements.label.setAttribute('opacity', number(previewOpacity));
      }
      if (elements.hoverLabel) {
        const hoverOpacity = simulation.hovered === node.definition.id && simulation.selected !== node.definition.id && node.expansion < 0.02 ? 1 : 0;
        elements.hoverLabel.setAttribute('y', number(-node.radius - 18));
        elements.hoverLabel.style.opacity = number(hoverOpacity);
      }
    }

    for (let i = 0; i < network.edges.length; i++) {
      const edge = network.edges[i], elements = this.edgeElements[i];
      const source = simulation.byId.get(edge.source)!, target = simulation.byId.get(edge.target)!;
      const dx = target.x - source.x, dy = target.y - source.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const insetA = Math.min(source.radius, length / 2), insetB = Math.min(target.radius, length / 2);
      const endpoints = {
        x1: source.x + dx / length * insetA, y1: source.y + dy / length * insetA,
        x2: target.x - dx / length * insetB, y2: target.y - dy / length * insetB,
      };
      for (const [attribute, value] of Object.entries(endpoints)) {
        const formatted = number(value);
        elements.line.setAttribute(attribute, formatted);
        elements.active.setAttribute(attribute, formatted);
        elements.gradient.setAttribute(attribute, formatted);
      }
      const waves = simulation.waves.filter(wave => {
        if (!reachesEdge(wave, edge)) return false;
        const progress = signalProgress(wave, edge, simulation.clock);
        return progress >= 0 && progress <= 1 + wave.tail;
      });
      if (waves.length) {
        elements.active.setAttribute('opacity', '1');
        elements.active.setAttribute('stroke-width', number(Math.min(2.3, 1.3 + Math.max(...waves.map(wave => wave.intensity)) * 0.45)));
        elements.stops.forEach((stop, index) => {
          const opacity = waves.reduce((total, wave) => total + inkAt(signalProgress(wave, edge, simulation.clock), gradientSamples[index], wave.tail) * wave.intensity, 0);
          stop.setAttribute('stop-opacity', number(Math.min(0.95, opacity)));
        });
        elements.visible = true;
      } else if (elements.visible) {
        elements.active.setAttribute('opacity', '0');
        elements.visible = false;
      }
    }
  }
}
