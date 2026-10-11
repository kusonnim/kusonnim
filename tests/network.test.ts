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

  it('preserves all ten existing assignments, adds Clack at 1/5, and keeps ordinary terminals', () => {
    const assignments = Object.fromEntries(network.neurons.filter(node => node.project).map(node => [node.project!.id, [node.layer, node.row]]));
    expect(assignments).toEqual({
      'program-roulette': [1, 4], 'chararak-pdf': [2, 2], 'chararak-read': [2, 4],
      'rsvp-reader': [2, 5], 'just-in-case': [3, 1], 'tilt-sweeper': [3, 2],
      'burn-word': [3, 3], 'autumn-string': [4, 2], 'tikcat': [4, 4],
      'my-fan': [1, 2],
      'clack': [1, 5],
    });
    expect(network.neurons.filter(node => node.project)).toHaveLength(11);
    expect(network.neurons.filter(node => !node.project)).toHaveLength(11);
    expect(network.neurons.filter(node => node.layer === 0 || node.layer === 5).every(node => !node.project)).toBe(true);
  });

  it('preserves the exact URLs of all ten existing projects', () => {
    const urls = Object.fromEntries(projects.filter(project => project.id !== 'clack').map(project => [project.id, project.url]));
    expect(urls).toEqual({
      'rsvp-reader': 'https://kusonnim.github.io/RSVP_Reader/',
      'tilt-sweeper': 'https://kusonnim.github.io/tiltSweeper/',
      'chararak-read': 'https://chararak-read.vercel.app/',
      'chararak-pdf': 'https://chararak-pdf.vercel.app/',
      'burn-word': 'https://burn-word.vercel.app/',
      'just-in-case': 'https://just-in-case-tau.vercel.app/',
      'autumn-string': 'https://autumn-string.vercel.app/',
      'program-roulette': 'https://program-roulette.vercel.app/',
      'tikcat': 'https://tikcat.vercel.app/',
      'my-fan': 'https://my-fan-two.vercel.app/',
    });
  });

  it('assigns TikCat to the requested neuron and static WebP preview path', () => {
    expect(network.neurons.find(node => node.id === 'neuron-4-4')?.project).toMatchObject({
      id: 'tikcat', name: 'TikCat', url: 'https://tikcat.vercel.app/', layer: 4, row: 4, preview: '/previews/tikcat.webp',
    });
  });

  it('assigns My Fan to the requested neuron and static WebP preview path', () => {
    expect(network.neurons.find(node => node.id === 'neuron-1-2')?.project).toMatchObject({
      id: 'my-fan', name: 'My Fan', url: 'https://my-fan-two.vercel.app/', layer: 1, row: 2, preview: '/previews/my-fan.webp',
    });
  });

  it('assigns Clack to the requested neuron and static WebP preview path', () => {
    expect(network.neurons.find(node => node.id === 'neuron-1-5')?.project).toMatchObject({
      id: 'clack', name: 'Clack', url: 'https://clack-livid.vercel.app/', layer: 1, row: 5, preview: '/previews/clack.webp',
    });
  });

  it('changes only the 1/5 project assignment and leaves every neuron position and connection unchanged', () => {
    const original = createNetwork(projects.filter(project => project.id !== 'clack'));
    expect(network.edges).toEqual(original.edges);
    expect(network.neurons.map(({ id, layer, row }) => ({ id, layer, row }))).toEqual(
      original.neurons.map(({ id, layer, row }) => ({ id, layer, row })),
    );
    for (const node of original.neurons) {
      if (node.id !== 'neuron-1-5') expect(network.neurons.find(current => current.id === node.id)).toEqual(node);
    }
  });

  it('supports additions without reshuffling and rejects occupied or invalid positions', () => {
    const extra = { id: 'new-world', name: 'New World', url: 'https://example.com', preview: '/previews/new-world.webp', layer: 1, row: 1 };
    const extended = createNetwork([...projects, extra]);
    expect(extended.neurons.filter(node => node.project)).toHaveLength(12);
    for (const project of projects) expect(extended.neurons.find(node => node.project?.id === project.id)?.project).toEqual(project);
    expect(() => createNetwork([...projects, { ...extra, layer: 2, row: 2 }])).toThrow('occupied');
    expect(() => createNetwork([{ ...extra, layer: 0 }])).toThrow('hidden');
    expect(() => createNetwork([{ ...extra, layer: 5 }])).toThrow('hidden');
    expect(() => createNetwork([{ ...extra, row: 6 }])).toThrow('hidden');
    expect(() => createNetwork([...projects, { ...extra, id: projects[0].id }])).toThrow('Duplicate');
  });
});
