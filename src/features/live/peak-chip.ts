// <hp-peak-chip>: the header's "Critical peak now" chip, before the live pill, while Hydro-Québec says a critical peak is on; nothing otherwise.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the provider's `peakNow`, subscribed to the three Hydro-Québec sensors through a
// `StoreController` (ADR 0012); it draws the chip `renderHeader` drew (#257 deleted it), on `.peak`.
// Must not: read another entity, word the text but through the catalog, or open anything (the chip is no button).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './peak-chip.element.css?inline';
import {hydroQuebec} from '../../providers/hydro-quebec.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lens} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class PeakChip extends LitElement {
  static override styles = [common, unsafeCSS(forShadow(ownCss))];

  private readonly storeController = new StoreController(this, {
    ids: ({config: {entities}}) =>
      [entities.hq, entities.hqPeak, entities.hqUpcoming].filter((id): id is string => !!id),
  });

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const {hass, config, t} = this.storeController.store;
    if (!hass || !hydroQuebec(hass.states, config)?.peakNow) return nothing;
    return html`<div class="peak"><span class="dot"></span>${t('live.criticalPeakNow')}</div>
      ${lens}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-peak-chip': PeakChip;
  }
}

if (!customElements.get('hp-peak-chip')) customElements.define('hp-peak-chip', PeakChip);
