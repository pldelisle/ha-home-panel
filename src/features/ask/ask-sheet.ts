// <hp-ask-sheet>: the Ask sheet: a text field and its send button, then, in a polite live region, the progress of a question, its answer or the line that says why it has none.
// Pattern: humble object (Meszaros, xUnit Test Patterns) composing the kit's <hp-sheet> for its chrome and `AskLoader` for the question; properties down (`open`), events up (`sheet-close` passes through).
// The sheet is read-only and keeps nothing: it asks the loader to open when it opens and to close when it closes, so the next opening starts empty (spec 29, story 20), and it subscribes to no entity.
// Must not: draw a sheet's chrome, build a suggestion (suggestions.ts does) or send its words to a model, listen for Escape or know which sheet is open (the shell and its host do), call a model or the API client (the loader does), word a figure, or show the model's own words.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import ownCss from './ask-sheet.element.css?inline';
import './ask-answer.ts'; // defines <hp-ask-answer>
import {askNotes} from './checks.ts';
import {QUESTION_CAP} from './instructions.ts';
import {askSuggestions, type Suggestion} from './suggestions.ts';
import {AskLoader} from './loader.ts';
import {askView, canRetry, sensorOf, type AskState} from './model.ts';
import {weekStartOf} from './period.ts';
import type {PanelApi} from '../../core/api.ts';
import type {Translate} from '../../core/i18n/messages.ts';
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

  // the Cancel button had focus before this update: when it is gone after it (a timeout, an answer), focus goes to Try again where it is shown, else to the field, and not to the page
  private cancelHadFocus = false;

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.cancelHadFocus =
      this.renderRoot.querySelector('#ask-cancel') !== null &&
      (this.renderRoot as ShadowRoot).activeElement?.id === 'ask-cancel';
    if (!changed.has('open')) return;
    this.draft = '';
    if (this.open) this.loader.open();
    else this.loader.close();
  }

  protected override updated(): void {
    if (!this.cancelHadFocus || this.renderRoot.querySelector('#ask-cancel')) return;
    this.cancelHadFocus = false;
    (
      this.renderRoot.querySelector<HTMLElement>('#ask-retry') ??
      this.renderRoot.querySelector<HTMLElement>('#ask-question')
    )?.focus();
  }

  private readonly onInput = (e: Event): void => {
    this.draft = (e.target as HTMLInputElement).value;
  };

  private readonly onSubmit = (e: SubmitEvent): void => {
    e.preventDefault();
    this.loader.ask(this.draft);
  };

  // the field takes focus back when the button that had it is gone: a cancel returns to the question, kept as it was typed
  private focusField(): void {
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>('#ask-question')?.focus());
  }

  private readonly onCancel = (): void => {
    this.loader.cancel();
    this.focusField();
  };

  private readonly onRetry = (): void => {
    const {state} = this.loader;
    if (state.at !== 'failed') return;
    this.loader.ask(state.question);
    this.focusField();
  };

  // a tap asks the suggestion as it stands, with no model: the field shows its words, and has focus again where the button that had it is gone
  private readonly onSuggest = (suggestion: Suggestion): void => {
    this.draft = suggestion.text;
    this.loader.suggest(suggestion);
    this.focusField();
  };

  // the suggested questions, under the field when it is empty and under the line that says a question could not be placed; none for a house with nothing to suggest
  private renderSuggestions(state: AskState, suggestions: Suggestion[], t: Translate) {
    const shown = state.at === 'idle' || (state.at === 'failed' && state.reason === 'unsupported');
    if (!shown || suggestions.length === 0) return nothing;
    return html`<div class="suggest" role="group" aria-labelledby="ask-suggest-title">
      <p class="suggest-title" id="ask-suggest-title">${t('ask.suggest.title')}</p>
      ${suggestions.map(
        suggestion =>
          html`<button class="abtn suggestion" type="button" @click=${() => this.onSuggest(suggestion)}>
            ${suggestion.text}
          </button>`,
      )}
    </div>`;
  }

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

  // the line that stands in place of an answer: a progress row with its Cancel, a failure with its Try again where a second try can change something, a failure alone otherwise
  private renderMessage(state: AskState, message: string, t: Translate) {
    const failed = state.at === 'failed';
    const line = html`<p class="message ${failed ? 'failed' : 'progress'}" id="ask-message">${message}</p>`;
    if (failed && !canRetry(state)) return line;
    return html`<div class="outcome">
      ${line}
      ${
        failed
          ? html`<button class="abtn" id="ask-retry" type="button" @click=${this.onRetry}>${t('ask.retry')}</button>`
          : html`<button class="abtn" id="ask-cancel" type="button" @click=${this.onCancel}>${t('ask.cancel')}</button>`
      }
    </div>`;
  }

  // drawn only while open: the catalog is the loader's, built when the sheet opens, and a closed sheet reads no house
  private renderBody() {
    const {store} = this.storeController;
    const {t} = store;
    const {state, catalog} = this.loader;
    // the sensor the state is about, found once: the view names it and the chart draws it in its unit
    const sensor = sensorOf(state, catalog);
    const suggestions = askSuggestions(catalog, t);
    const view = askView(state, t, store.fmt, sensor, suggestions.length > 0);
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
        ${view.message ? this.renderMessage(state, view.message, t) : nothing}
        ${
          state.at === 'answered'
            ? html`<hp-ask-answer
                .view=${view}
                .answer=${state.answer}
                .name=${sensor?.name ?? ''}
                .unit=${sensor?.unit ?? ''}
              ></hp-ask-answer>`
            : nothing
        }
      </div>
      ${this.renderSuggestions(state, suggestions, t)}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-ask-sheet': AskSheet;
  }
}

if (!customElements.get('hp-ask-sheet')) customElements.define('hp-ask-sheet', AskSheet);
