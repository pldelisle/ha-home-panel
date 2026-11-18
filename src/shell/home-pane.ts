// <hp-home-pane>: the Home tab: the config card, a column of one card per subject (the weather, Who's home and, on a tablet, the smart
// stack), the six tiles with the Security card, and the scenes row. The shell imports features; a feature never imports the shell or another feature (ADR 0017).
// Pattern: a humble composition (Meszaros, xUnit Test Patterns), the composition root's child: each card is its feature's element on its
// own ids (ADR 0012), drawn in light DOM (ADR 0032) so the pane's parts stay items of the `.pane-home` grid, styled by home-pane.css.
// On a phone the weather card carries a button over it, named by `weatherCardLabel`, rather than being a button around its words. It loads the Energy and Water heater tiles' history (`HomeHistory`) and hands it down. It has no heading: the header's greeting is Home's one title (#426). Must not: read
// an entity but through `weatherCardLabelIds`, word anything (the cards and the readers do), or hold logic beyond placing them and that load.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import './config-card.ts'; // defines <hp-config-card>
import './glance-tile.ts'; // defines <hp-glance-tile>
import {HomeHistory} from './home-history.ts';
import paneCss from './home-pane.css?inline';
import {GLANCE_SOURCES, type GlanceDeps} from './home-tiles.ts';
import type {StatisticsCache} from '../core/statistics-cache.ts';
import '../features/media/index.ts'; // defines <hp-scene-tiles>
import '../features/people/index.ts'; // defines <hp-who-card>
import '../features/security/index.ts'; // defines <hp-security-card>
import '../features/stack/index.ts'; // defines <hp-smart-stack>
import {weatherCardLabel, weatherCardLabelIds, weatherFeature} from '../features/weather/index.ts'; // defines <hp-weather-card>
import {StoreController} from '../ui/controllers/store-controller.ts';
import {TickController} from '../ui/controllers/tick.ts';
import {appearanceContext, statisticsCacheContext} from '../ui/contexts.ts';
import {SheetRequestEvent, type EmptyEvent} from '../ui/events.ts';

/** The pane's rules, joined after the legacy sheet in the shell's root, where the pane draws (ADR 0032). */
export const homePaneStyles = unsafeCSS(paneCss);

export class HomePane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    stackEmpty: {state: true},
    scenesEmpty: {state: true},
  };
  /** Set by the shell: this pane is the tab on screen. */
  declare active: boolean;
  /** The stack and the scenes said they have nothing: their slot is hidden, as the legacy panel hid it. */
  declare private stackEmpty: boolean;
  declare private scenesEmpty: boolean;

  // the phone's weather card's name, which the weather entities move
  private readonly storeController = new StoreController(this, {ids: store => weatherCardLabelIds(store)});
  private readonly appearance = new ContextConsumer(this, {context: appearanceContext, subscribe: true});
  private cache: StatisticsCache | undefined;
  private readonly history: HomeHistory;

  constructor() {
    super();
    this.active = false;
    this.stackEmpty = true;
    this.scenesEmpty = true;
    // the panel's one cache (ADR 0028), asked for before the history's controller so its first update finds it
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
    this.history = new HomeHistory(this, () => {
      const {store} = this.storeController;
      return {cache: this.cache as StatisticsCache, store, fmt: store.fmt};
    });
    // each minute the tiles' "today" moves on and, once the cache would have let it go, the history is asked again (the legacy panel's every fifteen minutes)
    new TickController(this, 60_000, () => this.active);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private get compact(): boolean {
    return this.appearance.value?.compact ?? false;
  }

  // on a phone the card opens the weather detail, as the legacy card did
  private readonly openWeather = (): void => {
    if (this.compact && weatherFeature.detailSheet)
      this.dispatchEvent(new SheetRequestEvent(weatherFeature.detailSheet));
  };

  protected override render() {
    const compact = this.compact;
    const data = this.history.data;
    const deps: GlanceDeps = {history: data, now: Date.now()};
    return html`<hp-config-card></hp-config-card>
      <div class="hleft" id="hleft">
        <div
          class="card hwx${compact ? ' tap' : ''}"
          id="hwx"
          data-opens=${compact ? (weatherFeature.detailSheet ?? nothing) : nothing}
        >
          <hp-weather-card></hp-weather-card>${
            compact
              ? html`<button
                  type="button"
                  class="hwx-open"
                  aria-label=${weatherCardLabel(this.storeController.store)}
                  @click=${this.openWeather}
                ></button>`
              : nothing
          }
        </div>
        <div class="card hwhoc" id="hwho"><hp-who-card></hp-who-card></div>
        ${
          compact
            ? nothing
            : html`<div
                class="hstk"
                id="hstk"
                ?hidden=${this.stackEmpty}
                @hp-empty=${(e: EmptyEvent) => (this.stackEmpty = e.detail.empty)}
              >
                <hp-smart-stack .mode=${'home'}></hp-smart-stack>
              </div>`
        }
      </div>
      <div class="hright">
        <div class="htiles" id="htiles">
          ${repeat(
            GLANCE_SOURCES,
            source => source.key,
            source => html`<hp-glance-tile .source=${source} .deps=${deps} .active=${this.active}></hp-glance-tile>`,
          )}
        </div>
        <div id="hsec"><hp-security-card></hp-security-card></div>
      </div>
      <div
        class="hscenes"
        id="hscenes"
        ?hidden=${this.scenesEmpty}
        @hp-empty=${(e: EmptyEvent) => (this.scenesEmpty = e.detail.empty)}
      >
        <hp-scene-tiles></hp-scene-tiles>
      </div>`;
  }
}

if (!customElements.get('hp-home-pane')) customElements.define('hp-home-pane', HomePane);

declare global {
  interface HTMLElementTagNameMap {
    'hp-home-pane': HomePane;
  }
}
