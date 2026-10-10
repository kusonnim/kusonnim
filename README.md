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
- All neurons are keyboard reachable. Enter or Space selects/activates; holding
  either key charges. Keyboard focus remains on the selected neuron.
- Reduced-motion preference disables idle and pointer displacement and makes
  preview expansion immediate; meaningful signal propagation remains available.

These instructions are documentation only; they do not appear in the interface.

## Configuration

- `src/config/motion.ts`: mouse influence (0.62), signal speed (0.15), preview
  scale (8), charging curve and cap, animation smoothing, collisions and pan bounds.
- `src/config/theme.ts` and `src/styles/global.css`: ink, parchment and typography.
- `src/data/projects.ts`: fixed project assignments, URLs, image paths and crop
  focus. Add a project only to an available hidden neuron. Invalid or duplicate
  positions throw an explicit error rather than overwrite an existing project.
- `src/data/network.ts`: the deterministic `1 → 5 → 5 → 5 → 5 → 1` topology,
  containing 22 neurons and 85 adjacent-layer directed connections.

## Preview assets

All eight supplied project URLs were visited and their actual screens
captured on October 10, 2026. The screenshots are stored under `public/previews/`
as `.jpg`, the browser's native screenshot format. They preserve the original
project colors; they are not generated mockups. Some show the project's initial
empty state before a visitor supplies a file or text. Autumn String was captured
after a few interactions with its threads to show the artwork more clearly.

Replace these files with updated screenshots, or change the corresponding
`preview` path in `src/data/projects.ts` to a WebP/PNG asset. Each project's `focus`
uses normalized x/y values for the image's CSS `object-position`. Missing images
display a restrained local fallback bearing the project name.

## Implementation and verification

One `requestAnimationFrame` loop advances a pure simulation and updates cached
SVG references, without React renders on each frame. Motion is interpolated from
stable base positions and local collision projections, with no spring velocities
or accumulated positional offsets. The clock pauses while the page is hidden.

Signals visit each reachable edge and neuron once per wave. Line gradients follow
the moving endpoints; no moving signal particles are rendered. At extreme input
rates, newer impulses at the same origin merge in intensity while earlier wave
timelines remain intact. The visual wave count and intensity are bounded.

The automated suite covers topology, assignments, charging and gesture
classification, signal direction and arrivals, concurrent signals, collision
return, reduced motion, pointer coordinates, mobile reachability and boundaries.
Browser checks cover screenshot loading, selection, keyboard navigation,
long-press release, signals and bounded panning. Real device touch behavior still
needs hands-on verification; the same pointer-event path supports mouse and touch.

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
