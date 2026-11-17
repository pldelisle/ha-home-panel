// <hp-who-card>: the Home card's Who's home, its label above the chips, or the hint when no one is tracked.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `peopleModel`; the chips are `<hp-who-chips place="card">`, so the two
// places draw one row. The Home pane composes it in a card of its own (#268, #397).
// Must not: read an entity itself (`presence` does), word anything (the model does), or draw the chips' row itself.
import {LitElement, html, unsafeCSS} from 'lit';
import './who-chips.ts'; // defines <hp-who-chips>
import cardOwn from './who-card.element.css?inline';
import {peopleIds} from './ids.ts';
import {peopleModel, type PeopleViewModel} from './model.ts';
import {registriesOf} from '../../core/registry.ts';
import {presence} from '../../providers/people.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {common} from '../../ui/styles/index.ts';

export class WhoCard extends LitElement {
  // The element's own rules, its `:host`, the label and the hint, are in who-card.element.css.
  static override styles = [common, unsafeCSS(cardOwn)];

  private readonly storeController = new StoreController(this, {ids: store => peopleIds(store)});
  private view: PeopleViewModel | undefined;

  protected override willUpdate(): void {
    const {hass, config, t} = this.storeController.store;
    this.view = hass ? peopleModel(presence(hass.states, registriesOf(hass), config.people), {t}) : undefined;
  }

  protected override render() {
    const view = this.view;
    if (!view) return html``;
    return html`<div class="hwho">${view.label}</div>
      ${
        view.hint === null ? html`<hp-who-chips place="card"></hp-who-chips>` : html`<p class="nobody">${view.hint}</p>`
      }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-who-card': WhoCard;
  }
}

if (!customElements.get('hp-who-card')) customElements.define('hp-who-card', WhoCard);
