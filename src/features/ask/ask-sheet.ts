// <hp-ask-sheet>: the Ask sheet: a text field and its send button, then, in a polite live region, the progress of a question, its answer or the line that says why it has none.
// Pattern: humble object (Meszaros, xUnit Test Patterns) composing the kit's <hp-sheet> for its chrome and `AskLoader` for the question; properties down (`open`), events up (`sheet-close` passes through).
// The sheet is read-only and keeps nothing: it asks the loader to open when it opens and to close when it closes, so the next opening starts empty (spec 29, story 20), and it subscribes to no entity.
// Must not: draw a sheet's chrome, listen for Escape or know which sheet is open (the shell and its host do), call a model or the API client (the loader does), word a figure, or show the model's own words.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import ownCss from './ask-sheet.element.css?inline';
import './ask-answer.ts'; // defines <hp-ask-answer>
import {askNotes} from './checks.ts';
import {QUESTION_CAP} from './instructions.ts';
import {AskLoader} from './loader.ts';
import {askView} from './model.ts';
import {weekStartOf} from './period.ts';
import type {PanelApi} from '../../core/api.ts';
import {browserDefaults} from '../../core/i18n/browser.ts';
import {ENGLISH_TAG, panelLocale} from '../../core/i18n/locale.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext, statisticsCacheContext} from '../../ui/contexts.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {button, common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AskSheet extends LitElement {
  static override properties = {open: {type: Boolean, reflect: true}, draft: {state: true}};
  /** On screen: the shell binds it to the sheet host's `isOpen`. Opening builds the catalog and empties the field; closing lets a question go. */
  declare open: boolean;
  /** What the field holds. */
  declare private draft: string;

  static override styles = [common, button, unsafeCSS(forShadow(ownCss))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  // `design` and `compact` as host attributes, which the element's rules test
  private readonly appearance = new AppearanceConsumer(this);
  // the panel's services arrive by context (ADR 0018); the loader reads them when it is used
  private api: PanelApi | undefined;
  private cache: StatisticsCache | undefined;
  private readonly loader = new AskLoader(this, () => {
    const {store} = this.storeController;
    const {hass} = store;
    return {
      api: this.api as PanelApi,
      cache: this.cache as StatisticsCache,
      store,
      weekStart: weekStartOf(store.isFrench && hass ? panelLocale(hass, browserDefaults()).tag : ENGLISH_TAG),
      now: () => new Date(),
    };
  });

  constructor() {
    super();
    this.open = false;
    this.draft = '';
    new ContextConsumer(this, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.api = api;
      },
    });
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    this.draft = '';
    if (this.open) this.loader.open();
    else this.loader.close();
  }

  private readonly onInput = (e: Event): void => {
    this.draft = (e.target as HTMLInputElement).value;
  };

  private readonly onSubmit = (e: SubmitEvent): void => {
    e.preventDefault();
    this.loader.ask(this.draft);
  };

  protected override render() {
    const {t} = this.storeController.store;
    return html`<hp-sheet
      .open=${this.open}
      .icon=${'ask'}
      .color=${'var(--c-home)'}
      .heading=${t('ask.title')}
      .closeLabel=${t('ask.close')}
    >
      ${this.open ? this.renderBody() : nothing}
    </hp-sheet>`;
  }

  // drawn only while open: the catalog is the loader's, built when the sheet opens, and a closed sheet reads no house
  private renderBody() {
    const {store} = this.storeController;
    const {t} = store;
    const {state, catalog} = this.loader;
    // the answered plan's sensor, found once: the view names it and the chart draws it in its unit
    const sensor = state.at === 'answered' ? catalog.entries.find(entry => entry.key === state.plan.sensor) : undefined;
    const view = askView(state, t, store.fmt, sensor);
    // what the catalog says against the config is an admin's business, as the config card's problems are
    const notes = askNotes(catalog, store.isAdmin, t);
    return html`<div class="body">
      <form class="ask" id="ask-form" @submit=${this.onSubmit}>
        <label class="sr" for="ask-question">${t('ask.field')}</label>
        <input
          id="ask-question"
          class="field"
          type="text"
          autocomplete="off"
          .enterKeyHint=${'send'}
          maxlength=${QUESTION_CAP}
          placeholder=${t('ask.placeholder')}
          autofocus
          .value=${this.draft}
          @input=${this.onInput}
        />
        <button class="abtn send" id="ask-send" type="submit">${t('ask.send')}</button>
      </form>
      ${notes.map(note => html`<p class="admin-note">${note}</p>`)}
      <div class="result" id="ask-result" aria-live="polite">
        ${
          view.message
            ? html`<p class="message ${state.at === 'failed' ? 'failed' : 'progress'}" id="ask-message">
                ${view.message}
              </p>`
            : nothing
        }
        ${
          state.at === 'answered'
            ? html`<hp-ask-answer
                .view=${view}
                .answer=${state.answer}
                .name=${catalog.entries.find(entry => entry.key === state.plan.sensor)?.name ?? ''}
                .unit=${catalog.entries.find(entry => entry.key === state.plan.sensor)?.unit ?? ''}
              ></hp-ask-answer>`
            : nothing
        }
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-ask-sheet': AskSheet;
  }
}

if (!customElements.get('hp-ask-sheet')) customElements.define('hp-ask-sheet', AskSheet);
