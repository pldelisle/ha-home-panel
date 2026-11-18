// <hp-seg>: the kit's segmented control: a row of radio buttons, one chosen, in its own shadow root, with the radio group's keys in one place.
// Pattern: controlled component over a humble object (Meszaros, xUnit Test Patterns), after the WAI-ARIA Authoring Practices' radio group: `options` and `value` down, `change` up,
// one tab stop (roving tabindex) and the arrow keys, Home and End move the choice; `seg-keys.ts` decides where. The markup and rules are the legacy `.seg`'s own (styles/seg.css).
// The group (`part="group"`) and each option's word (`part="label"`) are parts, so an owner can size them from outside as it does `<hp-stepper>`'s buttons.
// Under Material a group of more than five options is Material's overflow (ADR 0037, #481): the first four are the connected group and a fifth, "More", opens a native popover menu of
// `menuitemradio`s with the rest; `seg-overflow.ts` decides the split. The radio group keeps its one tab stop and its arrows across every option (one that lands in the overflow chooses it
// and the More button shows it), and the menu opens from More on Enter, Space or ArrowDown. Liquid Glass keeps the one row.
// Must not: keep the choice itself (its owner holds `value`), know what an option stands for, or send a command.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {ico} from './icons.ts';
import {moveTo, tabStop} from './seg-keys.ts';
import {splitGroup} from './seg-overflow.ts';
import segOwn from './seg.element.css?inline';
import {common, seg} from './styles/index.ts';
import {forShadow} from './styles/host.ts';

/** One option: the value it chooses, its word, a smaller word under it, and whether it can be chosen. */
export interface SegOption<V extends string = string> {
  value: V;
  label: string;
  sub?: string;
  disabled?: boolean;
}

/** What the group says when an option is chosen, by a tap or a key: the value now asked for. */
export interface SegChangeDetail<V extends string = string> {
  value: V;
}

// the menu's item is 48px tall and its box has 8px above and below (seg.element.css): enough to say before it shows whether it fits under the button
const MENU_ITEM = 48;
const MENU_PAD = 16;
const MENU_GAP = 4;

export class HpSeg extends LitElement {
  static override properties = {
    options: {attribute: false},
    value: {},
    label: {},
    moreLabel: {},
    disabled: {type: Boolean, reflect: true},
    open: {state: true},
  };
  /** The options, in order. */
  declare options: readonly SegOption[];
  /** The value chosen, as its owner holds it; the option with it is the one with `aria-checked`. */
  declare value: string | undefined;
  /** What a screen reader calls the group. */
  declare label: string | undefined;
  /** What a screen reader calls the overflow button of a long group under Material: its owner words it, as it does the group's `label`. */
  declare moreLabel: string | undefined;
  /** The whole group is read-only: no option can be chosen, and the unchosen ones are muted. */
  declare disabled: boolean;
  /** The overflow menu is showing (the popover's own state, mirrored for `aria-expanded`). */
  declare open: boolean;

  // The kit's `.seg` rules, adopted whole; the element's own, its `:host` and the read-only look, are in seg.element.css.
  static override styles = [common, seg, unsafeCSS(forShadow(segOwn))];

  // `glass` comes from the shell as a host attribute the kit's rules test; the design it holds says whether a long group overflows
  private readonly appearance = new AppearanceConsumer(this);

  constructor() {
    super();
    this.options = [];
    this.value = undefined;
    this.label = undefined;
    this.moreLabel = undefined;
    this.disabled = false;
    this.open = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('scroll', this.closeOnScroll, true);
  }

  protected override render() {
    const {disabled} = this;
    const checked = this.checkedIndex;
    const stop = tabStop(this.options.map((option, index) => ({...option, checked: index === checked})));
    const {shown, more} = this.split;
    return html`<div
        class="seg"
        part="group"
        role="radiogroup"
        aria-label=${this.label ?? nothing}
        aria-disabled=${disabled ? 'true' : 'false'}
        @keydown=${this.onKey}
      >
        ${repeat(
          shown,
          ({value}) => value,
          ({value, label, sub, disabled: off}, index) =>
            html`<button
              type="button"
              role="radio"
              aria-checked=${index === checked ? 'true' : 'false'}
              tabindex=${index === stop ? 0 : -1}
              ?disabled=${disabled || off}
              @click=${() => this.choose(value)}
            >
              <b part="label">${label}</b>${sub ? html`<small>${sub}</small>` : nothing}
            </button>`,
        )}
        ${more.length > 0 ? this.renderMore(shown.length, checked, stop) : nothing}
      </div>
      ${more.length > 0 ? this.renderMenu(more, shown.length) : nothing}`;
  }

  // Material's overflow button: the `more` icon, or the chosen option's word (and drawn chosen) when the choice is in the menu. It is not a radio (it opens a menu), so the
  // group's tab stop is its when the choice is behind it; `popovertarget` opens and closes the menu, light dismiss and Escape are the popover's.
  private renderMore(count: number, checked: number, stop: number | null) {
    const inMenu = checked >= count;
    const word = inMenu ? this.options[checked].label : undefined;
    const name = word === undefined ? this.moreLabel : `${this.moreLabel ?? ''}, ${word}`.replace(/^, /, '');
    return html`<button
      type="button"
      class="more"
      aria-label=${name ?? nothing}
      aria-haspopup="menu"
      aria-expanded=${this.open ? 'true' : 'false'}
      aria-controls="more-menu"
      popovertarget="more-menu"
      ?data-chosen=${inMenu}
      tabindex=${stop !== null && stop >= count ? 0 : -1}
      ?disabled=${this.disabled}
    >
      ${inMenu ? html`<b part="label">${word}</b>` : ico('more', 24)}
    </button>`;
  }

