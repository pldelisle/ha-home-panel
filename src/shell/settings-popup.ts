// <hp-settings-popup>: the Control Center popup behind the gear (appearance, design, Sleep now, text size, glass, transparency), in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the settings module, an observer of it (Gamma et al.); a choice is a
// `settings.set` and the shell's AppearanceController applies it; "Sleep now" and, on the phone, Done go up as events (Lit docs, Events).
// Under Material the glass choices are not drawn (glass is Apple's). Appearance and Design are the kit's <hp-seg> (HIG, Segmented controls); a glass is a colour, so it is a swatch with its name and a check (HIG, Color).
// Its words are catalog messages: the French rewrite layer cannot see inside this root (ADR 0019, ADR 0013).
// Must not: apply a setting, open or close itself (its container is the shell's, Done only asks), or know the idle timer.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelSettings} from '../core/settings.ts';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {settingsContext} from '../ui/contexts.ts';
import {ico} from '../ui/icons.ts';
import {moveTo, tabStop} from '../ui/seg-keys.ts';
import type {SegChangeDetail, SegOption} from '../ui/seg.ts';
import '../ui/seg.ts'; // defines <hp-seg>
import type {SwitchChangeDetail} from '../ui/switch.ts';
import '../ui/switch.ts'; // defines <hp-switch>
import {common, seg, settings} from '../ui/styles/index.ts';

// the choices, in the order the popup lists them: the value the settings keep and the message that names it
const THEMES: readonly (readonly [string, MessageKey])[] = [
  ['light', 'settings.theme.light'],
  ['dark', 'settings.theme.dark'],
  ['auto', 'settings.theme.auto'],
];
const DESIGNS: readonly (readonly [string, MessageKey])[] = [
  ['apple', 'settings.design.apple'],
  ['material', 'settings.design.material'],
];
const TEXT_SIZES: readonly (readonly [string, MessageKey])[] = [
  ['smaller', 'settings.text.smaller'],
  ['auto', 'settings.text.auto'],
  ['large', 'settings.text.large'],
  ['larger', 'settings.text.larger'],
];
const GLASSES: readonly (readonly [string, MessageKey])[] = [
  ['none', 'settings.glass.none'],
  ['dawn', 'settings.glass.dawn'],
  ['lake', 'settings.glass.lake'],
  ['meadow', 'settings.glass.meadow'],
  ['ember', 'settings.glass.ember'],
  ['aurora', 'settings.glass.aurora'],
  ['sand', 'settings.glass.sand'],
  ['sky', 'settings.glass.sky'],
];

export class SettingsPopup extends LitElement {
  static override properties = {
    version: {},
    statistics: {type: Boolean},
  };
  /** The build's version, which the line at the foot says; the shell passes it so this file knows no build constant. */
  declare version: string;
  /** The history behind the charts has loaded: the line at the foot adds that it is refreshed every 15 minutes. */
  declare statistics: boolean;

  static override styles = [common, seg, settings];

  // `t` comes from the store, which this popup reads no entity of; the theme in force from the appearance
  private readonly store = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private source: PanelSettings | undefined;
  private unfollow: (() => void) | undefined;
  constructor() {
    super();
    this.version = '';
    this.statistics = false;
    // The settings arrive by context when the popup connects, again at each reconnection; it follows them from then to its
    // disconnection, so one write, from here or from anywhere, is one render.
    new ContextConsumer(this, {
      context: settingsContext,
      subscribe: false,
      callback: source => {
        this.unfollow?.();
        this.source = source;
        this.unfollow = source.subscribe(() => this.requestUpdate());
      },
    });
  }

