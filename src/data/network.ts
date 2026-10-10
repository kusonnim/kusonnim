import { projects } from './projects';
import type { EdgeDefinition, NeuronDefinition, Project } from '../types/network';

export const layerSizes = [1, 5, 5, 5, 5, 1] as const;

export function createNetwork(projectList: Project[]) {
  const occupied = new Set<string>();
  const projectIds = new Set<string>();
  for (const project of projectList) {
    const position = `${project.layer}-${project.row}`;
    if (!Number.isInteger(project.layer) || !Number.isInteger(project.row) || project.layer < 1 || project.layer > 4 || project.row < 1 || project.row > 5) {
      throw new Error(`Project ${project.id} must occupy an available hidden neuron.`);
    }
    if (occupied.has(position) || projectIds.has(project.id)) {
      throw new Error(`Duplicate project ID or occupied neuron: ${project.id} at ${position}.`);
    }
    occupied.add(position);
    projectIds.add(project.id);
  }
  const neurons: NeuronDefinition[] = layerSizes.flatMap((size, layer) =>
    Array.from({ length: size }, (_, index) => ({
      id: `neuron-${layer}-${index + 1}`, layer, row: index + 1,
      project: projectList.find(project => project.layer === layer && project.row === index + 1),
    })),
  );
  const edges: EdgeDefinition[] = neurons.flatMap(source =>
    neurons.filter(target => target.layer === source.layer + 1).map(target => ({
      id: `${source.id}--${target.id}`, source: source.id, target: target.id, layer: source.layer,
    })),
  );
  return { neurons, edges };
}

export const network = createNetwork(projects);
