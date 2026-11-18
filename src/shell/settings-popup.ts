// <hp-settings-popup>: the Control Center popup behind the gear (appearance, text size, Sleep now, design, glass or colour), in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the settings module, an observer of it (Gamma et al.); a choice is a
// `settings.set` and the shell's AppearanceController applies it; "Sleep now" and, on the phone, Done go up as events (Lit docs, Events).
// It is macOS's Control Center (HIG, Toggles): a module's round icon toggles it in one tap, its label opens a submenu inside the popup, with a back chevron;
// Escape and the chevron go back to the modules and focus returns to the module that opened it. One markup for both designs, drawn by each design's own roles.
// Under Material the glass choices are not drawn (glass is Apple's) and the seven seeds take their place, as swatches of each seed's own scheme (the Colour module).
// A glass is a colour, so it is a swatch with its name and a check (HIG, Color). The decisions (the next appearance, the text steps) are core/settings-choices.ts's.
// Its words are catalog messages: the French rewrite layer cannot see inside this root (ADR 0019, ADR 0013).
// Must not: apply a setting, open or close itself (its container is the shell's, Done only asks), or know the idle timer.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, type PropertyValues} from 'lit';
import type {MessageKey} from '../core/i18n/en.ts';
import type {PanelSettings} from '../core/settings.ts';
import {
  TEXT_STEPS,
  appearanceAfterAuto,
  fixedTextStep,
  stepOfText,
  textAfterAuto,
  textAtStep,
  toggleAppearance,
} from '../core/settings-choices.ts';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {settingsContext} from '../ui/contexts.ts';
import {ico} from '../ui/icons.ts';
import {SEEDS, SEED_IDS, type SeedId} from '../core/seeds.ts';
import {seedSwatch} from './material-scheme.ts';
import {moveTo, tabStop} from '../ui/seg-keys.ts';
import type {SwitchChangeDetail} from '../ui/switch.ts';
import '../ui/switch.ts'; // defines <hp-switch>
import {common, settings} from '../ui/styles/index.ts';

// the two designs, in the order the Design submenu lists them: the value the settings keep and the message that names it
const DESIGNS: readonly (readonly [string, MessageKey])[] = [
  ['apple', 'settings.design.apple'],
  ['material', 'settings.design.material'],
];
// the message that names each text size the slider stands on (Auto is the switch's)
const TEXT_STEP_NAMES: Record<string, MessageKey> = {
  smaller: 'settings.text.smaller',
  large: 'settings.text.large',
  larger: 'settings.text.larger',
};
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

// the seeds, in the order the popup lists them, and the message that names each: the wallpapers' names, and House's own
const SEED_NAMES: Record<SeedId, MessageKey> = {
  house: 'settings.seed.house',
  dawn: 'settings.glass.dawn',
  lake: 'settings.glass.lake',
  meadow: 'settings.glass.meadow',
  ember: 'settings.glass.ember',
  aurora: 'settings.glass.aurora',
  sand: 'settings.glass.sand',
};

// what the popup shows: the modules, or the submenu of one of them (`glass` is the Colour submenu under Material)
type View = 'modules' | 'appearance' | 'text' | 'design' | 'glass';

export class SettingsPopup extends LitElement {
  static override properties = {
    version: {},
    statistics: {type: Boolean},
    open: {type: Boolean},
    view: {state: true},
  };
  /** The build's version, which the line at the foot says; the shell passes it so this file knows no build constant. */
  declare version: string;
  /** The history behind the charts has loaded: the line at the foot adds that it is refreshed every 15 minutes. */
  declare statistics: boolean;
  /** The popup is showing: when it closes, it starts over at the modules. The shell passes it. */
  declare open: boolean;
  declare private view: View;

  static override styles = [common, settings];

