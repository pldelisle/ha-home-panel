// carArt, carSide and carTop: the car's picture: Ford's photo, else the car drawn from the side (the card's and the battery block's), and the car drawn from above (the tire pressures' centre).
// Pattern: template functions (Lit docs, Templates) over constant drawings, in the tokens the frame defines (`--car-body`, `--car-glass`, ...), so the theme recolours them with no redraw;
// the body colour is the one custom property the config may set, on the side view and on the top view. The pane keeps whether the photo failed, and the card and the battery block call `carArt` with it.
// Must not: word a label (the model does, through the catalog), read an entity or the config, or hold state.
import {html, svg, type SVGTemplateResult} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import type {CarArtView} from './model.ts';

/** The car from the side: `color` is the body's, null for the frame's default; `label` is what a screen reader says. */
export const carSide = (color: string | null, label: string): SVGTemplateResult =>
  svg`<svg
    class="carside"
    viewBox="0 0 340 128"
    role="img"
    aria-label=${label}
    style=${ifDefined(color ? `--car-body:${color}` : undefined)}
  >
    <ellipse cx="172" cy="118" rx="150" ry="6" fill="var(--house-shadow)" />
    <path d="M28 100V82c0-8 4-13 12-15l16-4c20-15 52-28 94-30 30-1 52 3 72 13l26 15c26 2 50 6 64 10 8 3 12 9 12 17v12z" fill="var(--car-body)" />
    <path d="M60 64c22-12 50-22 90-24 26-1 48 2 68 11l18 11c-50-4-120-4-176 2z" fill="var(--car-hi)" opacity=".55" />
    <path d="M86 60c20-11 42-17 66-18l2 18zM161 42c22 0 40 4 56 12l14 7-70-1z" fill="var(--car-glass)" /><path d="M157 41h5v20h-5z" fill="var(--car-body)" />
    <path d="M40 68h14v4H40z" fill="#C8463C" /><path d="M302 72l16 2v3l-16-1z" fill="var(--car-lamp)" />
    <path d="M116 94h120v6H116zM28 94h14v6H28zM312 94h14v6h-14z" fill="var(--car-clad)" /><path d="M58 100a32 30 0 0 1 64 0zM232 100a32 30 0 0 1 64 0z" fill="var(--car-clad)" />
    <g><circle cx="90" cy="101" r="22" fill="var(--car-tire)" /><circle cx="90" cy="101" r="14" fill="var(--car-rim)" /><circle cx="90" cy="101" r="4" fill="var(--car-tire)" /></g>
    <g><circle cx="264" cy="101" r="22" fill="var(--car-tire)" /><circle cx="264" cy="101" r="14" fill="var(--car-rim)" /><circle cx="264" cy="101" r="4" fill="var(--car-tire)" /></g>
  </svg>`;

/** The car from above, 90 by 170 pixels, in the config's body colour as the side view is (null for the frame's); `label` is what a screen reader says. */
export const carTop = (color: string | null, label: string): SVGTemplateResult =>
  svg`<svg
    viewBox="0 0 90 170"
    width="90"
    height="170"
    role="img"
    aria-label=${label}
    style=${ifDefined(color ? `--car-body:${color}` : undefined)}
  >
    <rect x="12" y="6" width="66" height="158" rx="26" fill="var(--car-body)" /><path d="M20 52c8-6 42-6 50 0l-4 22H24zM24 112h42l4 20c-8 6-42 6-50 0z" fill="var(--car-glass)" />
    <rect x="2" y="30" width="10" height="26" rx="4" fill="var(--car-tire)" /><rect x="78" y="30" width="10" height="26" rx="4" fill="var(--car-tire)" />
    <rect x="2" y="114" width="10" height="26" rx="4" fill="var(--car-tire)" /><rect x="78" y="114" width="10" height="26" rx="4" fill="var(--car-tire)" />
  </svg>`;

/** Ford's photo through the image proxy, or the drawn car where there is none or `failed` says it did not load; `onError` is told when the photo fails.
 * `.carimg` is styled in both the card's and the battery block's element CSS: they are separate shadow roots. */
export const carArt = ({picture, color, name, drawing}: CarArtView, failed: boolean, onError: () => void) =>
  picture && !failed
    ? html`<img class="carimg" src=${picture} alt=${name} @error=${onError} />`
    : carSide(color, drawing);
