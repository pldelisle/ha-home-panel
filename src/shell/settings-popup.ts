// <hp-settings-popup>: the Control Center popup behind the gear (theme, Sleep now, text size, glass, transparency), in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the settings module, an observer of it (Gamma et al.); a choice is a
// `settings.set` and the shell's AppearanceController applies it; "Sleep now" goes up as an event (Lit docs, Events).
// Its words are catalog messages: the French rewrite layer cannot see inside this root (ADR 0019, ADR 0013).
// Must not: apply a setting, open or close itself (its container is the shell's), or know the idle timer.
import {ContextConsumer} from '@lit/context';
import {LitElement, html} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelSettings} from '../core/settings.ts';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {settingsContext} from '../ui/contexts.ts';
import {ico} from '../ui/icons.ts';
import {common, seg, settings} from '../ui/styles/index.ts';

// the choices, in the order the popup lists them: the value the settings keep and the message that names it
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
    const {theme, text, glass, glassLevel} = this.settingsNow();
    const dark = this.appearance.value?.theme === 'dark';
    const hint = t(theme === 'auto' ? 'settings.theme.following' : 'settings.theme.tap');
    // the foot of the popup: the version, and that the charts' history is kept fresh once it has loaded
    const foot = t(this.statistics ? 'settings.versionStatistics' : 'settings.version', {version: this.version});
    return html`<div class="cc" @click=${this.onClick}>
      <button
        type="button"
        class="cct tog"
        data-th="toggle"
        aria-pressed=${dark}
        aria-label=${t('settings.theme.label', {theme: dark ? 'dark' : 'light', hint})}
      >
        <span class="ccic">${ico(dark ? 'moon' : 'sun', 22)}</span
        ><b>${t(dark ? 'settings.theme.dark' : 'settings.theme.light')}</b>
        <small>${hint}</small>
      </button>
      <button type="button" class="cct tog" data-th="auto" aria-pressed=${theme === 'auto'}>
        <span class="ccic">${ico('sunauto', 22)}</span><b>${t('settings.theme.auto')}</b
        ><small>${t('settings.theme.autoCaption')}</small>
      </button>
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
      <div class="cct wide">
        <div class="ccl">${t('settings.glass.title')}</div>
        <div class="seg wps" role="radiogroup" aria-label=${t('settings.glass.title')}>
          ${GLASSES.map(
            ([value, key]) =>
              html`<button type="button" role="radio" aria-checked=${value === glass} data-gl=${value}>
                <b>${t(key)}</b>
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
      </div>
      <div class="ccv">${foot}</div>
    </div>`;
  }

  private settingsNow() {
    if (!this.source) throw new Error('SettingsPopup: the settings arrive by context when the popup connects.');
    return this.source.get();
  }

  // One listener for the tiles and the two groups, as the class had: the button says what it chooses in a data attribute.
  private readonly onClick = (e: Event): void => {
    const target = e.target as Element;
    const {source} = this;
    if (!source) return;
    if (target.closest('[data-sleep]')) {
      this.dispatchEvent(new CustomEvent('sleep-now', {bubbles: true, composed: true}));
      return;
    }
    const theme = target.closest<HTMLElement>('[data-th]')?.dataset.th;
    const glass = target.closest<HTMLElement>('[data-gl]')?.dataset.gl;
    const text = target.closest<HTMLElement>('[data-tx]')?.dataset.tx;
    if (theme !== undefined) {
      // the toggle flips the theme in force, which on Auto is the device's, so it leaves Auto for the other one
      const dark = this.appearance.value?.theme === 'dark';
      source.set('theme', theme === 'auto' ? 'auto' : dark ? 'light' : 'dark');
    } else if (glass !== undefined) source.set('glass', glass);
    else if (text !== undefined) source.set('text', text);
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
  }
}

if (!customElements.get('hp-settings-popup')) customElements.define('hp-settings-popup', SettingsPopup);
