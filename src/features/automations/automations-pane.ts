// <hp-automations-pane>: the Automations tab: the heading with what runs now and today, then the Today card, the flow cards (the
// selected run, the one running now, the last decision, the last completed) and every automation's chip; the loading line until the
// first runs arrive, or the card that says Home Assistant refused them. It holds the selection and the loader.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `automationsModel` runs in `willUpdate`; a store controller
// on `automationIds` (ADR 0012) and the loader pause while the pane is off screen; a tick every twenty seconds asks for the runs again.
// Must not: read Home Assistant's records itself (the loader does), word anything (the model does), or draw a flow (the cards do).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import './automation-list.ts'; // defines <hp-automation-list>
import type {SelectRunEvent} from './events.ts';
import type {FlowCard} from './flow-card.ts';
import './flow-card.ts'; // defines <hp-flow-card>
import {automationIds} from './ids.ts';
import {TracesLoader} from './loader.ts';
import {automationsModel, type AutomationsViewModel} from './model.ts';
import './run-timeline.ts'; // defines <hp-run-timeline>
import shared from './styles.css?inline';
import own from './automations-pane.element.css?inline';
import {fingerprint, type Selection} from './traces.ts';
import {automationsOf, type Automation} from '../../providers/automations.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ResizeController} from '../../ui/controllers/resize.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {lens} from '../../ui/lens.ts';
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

const TOKENS = ['ok', 'crit', 'warn', 'card', 'ring', 'fg', 'fg3', 'line'] as const;

export class AutomationsPane extends LitElement {
  static override properties = {active: {type: Boolean, reflect: true}};
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to nothing and reads no run. */
  declare active: boolean;

  static override styles = [common, inner, unsafeCSS(forShadow(shared)), unsafeCSS(forShadow(own))];

  private readonly storeController = new StoreController(this, {
    ids: store => automationIds(store),
    onChange: () => this.statesChanged(),
  });
  private readonly appearance = new AppearanceConsumer(this);
  private readonly loader = new TracesLoader(this, {
    automations: () => this.automations,
    selection: () => this.selection,
  });
  // the timeline is laid out for the width of the pane's column
  private readonly size = new ResizeController(this, () => this.renderRoot.querySelector('.auhost'));
  private automations: Automation[] = [];
  private selection: Selection | null = null;
  private seen = '';
  private view: AutomationsViewModel | undefined;

  constructor() {
    super();
    this.active = false;
    // the runs are asked for again at most every twenty seconds while the tab is shown, and the now line moves with them
    new TickController(this, 20_000, () => this.active);
  }

  // A change of the automations (one ran, started, ended or was switched) asks for the runs again once it has settled.
  private statesChanged(): void {
    const {hass, names} = this.storeController.store;
    if (!hass) return;
    const now = fingerprint(automationsOf(hass.states, names));
    if (now === this.seen) return;
    const first = !this.seen;
    this.seen = now;
    if (!first) this.loader.changed();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) {
        this.storeController.resume();
        this.loader.resume();
      } else {
        this.storeController.pause();
        this.loader.pause();
      }
    }
    if (!this.active) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    this.automations = automationsOf(hass.states, store.names);
    if (!this.seen) this.seen = fingerprint(this.automations);
    void this.loader.load(this.loader.data.list === null && this.loader.data.error === null);
    const style = getComputedStyle(this);
    const css = (name: string) => style.getPropertyValue(`--${name}`).trim() || '#888';
    this.view = automationsModel(
      {
        automations: this.automations,
        states: hass.states,
        now: Date.now(),
        width: this.size.width,
        compact: this.appearance.value?.compact === true,
        tokens: Object.fromEntries(TOKENS.map(k => [k, css(k)])) as Record<(typeof TOKENS)[number], string>,
      },
      this.loader.data,
      this.selection,
      {t: store.t, fmt: store.fmt, names: store.names},
    );
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'flow'} .color=${'var(--c-heat)'} .heading=${t('auto.title')}>
        <div slot="sub">${view.sub}</div>
      </hp-pane-header>
      <div class="auhost" @select-run=${this.onSelect} @close-selection=${this.onClose}>${this.renderBody(view)}</div>
      ${lens}`;
  }

  private renderBody(view: AutomationsViewModel) {
    const {t} = this.storeController.store;
    if (view.loading) return html`<p class="loading">${t('automations.loading')}</p>`;
    if (view.refused)
      return html`<section class="aubox">
        <div class="top"><span class="aulbl">${t('auto.title')}</span></div>
        <p class="hint">${view.refused}</p>
      </section>`;
    return html`<hp-run-timeline .view=${view.today}></hp-run-timeline>
      ${repeat(
        view.cards,
        card => card.key,
        card => html`<hp-flow-card .view=${card}></hp-flow-card>`,
      )}
      ${view.empty ? html`<section class="aubox"><p class="hint">${view.empty}</p></section>` : nothing}
      <hp-automation-list
        .rows=${view.rows}
        .heading=${t('automations.chips.title')}
        .caption=${t('automations.chips.caption')}
      ></hp-automation-list>`;
  }

  // a dot, a chip or a run of the picker: its card is drawn first and scrolled to
  private readonly onSelect = (e: SelectRunEvent): void => {
    e.stopPropagation();
    this.selection = e.selection;
    void this.loader.load(true);
    this.requestUpdate();
    void this.updateComplete.then(() => {
      const card = [...this.renderRoot.querySelectorAll<FlowCard>('hp-flow-card')].find(
        c => c.view?.kind === 'selected',
      );
      card?.renderRoot.querySelector('.ausel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
  };

  private readonly onClose = (e: Event): void => {
    e.stopPropagation();
    this.selection = null;
    void this.loader.load(true);
    this.requestUpdate();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-automations-pane': AutomationsPane;
  }
}

if (!customElements.get('hp-automations-pane')) customElements.define('hp-automations-pane', AutomationsPane);
