import { network } from '../data/network';
import { useNetworkSimulation } from '../hooks/useNetworkSimulation';
import { usePointerInteraction } from '../hooks/usePointerInteraction';
import { Connection, ConnectionGradient } from './Connection';
import { Neuron } from './Neuron';

export function NetworkScene() {
  const { simulation, svgRef } = useNetworkSimulation();
  const interaction = usePointerInteraction(simulation, svgRef);
  return <section className="network-viewport" aria-label="Interactive collection of experimental projects">
    <svg ref={svgRef} className="network" data-testid="network" data-gesture="idle"
      {...interaction.sceneEvents}>
      <defs>{network.edges.map(edge => <ConnectionGradient key={edge.id} edge={edge} />)}</defs>
      <g data-scene>
        <g className="connections">{network.edges.map(edge => <Connection key={edge.id} edge={edge} />)}</g>
        <g className="neurons">{network.neurons.map(node => <Neuron key={node.id} node={node}
          selected={interaction.selected === node.id}
          onKeyDown={event => interaction.onKeyDown(node.id, event)}
          onKeyUp={event => interaction.onKeyUp(node.id, event)}
          onBlur={() => { interaction.onBlur(node.id); interaction.hover(null); }}
          onHover={hovered => interaction.hover(hovered ? node.id : null)} />)}</g>
      </g>
    </svg>
  </section>;
}
