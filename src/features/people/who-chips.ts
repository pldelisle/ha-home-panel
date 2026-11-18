// <hp-who-chips place="header" | "card">: Who's home as plain text, a dot, the first name and "home" or "away" for each configured person.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `peopleModel`, run in `willUpdate` on the provider's `presence`, with a
// store controller on `peopleIds` (ADR 0012); `place` picks the header's or the Home card's look, as the legacy `.hello div` and `.hwx .wp` did.
// `<hp-who-card>` places it in the Home card; the header's greeting no longer does (#426), so `place="header"` is unused.
// Must not: read an entity itself (`presence` does), word anything (the model does), or draw anything when no one is tracked.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import chipsOwn from './who-chips.element.css?inline';
import {peopleIds} from './ids.ts';
import {peopleModel, type PeopleViewModel} from './model.ts';
import {registriesOf} from '../../core/registry.ts';
import {presence} from '../../providers/people.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common, status} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class WhoChips extends LitElement {
  static override properties = {place: {reflect: true}};
  /** Where the chips sit: the header's greeting, or the Home card's Who's home. */
  declare place: 'header' | 'card';

  // The element's own rules, its `:host`, the chips and the two places' differences, are in who-chips.element.css.
  static override styles = [common, status, unsafeCSS(forShadow(chipsOwn))];

  private readonly storeController = new StoreController(this, {ids: store => peopleIds(store)});
  private view: PeopleViewModel | undefined;

  constructor() {
    super();
    this.place = 'header';
    // `compact` and `glass` come from the shell as host attributes the chips' rules test
    new AppearanceConsumer(this);
  }

  protected override willUpdate(): void {
    const {hass, config, t} = this.storeController.store;
    this.view = hass ? peopleModel(presence(hass.states, registriesOf(hass), config.people), {t}) : undefined;
  }

  protected override render() {
    const view = this.view;
    if (!view?.chips.length) return nothing;
    return html`<div class="who" aria-label=${view.label}>
      ${repeat(
        view.chips,
        chip => chip.name,
        chip =>
          html`<span class=${chip.home ? 'status ok' : 'status'}
            ><i aria-hidden="true"></i>${chip.name}<small>${chip.state}</small></span
          >`,
      )}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-who-chips': WhoChips;
  }
}

if (!customElements.get('hp-who-chips')) customElements.define('hp-who-chips', WhoChips);