  // the rest of the options, a native popover (top layer, so no card clips it) of `menuitemradio`s, the chosen one checked
  private renderMenu(more: readonly SegOption[], count: number) {
    return html`<div
      id="more-menu"
      class="menu"
      role="menu"
      popover="auto"
      aria-label=${this.moreLabel ?? nothing}
      @beforetoggle=${this.onBeforeToggle}
      @toggle=${this.onToggle}
      @keydown=${this.onMenuKey}
    >
      ${repeat(
        more,
        ({value}) => value,
        ({value, label, sub, disabled: off}, index) =>
          html`<button
            type="button"
            role="menuitemradio"
            aria-checked=${count + index === this.checkedIndex ? 'true' : 'false'}
            tabindex="-1"
            ?disabled=${off}
            @click=${() => this.pick(value)}
          >
            <b>${label}</b>${sub ? html`<small>${sub}</small>` : nothing}
          </button>`,
      )}
    </div>`;
  }

  // what is drawn as buttons and what is in the menu: only the Material design overflows (Liquid Glass keeps today's one row, which wraps)
  private get split() {
    return this.appearance.value?.design === 'material' ? splitGroup(this.options) : {shown: this.options, more: []};
  }

  private get menu(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('.menu');
  }

  private get moreButton(): HTMLButtonElement | null {
    return this.renderRoot.querySelector<HTMLButtonElement>('button.more');
  }

  // where the owner's `value` sits among the options, -1 when it names none
  private get checkedIndex(): number {
    return this.options.findIndex(({value}) => value === this.value);
  }

  // a tap says its option, even the one already chosen: the owner may send the value again, as the legacy buttons did
  private choose(value: string): void {
    this.dispatchEvent(new CustomEvent<SegChangeDetail>('change', {detail: {value}}));
  }

  // an arrow, Home or End moves the choice and the focus together, as a native radio group does; an option in the overflow has no button, so the More button takes the focus
  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    // the radios are the shown options, one for one, and the More button, if any, comes last
    const buttons = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.seg > button')];
    const count = this.split.shown.length;
    const active = this.shadowRoot?.activeElement;
    const onMore = active !== null && active === this.moreButton;
    // ArrowDown on More opens the menu, as on a menu button; the other arrows move the choice
    if (onMore && e.key === 'ArrowDown') {
      e.preventDefault();
      this.menu?.showPopover?.();
      return;
    }
    const focused = buttons.findIndex(button => button === active);
    const from = onMore ? Math.max(this.checkedIndex, count) : focused >= 0 ? focused : this.checkedIndex;
    const to = moveTo(this.options, Math.max(from, 0), e.key);
    if (to === null) return;
    e.preventDefault();
    buttons[Math.min(to, buttons.length - 1)]?.focus();
    if (this.options[to].value !== this.value) this.choose(this.options[to].value);
  };

  // a choice in the menu: said, then the menu closes and the focus goes back to More
  private pick(value: string): void {
    this.choose(value);
    this.menu?.hidePopover?.();
    this.moreButton?.focus();
  }

  // the menu hangs under More, right edges together, or above it when the room below is short; it is `position: fixed` in the top layer, so these are viewport pixels
  private readonly onBeforeToggle = (e: Event): void => {
    const {menu, moreButton: more} = this;
    if (!menu || !more || (e as ToggleEvent).newState !== 'open') return;
    const anchor = more.getBoundingClientRect();
    const {clientWidth, clientHeight} = document.documentElement;
    const height = this.split.more.length * MENU_ITEM + MENU_PAD;
    const fits = clientHeight - anchor.bottom - MENU_GAP >= height;
    menu.style.right = `${Math.max(MENU_GAP, clientWidth - anchor.right)}px`;
    menu.style.top = `${fits ? anchor.bottom + MENU_GAP : Math.max(MENU_GAP, anchor.top - MENU_GAP - height)}px`;
  };

  // opened: the chosen item (else the first) takes the focus; either way the state follows the popover, and a scroll closes it, as it would hang in the air
  private readonly onToggle = (e: Event): void => {
    const open = (e as ToggleEvent).newState === 'open';
    this.open = open;
    if (!open) {
      window.removeEventListener('scroll', this.closeOnScroll, true);
      return;
    }
    window.addEventListener('scroll', this.closeOnScroll, {capture: true, passive: true});
    const items = this.menuItems();
    const chosen = items.find(item => item.getAttribute('aria-checked') === 'true' && !item.disabled);
    (chosen ?? items.find(item => !item.disabled))?.focus();
  };

  private readonly closeOnScroll = (e: Event): void => {
    if (e.target !== this.menu) this.menu?.hidePopover?.();
  };

  private menuItems(): HTMLButtonElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.menu [role="menuitemradio"]')];
  }

  // the menu's keys: the arrows, Home and End move among the items as in the group (no choice is made until Enter or Space presses one); Tab leaves it; Escape closes it
  // and the focus goes back to More (the popover's own restore is not reliable when the focus was moved into it)
  private readonly onMenuKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') {
      this.menu?.hidePopover?.();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.menu?.hidePopover?.();
      this.moreButton?.focus();
      return;
    }
    const items = this.menuItems();
    const from = items.findIndex(item => item === this.shadowRoot?.activeElement);
    const to = moveTo(this.split.more, Math.max(from, 0), e.key);
    if (to === null) return;
    e.preventDefault();
    items[to]?.focus();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-seg': HpSeg;
  }
}

if (!customElements.get('hp-seg')) customElements.define('hp-seg', HpSeg);
