import type { EdgeDefinition } from '../types/network';
import { palette } from '../config/theme';
import { gradientSamples } from '../simulation/SvgRenderer';

export function ConnectionGradient({ edge }: { edge: EdgeDefinition }) {
  return <linearGradient id={`ink-${edge.id}`} gradientUnits="userSpaceOnUse">
    {gradientSamples.map(position => <stop key={position} offset={position} stopColor={palette.activeInk} stopOpacity="0" />)}
  </linearGradient>;
}

export function Connection({ edge }: { edge: EdgeDefinition }) {
  return <g pointerEvents="none" aria-hidden="true">
    <path fill="none" className="connection" data-edge={edge.id} data-source={edge.source} data-target={edge.target} />
    <path fill="none" className="signal" data-signal={edge.id} stroke={`url(#ink-${edge.id})`} opacity="0" />
  </g>;
}