  protected override render() {
    const {t} = this.store.store;
    const {theme, text, glass, glassLevel, cards, design} = this.settingsNow();
    // one tab stop in the group (the chosen swatch), the arrow keys move within it, as in the kit's <hp-seg>
    const glassStop = tabStop(GLASSES.map(([value]) => ({checked: value === glass})));
    const phone = this.appearance.value?.compact === true;
    const themes: SegOption[] = THEMES.map(([value, key]) => ({value, label: t(key)}));
    const designs: SegOption[] = DESIGNS.map(([value, key]) => ({value, label: t(key)}));
    // the foot of the popup: the version, and that the charts' history is kept fresh once it has loaded
    const foot = t(this.statistics ? 'settings.versionStatistics' : 'settings.version', {version: this.version});
    return html`<div class="cc" @click=${this.onClick}>
      ${
        phone
          ? html`<div class="cch">
              <h2>${t('settings.title')}</h2>
              <button type="button" class="done" data-done="1">${t('settings.done')}</button>
            </div>`
          : nothing
      }
      <div class="cct wide">
        <div class="ccl">${t('settings.theme.title')}</div>
        <hp-seg .options=${themes} .value=${theme} .label=${t('settings.theme.title')} @change=${this.onTheme}></hp-seg>
        ${theme === 'auto' ? html`<small class="ccn">${t('settings.theme.autoCaption')}</small>` : nothing}
      </div>
      <div class="cct wide">
        <div class="ccl">${t('settings.design.title')}</div>
        <hp-seg
          .options=${designs}
          .value=${design}
          .label=${t('settings.design.title')}
          @change=${this.onDesign}
        ></hp-seg>
      </div>
      <button type="button" class="cct tog wide sleepnow" data-sleep="1">
        <span class="ccic">${ico('moon', 22)}</span
        ><span class="sltx"><b>${t('settings.sleepNow')}</b><small>${t('settings.sleepNowCaption')}</small></span>
      </button>
      <div class="cct wide">
        <div class="ccl">${t('settings.text.title')}</div>
        <div class="seg" role="radiogroup" aria-label=${t('settings.text.title')}>
          ${TEXT_SIZES.map(
            ([value, key]) =>
              html`<button type="button" role="radio" aria-checked=${value === text} data-tx=${value}>
                <b>${t(key)}</b>
              </button>`,
          )}
        </div>
      </div>
      ${
        design === 'material'
          ? nothing // glass is the Apple design's: no swatches, slider or switch; the stored choice waits for the way back
          : html` <div class="cct wide">
              <div class="ccl">${t('settings.glass.title')}</div>
              <div
                class="swatches"
                role="radiogroup"
                aria-label=${t('settings.glass.title')}
                @keydown=${this.onGlassKey}
              >
                ${GLASSES.map(
                  ([value, key], index) =>
                    html`<button
                      type="button"
                      class="sw"
                      role="radio"
                      aria-checked=${value === glass}
                      tabindex=${index === glassStop ? 0 : -1}
                      data-gl=${value}
                    >
                      <span class="swc" aria-hidden="true">${value === glass ? ico('check', 18) : nothing}</span>
                      <span class="swn">${t(key)}</span>
                    </button>`,
                )}
              </div>
              <div class="gtrow">
                <span>${t('settings.transparency.solid')}</span
                ><input
                  type="range"
                  class="gtrange"
                  min="0"
                  max="100"
                  step="1"
                  .value=${String(glassLevel)}
                  style=${`--p:${glassLevel}%`}
                  aria-label=${t('settings.transparency')}
                  @input=${this.onRange}
                /><span>${t('settings.transparency.clear')}</span>
              </div>
              <div class="gcrow">
                <span>${t('settings.glassCards')}</span>
                <hp-switch
                  .checked=${cards === 'glass'}
                  .label=${t('settings.glassCards')}
                  @change=${this.onCards}
                ></hp-switch>
              </div>
            </div>`
      }
      <div class="ccv">${foot}</div>
    </div>`;
  }

  private settingsNow() {
    if (!this.source) throw new Error('SettingsPopup: the settings arrive by context when the popup connects.');
    return this.source.get();
  }

  // Apple or Material: the setting is the choice itself, and the shell's controller redraws the frame from it
  private readonly onDesign = (e: CustomEvent<SegChangeDetail>): void => {
    this.source?.set('design', e.detail.value);
  };

  // Light, Dark or Auto: the setting is the choice itself, and the theme in force follows from it (the shell's controller)
  private readonly onTheme = (e: CustomEvent<SegChangeDetail>): void => {
    this.source?.set('theme', e.detail.value);
  };

  // One listener for the tile and the two groups, as the class had: the button says what it chooses in a data attribute.
  private readonly onClick = (e: Event): void => {
    const target = e.target as Element;
    const {source} = this;
    if (!source) return;
    if (target.closest('[data-sleep]')) {
      this.dispatchEvent(new CustomEvent('sleep-now', {bubbles: true, composed: true}));
      return;
    }
    if (target.closest('[data-done]')) {
      this.dispatchEvent(new CustomEvent('settings-close', {bubbles: true, composed: true}));
      return;
    }
    const glass = target.closest<HTMLElement>('[data-gl]')?.dataset.gl;
    const text = target.closest<HTMLElement>('[data-tx]')?.dataset.tx;
    if (glass !== undefined) source.set('glass', glass);
    else if (text !== undefined) source.set('text', text);
  };

  // an arrow, Home or End moves the choice and the focus together, as a native radio group does (the keys are seg-keys.ts's)
  private readonly onGlassKey = (e: KeyboardEvent): void => {
    const {source} = this;
    const buttons = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.swatches button')];
    const from = buttons.findIndex(button => button === this.shadowRoot?.activeElement);
    const to = moveTo(
      GLASSES.map(() => ({})),
      Math.max(from, 0),
      e.key,
    );
    if (!source || to === null) return;
    e.preventDefault();
    buttons[to]?.focus();
    source.set('glass', GLASSES[to][0]);
  };

  // the switch tells what a tap asks for; the setting is written and the popup draws it back from the settings
  private readonly onCards = (e: CustomEvent<SwitchChangeDetail>): void => {
    e.stopPropagation();
    this.source?.set('cards', e.detail.checked ? 'glass' : 'solid');
  };

  private readonly onRange = (e: Event): void => {
    this.source?.set('glassLevel', Number((e.target as HTMLInputElement).value));
  };

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unfollow?.();
    this.unfollow = undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-settings-popup': SettingsPopup;
  }
  interface HTMLElementEventMap {
    'sleep-now': CustomEvent<void>;
    'settings-close': CustomEvent<void>;
  }
}

if (!customElements.get('hp-settings-popup')) customElements.define('hp-settings-popup', SettingsPopup);
