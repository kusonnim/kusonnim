import { describe, expect, it } from 'vitest';
import { network, createNetwork, layerSizes } from '../src/data/network';
import { projects } from '../src/data/projects';

describe('fixed feed-forward network', () => {
  it('has the exact six layers and 22 neurons', () => {
    expect(layerSizes).toEqual([1, 5, 5, 5, 5, 1]);
    expect(network.neurons).toHaveLength(22);
    expect(layerSizes.map((_, layer) => network.neurons.filter(node => node.layer === layer).length)).toEqual(layerSizes);
  });

  it('has 85 unique directed connections, fully connecting adjacent layers', () => {
    expect(network.edges).toHaveLength(85);
    expect(new Set(network.edges.map(edge => edge.id)).size).toBe(85);
    expect([0, 1, 2, 3, 4].map(layer => network.edges.filter(edge => edge.layer === layer).length)).toEqual([5, 25, 25, 25, 5]);
    for (const edge of network.edges) {
      const source = network.neurons.find(node => node.id === edge.source)!;
      const target = network.neurons.find(node => node.id === edge.target)!;
      expect(target.layer).toBe(source.layer + 1);
    }
  });

  it('preserves all eight assignments and both ordinary terminal neurons', () => {
    const assignments = Object.fromEntries(network.neurons.filter(node => node.project).map(node => [node.project!.id, [node.layer, node.row]]));
    expect(assignments).toEqual({
      'program-roulette': [1, 4], 'chararak-pdf': [2, 2], 'chararak-read': [2, 4],
      'rsvp-reader': [2, 5], 'just-in-case': [3, 1], 'tilt-sweeper': [3, 2],
      'burn-word': [3, 3], 'autumn-string': [4, 2],
    });
    expect(network.neurons.filter(node => !node.project)).toHaveLength(14);
    expect(network.neurons.filter(node => node.layer === 0 || node.layer === 5).every(node => !node.project)).toBe(true);
  });

  it('supports additions without reshuffling and rejects occupied or invalid positions', () => {
    const extra = { id: 'new-world', name: 'New World', url: 'https://example.com', preview: '/previews/new-world.webp', layer: 1, row: 1 };
    const extended = createNetwork([...projects, extra]);
    expect(extended.neurons.filter(node => node.project)).toHaveLength(9);
    for (const project of projects) expect(extended.neurons.find(node => node.project?.id === project.id)?.project).toEqual(project);
    expect(() => createNetwork([...projects, { ...extra, layer: 2, row: 2 }])).toThrow('occupied');
    expect(() => createNetwork([{ ...extra, layer: 0 }])).toThrow('hidden');
    expect(() => createNetwork([{ ...extra, layer: 5 }])).toThrow('hidden');
    expect(() => createNetwork([{ ...extra, row: 6 }])).toThrow('hidden');
    expect(() => createNetwork([...projects, { ...extra, id: projects[0].id }])).toThrow('Duplicate');
  });
});
