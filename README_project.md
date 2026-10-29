# Letter of Invitation

A parchment invitation containing a living, tactile network of experimental projects.
Built with React, TypeScript, Vite and SVG. No backend or external service is required.

## Run

Use Node.js 22.12+ or 24+ (the test runner requires these versions).

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

The production site is generated in `dist/`. On Vercel, select the Vite preset,
use `npm run build`, and set the output directory to `dist`. The app has no
client-side routes, so no special rewrite rule is needed. It has not been deployed.

## Interaction

- Every neuron can emit forward signals. Short-click an ordinary neuron or hold
  any neuron to charge it, then release.
- First-click a project to expand its circular screenshot; second-click the
  expanded circle to open its URL in a separate tab.
- Click the empty parchment or press Escape to close. Selecting a different
  project switches previews.
- Drag the empty network scene to pan within bounds. There is no network zoom.
- Hold the empty network scene still for 350ms to gather nearby neurons into a
  gravity well. Release to let them settle; moving first starts a pan instead.
- Move the cursor without pressing a button to stir nearby neurons and touch
  connection strands. Every crossed eligible strand follows independently until
  the cursor moves 70 CSS pixels from its contact, then releases and signals forward
  from that original contact point, without lighting the upstream source neuron.
  Leaving the scene or pressing a button cancels unfinished grabs without signaling.
- All neurons are keyboard reachable. Enter or Space selects/activates; holding
  either key charges. Keyboard focus remains on the selected neuron.
- Reduced-motion preference disables idle and pointer displacement and makes
  preview expansion immediate; meaningful signal propagation remains available.

These instructions are documentation only; they do not appear in the interface.

## Configuration

- `src/config/motion.ts`: mouse influence (0.78), resting radii (17 desktop / 14
  mobile, before the tactile size multiplier), horizontal/vertical spacing scales
  (0.94 / 0.92), signal speed (0.15),
  preview scale (8), charging curve and cap, animation smoothing, collisions and
  pan bounds. Pointer proximity strength, velocity gain and velocity cap are
  independent of pointer smoothing. Hit circles track the exact rendered radius.
- `src/config/tactile.ts`: 1.25 resting-size multiplier (effective radii 21.25 /
  17.5), gravity hold threshold (350ms), radius (320px), strength (2.5), buildup
  (900ms), maximum displacement (120px, capped after applying strength and limited
  by press-point clearance), stirring strength (1), damping (6 per second), radius
  (120px), velocity/displacement caps (110px/s / 22px), connection-release distance
  (70 CSS pixels), hit tolerance (5px), cooldown (180ms), endpoint influence (0.25),
  aggregate endpoint cap (24px), curve control-offset cap (210px), and stretch/release
  smoothing (12 / 18 per second).
  These exponential rates are independent of frame rate, not per-frame multipliers.
- `src/config/theme.ts` and `src/styles/global.css`: ink, parchment and typography.
- `src/data/projects.ts`: fixed project assignments, URLs, image paths and crop
  focus. Add a project only to an available hidden neuron. Invalid or duplicate
  positions throw an explicit error rather than overwrite an existing project.
- `src/data/network.ts`: the deterministic `1 → 5 → 5 → 5 → 5 → 1` topology,
  containing 22 neurons and 85 adjacent-layer directed connections.

## Preview assets

The original eight project URLs were visited and their actual screens
captured on October 10, 2026. The screenshots are stored under `public/previews/`
as `.jpg`, the browser's native screenshot format. They preserve the original
project colors; they are not generated mockups. Some show the project's initial
empty state before a visitor supplies a file or text. Autumn String was captured
after a few interactions with its threads to show the artwork more clearly.

The ninth project, TikCat, occupies hidden layer 4, row 4. Its actual generated
cat-petting ticket view was captured on October 10, 2026 and encoded as
`public/previews/tikcat.webp`. All eight original positions, URLs, and preview
assets are preserved. TikCat uses the same hover, circular preview, navigation,
and charging behavior as every other project neuron.

The tenth project, My Fan, occupies hidden layer 1, row 2. Its actual fan view
was captured on October 10, 2026 and encoded as `public/previews/my-fan.webp`,
with crop focus set to keep the fan centered in the circular preview. All nine
previous project assignments and URLs, including TikCat at 4/4, are preserved.

The eleventh project, Clack, occupies hidden layer 1, row 5. Its actual clock
view was captured on October 11, 2026 and encoded as `public/previews/clack.webp`.
All ten previous assignments and URLs remain unchanged, and Clack uses the
existing hover, circular preview, navigation, and long-press charging behavior.

The twelfth project, Drinking Milk, occupies hidden layer 4, row 5. Its actual
glass-and-carton view was captured on October 13, 2026 and encoded as
`public/previews/drinking-milk.webp`. All eleven previous assignments and URLs
remain unchanged; the existing project-neuron interactions are reused.

