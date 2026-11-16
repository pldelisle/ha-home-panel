// carSide: the drawn car, seen from the side, which the Car card shows in the house's colour when Ford sends no photo or the photo fails to load.
// Pattern: a template function (Lit docs, Templates) over a constant drawing: the shapes are the legacy panel's `CARSVG`, in the tokens the frame defines (`--car-body`, `--car-glass`, ...),
// so the theme recolours it with no redraw; the body colour is the one custom property the config may set on it. The legacy detail keeps its own copy until #252, which adds the top view here.
// Must not: word its label (the card does, through the catalog), read an entity or the config, or hold state.
import {svg, type SVGTemplateResult} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';

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
