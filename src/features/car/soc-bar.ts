// socBar: the battery bar of the Car: the fill, the mark where the charge limit stands and the words under it, which the summary draws.
// Pattern: template function (Lit docs, Templates) over the model's `SocBar`, with its rules in soc-bar.css, which the summary adopts.
// Must not: word a label (the model does), place a mark other than by the percent it is given, or hold state.
import {html, nothing, type TemplateResult} from 'lit';
import type {SocBar} from './model.ts';

/** The bar, then the scale under it: where the charge is, the limit's mark when Ford gives one, and the words ("0%", "Limit 90% · set in FordPass", "100%"). */
export const socBar = ({fill, limit, label, scale}: SocBar): TemplateResult =>
  html`<div class="socbar" role="img" aria-label=${label}>
      <i style="width:${fill}%"></i>${limit ? html`<b style="left:${limit}%"></b>` : nothing}
    </div>
    <div class="socscale">
      <span>${scale.start}</span><span>${scale.limit}</span>${scale.end ? html`<span>${scale.end}</span>` : nothing}
    </div>`;
