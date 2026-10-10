/** Original floral linework, mirrored into the four corners. */
export function CornerOrnaments() {
  return <div className="ornaments" aria-hidden="true">
    {['north-west', 'north-east', 'south-west', 'south-east'].map(corner =>
      <svg key={corner} className={`corner ${corner}`} viewBox="0 0 180 180" fill="none">
        <g stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 157V34Q13 13 34 13H157M21 124V36Q21 21 36 21H124" opacity=".65" />
          <path d="M25 103C26 58 60 26 104 25M27 82C24 62 38 40 56 35C72 30 82 36 78 48C75 58 60 62 52 55C45 49 48 40 56 42C62 43 62 50 57 51" />
          <path d="M82 27C62 24 40 38 35 56C30 72 36 82 48 78C58 75 62 60 55 52C49 45 40 48 42 56C43 62 50 62 51 57" />
          <path d="M30 122C45 101 59 89 59 69C59 55 70 47 80 53C92 61 83 74 74 69C69 67 69 60 74 60M122 30C101 45 89 59 69 59" />
          <path d="M33 110C37 94 46 89 49 88C48 101 42 109 33 110M47 91C46 82 40 76 35 75C33 86 39 91 47 91M69 43C78 34 91 32 101 37C92 42 80 45 69 43M91 47C82 46 76 40 75 35C86 33 91 39 91 47" />
          <path d="M111 28C127 17 143 22 141 33C140 41 129 41 128 35M28 111C17 127 22 143 33 141C41 140 41 129 35 128" />
          <path d="M24 24L30 30M31 31C34 24 43 25 45 30C41 34 35 35 31 31C24 34 25 43 30 45C34 41 35 35 31 31Z" />
          <path d="M17 151L13 162L9 151M151 17L162 13L151 9" />
          <circle cx="103" cy="25" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="25" cy="103" r="1.6" fill="currentColor" stroke="none" />
          <path d="M36 118Q41 114 46 116Q43 121 36 118M118 36Q114 41 116 46Q121 43 118 36" />
        </g>
      </svg>,
    )}
  </div>;
}
