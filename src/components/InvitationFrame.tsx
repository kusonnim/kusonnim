import type { ReactNode } from 'react';
import { CornerOrnaments } from './CornerOrnaments';

export function InvitationFrame({ children }: { children: ReactNode }) {
  return <main className="invitation">
    <CornerOrnaments />
    <header className="invitation-heading">
      <svg className="heading-mark" viewBox="0 0 76 26" aria-hidden="true" fill="none">
        <path d="M4 13H27M49 13H72M30 13L38 5L46 13L38 21Z" stroke="currentColor" strokeWidth=".7" />
        <circle cx="38" cy="13" r="2.4" fill="currentColor" />
        <path d="M20 10L24 13L20 16M56 10L52 13L56 16" stroke="currentColor" strokeWidth=".7" />
      </svg>
      <h1>Letter of Invitation</h1>
      <p>Proceed, and the ink shall reveal its little worlds.</p>
      <div className="heading-rule" aria-hidden="true"><span /></div>
    </header>
    {children}
  </main>;
}
