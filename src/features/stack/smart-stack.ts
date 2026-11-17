// <hp-smart-stack mode="home" | "idle">: the smart stack, one card at a time that takes turns every twenty seconds, with a dot for
// each card taking turns; in a card of its own on the Home pane on a tablet, and beside the idle clock.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `readStack`, `stackCards` and `stackModel`; a store controller on
// `stackIds` (ADR 0012), `StackHistory` (ADR 0028) and the shell's daily forecast (ADR 0030); the cards are kept in a `CardCache` and a
// twenty-second `TickController` only picks among them. It says `hp-empty` when no card applies, and its container (the Home pane's `#hstk`, the idle screen's `#istk`) hides it.
// Must not: compute the cards on a tick within the same minute, word anything (the rules do), or tell its container more than `hp-empty`.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {keyed} from 'lit/directives/keyed.js';
import './stack-card.ts'; // defines <hp-stack-card>
import {CardCache} from './card-cache.ts';
import {stackCards, type StackCard} from './cards.ts';
import {stackIds} from './ids.ts';
import {readStack} from './inputs.ts';
import {StackHistory} from './loader.ts';
import {stackModel, type StackMode, type StackViewModel} from './model.ts';
import {STACK_TURN_MS} from './rotation.ts';
import stackOwn from './smart-stack.element.css?inline';
import type {ForecastEntry} from '../../core/ha.ts';
import {registriesOf} from '../../core/registry.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {forecastContext, statisticsCacheContext} from '../../ui/contexts.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {EmptyEvent} from '../../ui/events.ts';
import {common} from '../../ui/styles/index.ts';

export class SmartStack extends LitElement {
  static override properties = {mode: {reflect: true}};
  declare mode: StackMode;

  // The element's own rules, its `:host`, the card's frame, the peek and the dots, in both places, are in smart-stack.element.css.
  static override styles = [common, unsafeCSS(stackOwn)];

  /** The stack is always wanted where it is placed: the history loads at its first draw. */
  readonly active = true;
  private changes = 0;
  private readonly storeController = new StoreController(this, {
    ids: store => stackIds(store),
    onChange: () => this.changes++,
  });
  private cache: StatisticsCache | undefined;
  private forecast: readonly ForecastEntry[] = [];
  private readonly history: StackHistory;
  private readonly cards = new CardCache<StackCard[]>();
  private view: StackViewModel | null = null;
  /** What the stack last told its container; undefined until the first draw, which always tells it. */
  private empty: boolean | undefined;

  constructor() {
    super();
    this.mode = 'idle';
    // the panel's one cache (ADR 0028), asked for before the history's controller so its first update finds it
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    new ContextConsumer(this, {
      context: forecastContext,
      subscribe: true,
      callback: forecast => {
        this.forecast = forecast;
      },
    });
    this.history = new StackHistory(this, () => {
      const {store} = this.storeController;
      return {cache: this.cache as StatisticsCache, store, fmt: store.fmt};
    });
    // the turn: every twenty seconds the pick moves on; a tick while the browser tab is hidden is skipped
    new TickController(this, STACK_TURN_MS, () => !document.hidden);
  }

  protected override willUpdate(): void {
    const {hass, config, names, fmt, t, generation} = this.storeController.store;
    if (!hass) return;
    const now = Date.now();
    const history = this.history.data;
    const forecast = this.forecast;
    const cards = this.cards.get({changes: this.changes, now, history, forecast, generation}, () =>
      stackCards(
        readStack(hass.states, registriesOf(hass), config, names, {
          now,
          fmt,
          location: hass.config,
          forecast: [...forecast],
          history,
        }),
        {t, fmt},
      ),
    );
    this.view = stackModel(cards, now, this.mode);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const several = view.n > 1;
    return html`<div class="scw">
        ${several && this.mode === 'idle' ? html`<div class="speek"></div>` : nothing}${keyed(
          view.card.key,
          html`<hp-stack-card .card=${view.card} mode=${this.mode}></hp-stack-card>`,
        )}
      </div>
      ${
        several
          ? html`<div class="sdots" aria-hidden="true">
              ${Array.from({length: view.n}, (_, i) => html`<i class=${i === view.i ? 'on' : ''}></i>`)}
            </div>`
          : nothing
      }`;
  }

  // the container hides the slot while no card applies, as the legacy panel hid it; told once per change
  protected override updated(): void {
    const empty = this.view === null;
    if (empty === this.empty) return;
    this.empty = empty;
    this.dispatchEvent(new EmptyEvent(empty));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-smart-stack': SmartStack;
  }
}

if (!customElements.get('hp-smart-stack')) customElements.define('hp-smart-stack', SmartStack);