  // `t` comes from the store, which this popup reads no entity of; the theme in force from the appearance
  private readonly store = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private source: PanelSettings | undefined;
  private unfollow: (() => void) | undefined;
  // the text size the slider last stood on: where it goes back to when Auto is turned off
  private lastText = fixedTextStep('');
  constructor() {
    super();
    this.version = '';
    this.statistics = false;
    this.open = true;
    this.view = 'modules';
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

  protected override willUpdate(changed: PropertyValues<this>): void {
    // a popup that closes starts over at the modules, as Control Center does
    if (changed.has('open') && !this.open) this.view = 'modules';
    // the slider remembers the size it stood on while Auto holds the size
    this.lastText = fixedTextStep(this.settingsNow().text, this.lastText);
  }

  protected override render() {
    const {t} = this.store.store;
    const {design} = this.settingsNow();
    const phone = this.appearance.value?.compact === true;
    // the foot of the popup: the version, and that the charts' history is kept fresh once it has loaded
    const foot = t(this.statistics ? 'settings.versionStatistics' : 'settings.version', {version: this.version});
    return html`<div class="cc" tabindex="-1" data-view=${this.view} @click=${this.onClick} @keydown=${this.onKey}>
      ${this.view === 'modules' ? this.renderModules(phone, design) : this.renderSubmenu(design)}
      <div class="ccv">${foot}</div>
    </div>`;
  }

  // the modules: Appearance and Text size as pills, Sleep now and Design as round buttons, then the Glass (under Material, the Colour) module
  private renderModules(phone: boolean, design: string) {
    const {t} = this.store.store;
    const {theme, text} = this.settingsNow();
    const dark = this.appearance.value?.theme === 'dark';
    const material = design === 'material';
    const shown = t(dark ? 'settings.theme.dark' : 'settings.theme.light');
    const summary = theme === 'auto' ? t('settings.theme.autoState', {state: shown}) : shown;
    const textName = TEXT_STEP_NAMES[text];
    return html`${
        phone
          ? html`<div class="cch">
              <h2>${t('settings.title')}</h2>
              <button type="button" class="done" data-done="1">${t('settings.done')}</button>
            </div>`
          : nothing
      }
      <div class="ccm pill appearance">
        <button
          type="button"
          class="ccib"
          data-toggle-theme="1"
          data-on=${dark}
          aria-pressed=${dark}
          aria-label=${t('settings.theme.dark')}
          title=${t('settings.theme.dark')}
        >
          <span class="ccic">${ico(dark ? 'moon' : 'sun', 22)}</span>
        </button>
        <button type="button" class="cclb" data-open="appearance">
          <b>${t('settings.theme.title')}</b><small>${summary}</small>
        </button>
      </div>
      <button
        type="button"
        class="ccm sq"
        data-sleep="1"
        aria-label=${t('settings.sleepNow')}
        title=${t('settings.sleepNow')}
      >
        <span class="ccic">${ico('moon', 22)}</span
        ><span class="ccbl" aria-hidden="true">${t('settings.sleepNow')}</span>
      </button>
      <button
        type="button"
        class="ccm sq"
        data-open="design"
        aria-label=${t('settings.design.title')}
        title=${t('settings.design.title')}
      >
        <span class="ccic">${ico('half', 22)}</span
        ><span class="ccbl" aria-hidden="true">${t('settings.design.title')}</span>
      </button>
      <button type="button" class="ccm pill textsize" data-open="text">
        <span class="ccic ccaa" aria-hidden="true">Aa</span>
        <span class="cclb"
          ><b>${t('settings.text.title')}</b><small>${t(textName ?? 'settings.text.auto')}</small></span
        >
      </button>
      <div class="ccm wide swatchmod">
        <button type="button" class="cgh" data-open="glass">
          <b>${t(material ? 'settings.seed.title' : 'settings.glass.title')}</b>${ico('chev', 18)}
        </button>
        ${this.swatchGroup(material, true)} ${material ? nothing : this.transparencyRow()}
      </div>`;
  }

  // a submenu replaces the modules inside the popup, with a back chevron and its title
  private renderSubmenu(design: string) {
    const {t} = this.store.store;
    const material = design === 'material';
    const view = this.view as Exclude<View, 'modules'>;
    const titles: Record<Exclude<View, 'modules'>, MessageKey> = {
      appearance: 'settings.theme.title',
      text: 'settings.text.title',
      design: 'settings.design.title',
      glass: material ? 'settings.seed.title' : 'settings.glass.title',
    };
    const body =
      view === 'appearance'
        ? this.appearanceBody()
        : view === 'text'
          ? this.textBody()
          : view === 'design'
            ? this.designBody(design)
            : this.glassBody(material);
    return html`<div class="cch sub">
        <button type="button" class="ccback" data-back="1" aria-label=${t('settings.back')}>${ico('chevl', 22)}</button>
        <h2>${t(titles[view])}</h2>
      </div>
      ${body}`;
  }

  // Auto, as a row of its own: a round icon, the word, what it means, and the kit's switch
  private autoRow(checked: boolean, onChange: (e: CustomEvent<SwitchChangeDetail>) => void) {
    const {t} = this.store.store;
    return html`<div class="ccm wide row">
      <span class="ccic">${ico('sunauto', 22)}</span>
      <span class="ccrt"><b>${t('settings.theme.auto')}</b><small>${t('settings.theme.autoCaption')}</small></span>
      <hp-switch .checked=${checked} .label=${t('settings.theme.auto')} @change=${onChange}></hp-switch>
    </div>`;
  }

  private appearanceBody() {
    return this.autoRow(this.settingsNow().theme === 'auto', this.onAutoTheme);
  }

  // a stepped slider like macOS's: one step per text size above Auto, its end labels, and Auto beneath, which dims it and takes it out of play
  private textBody() {
    const {t} = this.store.store;
    const {text} = this.settingsNow();
    const auto = text === 'auto';
    const step = stepOfText(text, this.lastText);
    const last = TEXT_STEPS.length - 1;
    const name = t(TEXT_STEP_NAMES[TEXT_STEPS[step]]);
    return html`<div class="ccm wide steps" data-off=${auto}>
        <div class="stepbox" style=${`--p:${(step / last) * 100}%`}>
          <span class="ticks" aria-hidden="true"
            >${TEXT_STEPS.map((_, index) => html`<i class=${index <= step ? 'on' : ''}></i>`)}</span
          >
          <input
            type="range"
            class="gtrange"
            min="0"
            max=${last}
            step="1"
            .value=${String(step)}
            ?disabled=${auto}
            aria-label=${t('settings.text.title')}
            aria-valuetext=${name}
            @input=${this.onTextStep}
          />
        </div>
        <div class="stepends"><span>${t('settings.text.smaller')}</span><span>${t('settings.text.larger')}</span></div>
      </div>
      ${this.autoRow(auto, this.onAutoText)}`;
  }

  private designBody(design: string) {
    const {t} = this.store.store;
    return html`<div class="ccm wide list" role="group" aria-label=${t('settings.design.title')}>
      ${DESIGNS.map(
        ([value, key]) =>
          html`<button type="button" class="ccopt" aria-pressed=${value === design} data-design-set=${value}>
            <span>${t(key)}</span><span class="cck">${value === design ? ico('check', 20) : nothing}</span>
          </button>`,
      )}
    </div>`;
  }

  // everything the Glass module holds, as large as it goes: the named swatches, the slider and Transparent cards; under Material the seeds
  private glassBody(material: boolean) {
    const {t} = this.store.store;
    const {cards} = this.settingsNow();
    return html`<div class="ccm wide swatchmod full">
      ${this.swatchGroup(material, false)}
      ${
        material
          ? nothing
          : html`${this.transparencyRow()}
              <div class="gcrow">
                <span>${t('settings.glassCards')}</span>
                <hp-switch
                  .checked=${cards === 'glass'}
                  .label=${t('settings.glassCards')}
                  @change=${this.onCards}
                ></hp-switch>
              </div>`
      }
    </div>`;
  }

  private transparencyRow() {
    const {t} = this.store.store;
    const {glassLevel} = this.settingsNow();
    return html`<div class="gtrow">
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
    </div>`;
  }

  // the glasses, or under Material the seeds: a radio group of swatches, one tab stop and the arrow keys; compact is the row inside the module
  private swatchGroup(material: boolean, compact: boolean) {
    const {t} = this.store.store;
    const {glass, seed} = this.settingsNow();
    const cls = `swatches${material ? ' seeds' : ''}${compact ? ' compact' : ''}`;
    if (material) {
      const dark = this.appearance.value?.theme === 'dark';
      const contrast = this.appearance.value?.moreContrast ? 1 : 0;
      // one tab stop in the group (the chosen swatch), the arrow keys move within it, as in the kit's <hp-seg>
      const stop = tabStop(SEED_IDS.map(id => ({checked: id === seed})));
      return html`<div class=${cls} role="radiogroup" aria-label=${t('settings.seed.title')} @keydown=${this.onSeedKey}>
        ${SEED_IDS.map((id, index) => {
          const [primary, container, secondary, card] = seedSwatch(SEEDS[id], dark, contrast);
          return html`<button
            type="button"
            class="sw seed"
            role="radio"
            aria-checked=${id === seed}
            tabindex=${index === stop ? 0 : -1}
            data-seed=${id}
            style=${`--s0:${primary};--s1:${container};--s2:${secondary};--s3:${card}`}
          >
            <span class="swc" aria-hidden="true">${id === seed ? ico('check', compact ? 16 : 22) : nothing}</span>
            <span class=${compact ? 'sr' : 'swn'}>${t(SEED_NAMES[id])}</span>
          </button>`;
        })}
      </div>`;
    }
    const stop = tabStop(GLASSES.map(([value]) => ({checked: value === glass})));
    return html`<div class=${cls} role="radiogroup" aria-label=${t('settings.glass.title')} @keydown=${this.onGlassKey}>
      ${GLASSES.map(
        ([value, key], index) =>
          html`<button
            type="button"
            class="sw"
            role="radio"
            aria-checked=${value === glass}
            tabindex=${index === stop ? 0 : -1}
            data-gl=${value}
          >
            <span class="swc" aria-hidden="true">${value === glass ? ico('check', compact ? 16 : 18) : nothing}</span>
            <span class=${compact ? 'sr' : 'swn'}>${t(key)}</span>
          </button>`,
      )}
    </div>`;
  }

  private settingsNow() {
    if (!this.source) throw new Error('SettingsPopup: the settings arrive by context when the popup connects.');
    return this.source.get();
  }

  // Into a submenu, or back to the modules: focus follows, into the submenu (its back chevron) and back to the module that opened it.
  private go(view: View, opener?: string): void {
    this.view = view;
    void this.updateComplete.then(() => {
      const target = view === 'modules' ? `[data-open="${opener}"]` : '[data-back]';
      this.renderRoot.querySelector<HTMLElement>(target)?.focus();
    });
  }

  // the module that opened the submenu, which the way back returns to: the submenu's own name is the module's `data-open`
  private opener(): string {
    return this.view;
  }

  // Escape in a submenu goes back to the modules and stops there; in the modules it passes on, and the shell closes the popup
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.view === 'modules') return;
    e.stopPropagation();
    this.go('modules', this.opener());
  };

  // the Auto switches write what the decision says; the popup draws it back from the settings
  private readonly onAutoTheme = (e: CustomEvent<SwitchChangeDetail>): void => {
    e.stopPropagation();
    this.source?.set('theme', appearanceAfterAuto(e.detail.checked, this.appearance.value?.theme === 'dark'));
  };

  private readonly onAutoText = (e: CustomEvent<SwitchChangeDetail>): void => {
    e.stopPropagation();
    this.source?.set('text', textAfterAuto(e.detail.checked, this.lastText));
  };

  // the slider's position is a step; the setting is the text size the step names, so the stored values are the ones they always were
  private readonly onTextStep = (e: Event): void => {
    this.source?.set('text', textAtStep(Number((e.target as HTMLInputElement).value)));
  };

  // One listener for the modules, the submenus and the swatches, as the class had: the button says what it asks in a data attribute.
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
    const open = target.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (open !== undefined) {
      this.go(open as View);
      return;
    }
    if (target.closest('[data-back]')) {
      this.go('modules', this.opener());
      return;
    }
    if (target.closest('[data-toggle-theme]')) {
      const {theme} = source.get();
      source.set('theme', toggleAppearance(theme, this.appearance.value?.theme === 'dark'));
      return;
    }
    // choosing a design closes its submenu: the panel redraws itself in the design chosen
    const design = target.closest<HTMLElement>('[data-design-set]')?.dataset.designSet;
    if (design !== undefined) {
      source.set('design', design);
      this.go('modules', 'design');
      return;
    }
    const glass = target.closest<HTMLElement>('[data-gl]')?.dataset.gl;
    const seed = target.closest<HTMLElement>('[data-seed]')?.dataset.seed;
    if (glass !== undefined) source.set('glass', glass);
    else if (seed !== undefined) source.set('seed', seed);
  };

  // an arrow, Home or End moves the choice and the focus together, as a native radio group does (the keys are seg-keys.ts's)
  private readonly onGlassKey = (e: KeyboardEvent): void =>
    this.moveSwatch(
      e,
      'glass',
      GLASSES.map(([value]) => value),
    );

  // the seeds are the same kind of group, with the same keys, over their own table
  private readonly onSeedKey = (e: KeyboardEvent): void => this.moveSwatch(e, 'seed', SEED_IDS);

  private moveSwatch(e: KeyboardEvent, key: 'glass' | 'seed', values: readonly string[]): void {
    const {source} = this;
    const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button')];
    const from = buttons.findIndex(button => button === this.shadowRoot?.activeElement);
    const to = moveTo(
      values.map(() => ({})),
      Math.max(from, 0),
      e.key,
    );
    if (!source || to === null) return;
    e.preventDefault();
    buttons[to]?.focus();
    source.set(key, values[to]);
  }

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