The thirteenth project, Wajangchang, occupies hidden layer 3, row 5. Its actual
cat-paw-and-tipping-dishes interaction was captured on October 29, 2026 and
encoded as `public/previews/wajangchang.webp`. All twelve prior assignments and
URLs remain unchanged; existing project-neuron interactions are reused.

Replace these files with updated screenshots, or change the corresponding
`preview` path in `src/data/projects.ts` to a WebP/PNG asset. Each project's `focus`
uses normalized x/y values for the image's CSS `object-position`. Missing images
display a restrained local fallback bearing the project name.

## Implementation and verification

One `requestAnimationFrame` loop advances a pure simulation and updates cached
SVG references, without React renders on each frame. Motion is interpolated from
stable base positions and local collision projections, with no spring velocities
or accumulated positional drift. Stirring uses capped, exponentially damped
temporary velocity and offsets. The clock pauses while the page is hidden, and
temporary connection grabs are cancelled.

Signals visit each reachable edge and neuron once per wave. Released strands seed
their original contact fraction on their own edge, then its destination and
reachable later layers. The seed ink is clipped to the downstream portion of the
current quadratic, so neither its source nor the upstream strand is activated.
Destination timing reflects the remaining contact-to-end distance; subsequent
layers retain the existing propagation speed. Base ink,
signal ink, and swept contact detection share the current quadratic geometry;
no moving signal particles are rendered. At extreme input
rates, newer impulses at the same origin merge in intensity while earlier wave
timelines remain intact. Distinct contacts remain separate below the hard cap of
128 concurrent waves. At that extreme limit, repeated same-edge emissions merge
into existing intensity while retaining the earlier contact and timeline. The
visual wave count and intensity are bounded.

The automated suite covers topology, assignments, charging and gesture
classification, signal direction and arrivals, concurrent signals, collision
return, reduced motion, pointer coordinates, mobile reachability and boundaries.
Mouse and touch pointer-event integration tests cover all four pan boundaries,
continued outward dragging and immediate reversal, repeated changes of direction,
gesture cancellation, clicks, charged releases, previews and navigation. Panning
consumes each pointer delta even when clamped, so there is no accumulated overscroll.
Tactile tests cover swept and curved contacts, all release directions at 70px,
original-contact ink clipping and arrival timing, CSS-pixel
thresholds under panning, independent simultaneous grabs, cooldown and re-entry,
preview occlusion, cancellation, edge-specific propagation, dense force caps,
stronger near/far gravity, post-strength caps, recovery, and stirring decay without
drift. Connection hover contacts are
tested through the real React pointer-event handlers as well as the pure engine.
Browser checks cover screenshot loading, selection, keyboard navigation,
long-press release, background gravity holds, signals and bounded panning at
desktop and mobile viewport sizes. Button-free strand sweeps are covered by
automated pointer-event tests; the browser-control API does not expose a native
button-free pointer-movement action. Real device touch behavior still needs
hands-on verification; the same pointer-event path supports mouse and touch.

A local simulation-only timing check averaged 0.11ms per idle frame and 0.20ms
with all 85 strands grabbed and repeated 85-edge emissions. These are indicative
host measurements, not browser rendering timings or guarantees for other devices.

## Source structure

```text
src/components/     Invitation, ornaments, nodes, connections, previews
src/hooks/          Animation lifecycle and pointer/keyboard interaction
src/simulation/     Pure network simulation and cached SVG renderer
src/data/           Project metadata and fixed topology
src/config/         Central motion tuning and ink palette
src/utils/          Geometry, gesture classification and signal wave helpers
tests/              Deterministic topology, gesture and simulation checks
public/previews/    Actual project screenshot assets
```

## Tactile update file map

- New: `src/config/tactile.ts`, `src/simulation/ConnectionInteraction.ts`,
  `src/utils/strandGeometry.ts`, `tests/tactile.test.ts`.
- Simulation/rendering: `src/simulation/NetworkSimulation.ts`,
  `src/simulation/SvgRenderer.ts`, `src/components/Connection.tsx`,
  `src/components/Neuron.tsx`.
- Input/lifecycle: `src/hooks/usePointerInteraction.ts`,
  `src/hooks/useNetworkSimulation.ts`.
- Shared helpers/types: `src/utils/geometry.ts`, `src/utils/gesture.ts`,
  `src/utils/signal.ts`, `src/types/network.ts`.
- Regression coverage/documentation: `tests/pointer-interaction.test.tsx`,
  `tests/simulation.test.ts`, `README.md`.

Project metadata, topology, preview assets, and stylesheet design are unchanged.
