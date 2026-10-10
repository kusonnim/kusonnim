import type { KeyboardEvent } from 'react';
import type { NeuronDefinition } from '../types/network';
import { palette } from '../config/theme';
import { ProjectPreview } from './ProjectPreview';

interface Props {
  node: NeuronDefinition;
  selected: boolean;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
  onKeyUp: (event: KeyboardEvent<SVGGElement>) => void;
  onBlur: () => void;
  onHover: (hovered: boolean) => void;
}

export function Neuron({ node, selected, onKeyDown, onKeyUp, onBlur, onHover }: Props) {
  const label = node.project ? `${node.project.name}, project` : node.layer === 0 ? 'Input neuron' : node.layer === 5 ? 'Output neuron' : `Hidden layer ${node.layer}, neuron ${node.row}`;
  return <g className={`neuron ${node.project ? 'project-neuron' : 'ordinary-neuron'}`}
    data-node={node.id} data-testid={node.id} data-layer={node.layer} data-row={node.row}
    role="button" tabIndex={0} aria-label={label} aria-expanded={node.project ? selected : undefined}
    onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur}
    onPointerEnter={event => { if (event.pointerType !== 'touch') onHover(true); }}
    onPointerLeave={() => onHover(false)} onFocus={() => onHover(true)}>
    <circle data-hit r="22" fill="transparent" />
    <circle data-ink r="15" fill={node.project ? palette.projectNode : palette.ordinaryNode} pointerEvents="none" />
    <circle data-focus className="focus-ring" r="21" fill="none" pointerEvents="none" />
    {node.project && <ProjectPreview project={node.project} nodeId={node.id} />}
  </g>;
}
