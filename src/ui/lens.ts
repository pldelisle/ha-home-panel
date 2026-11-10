// The Mercury drop's filter, for an element's own shadow root: the `#glass-distortion` the frame's `--g-bd` names in Chromium.
// Pattern: tree-scoped references (CSS Scoping Module Level 1): a `url(#id)` finds an element of the tree its element is in,
// so a root with glass of its own draws the filter again, one copy per root, parsed once (Lit docs, Templates).
// Must not: decide whether the lens is on (`--g-bd` does: without the lens it holds no url and the copy is inert), or draw anything else.
// Temporary: it draws the copy only where the guest's filter is, as the guest's own glass has it, until the guest's
// `lensAll` (src/home-panel.js) goes (#188) or its wiped filter is fixed (#198); then the copy is always drawn.
import {html, nothing, type TemplateResult} from 'lit';

const lens = html`<svg aria-hidden="true" style="position:absolute;width:0;height:0">
  <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
    <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
    <feDisplacementMap in="SourceGraphic" in2="blurred" scale="150" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>`;

/**
 * The filter, to draw inside an element's own root, when the root the element sits in (`outer`) has one: the guest's redraw
 * wipes its filter without drawing it again (#198), and the glass it draws then has no lens, so neither may the element's.
 */
export const lensLike = (outer: Node): TemplateResult | typeof nothing =>
  (outer as ParentNode).querySelector('#glass-distortion') ? lens : nothing;
