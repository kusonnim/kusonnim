import { useState } from 'react';
import type { Project } from '../types/network';

export function ProjectPreview({ project, nodeId }: { project: Project; nodeId: string }) {
  const [missing, setMissing] = useState(false);
  const focus = project.focus ?? { x: 0.5, y: 0.5 };
  return <>
    <defs><clipPath id={`preview-${nodeId}`}><circle data-clip r="0" /></clipPath></defs>
    <g data-preview opacity="0" pointerEvents="none" clipPath={`url(#preview-${nodeId})`}>
      <foreignObject data-image x="-15" y="-15" width="30" height="30">
        <div className={`preview-content ${missing ? 'preview-missing' : ''}`}>
          {missing ? <span>{project.name}</span> : <img src={project.preview} alt="" draggable={false}
            style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }}
            onError={() => setMissing(true)} />}
        </div>
      </foreignObject>
    </g>
    <text className="project-label selected-label" data-label y="43" textAnchor="middle" opacity="0" pointerEvents="none" aria-hidden="true">{project.name}</text>
    <text className="project-label hover-label" data-hover-label y="-33" textAnchor="middle" pointerEvents="none" aria-hidden="true">{project.name}</text>
  </>;
}
