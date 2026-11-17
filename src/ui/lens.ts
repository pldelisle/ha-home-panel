// The Mercury drop's filter, for an element's own shadow root: the `#glass-distortion` the frame's `--g-bd` names in Chromium.
// Pattern: tree-scoped references (CSS Scoping Module Level 1): a `url(#id)` finds an element of the tree its element is in,
// so a root with glass of its own draws the filter again, one copy per root, parsed once (Lit docs, Templates).
// Must not: decide whether the lens is on (`--g-bd` does: without the lens it holds no url and the copy is inert), or draw anything else.
// Always drawn since the guest went (#277): the shell's own filter is never wiped any more (#198), so neither is the copy's reason.
import {html} from 'lit';

/** The filter, to draw last inside an element's own root that has glass. */
export const lens = html`<svg aria-hidden="true" style="position:absolute;width:0;height:0">
  <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
    <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
    <feDisplacementMap in="SourceGraphic" in2="blurred" scale="150" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>`;
