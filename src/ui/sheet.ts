// <hp-sheet>: the kit's sheet: a backdrop, a panel with a grabber, a header (badge, heading, sub-line, tabs, actions, Close) and a body.
// Pattern: humble object (Meszaros, xUnit Test Patterns) composing <hp-pane-header>, with slots for what varies (Lit docs, Shadow DOM:
// Slots); properties down (`open`, `inline`), events up (`sheet-close`), the drag to close a controller (Lit docs, Reactive Controllers); the host reflects `has-actions`
// while its owner slots an action, for the phone's heading padding.
// Must not: know which sheet is open or listen for Escape (the sheet host does, ADR 0021), fetch anything, or choose `inline` itself.
import {LitElement, html, type PropertyValues, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {Exit} from './controllers/exit.ts';
import {SwipeToClose} from './controllers/swipe-to-close.ts';
import {ico, type IconName} from './icons.ts';
import {type PaneHeader} from './pane-header.ts'; // defines <hp-pane-header>
import {common, motion, sheet} from './styles/index.ts';
import sheetOwn from './sheet.element.css?inline';
import {forShadow} from './styles/host.ts';

export class HpSheet extends LitElement {
  static override properties = {
    open: {type: Boolean, reflect: true},
    inline: {type: Boolean, reflect: true},
    icon: {},
    color: {},
    heading: {},
    label: {},
    closeLabel: {attribute: 'close-label'},
    hasSub: {state: true},
    hasActions: {type: Boolean, attribute: 'has-actions', reflect: true},
    leaving: {state: true},
    dragged: {state: true},
  };
  /** On screen. Its owner binds it to the sheet host's `isOpen`; the field marked `autofocus` in its body, else the Close button, takes focus when it turns true. */
  declare open: boolean;
  /** Placed in its pane (a tablet's detail panel) instead of over the page: no backdrop, no `aria-modal`, no swipe, and a region, not a dialog, for a screen reader. */
  declare inline: boolean;
  declare icon: IconName;
  /** A colour token for the badge (`--acc`), such as `var(--c-home)`. */
  declare color: string;
  /** The heading, already in the panel's language. */
  declare heading: string;
  /** The accessible name of the panel (a dialog; a region when inline); the heading when it is empty. */
  declare label: string;
  /** The Close button's accessible name, already in the panel's language. */
  declare closeLabel: string;
  /** Something is slotted as the sub-line: without one the header draws no line, so the heading sits where the legacy card sheet's did. */
  declare private hasSub: boolean;
  /** Something is slotted as an action (not a tab): the host says so as `has-actions`, so a phone's rule can keep the heading clear of Close and of the action beside it. */
  declare private hasActions: boolean;
  /** Under Material a closed sheet is still drawn while it fades out and slides off (sheet.css, `.leaving`); then it is hidden. */
  declare private leaving: boolean;
  /** The leave is one a drag began: the panel has slid off under the finger, so only the scrim fades (sheet.css, `.dragged`). */
  declare private dragged: boolean;

  // `display: contents`: the sheet is `position: fixed`, so the host takes no room where its owner puts it. The rules for the
  // header the legacy sheet's `.ph` carried are here, in sheet.element.css, and not in sheet.css, because the header is the pane header's now: the
  // heading is slotted so that it can be a size up from a pane's, and the pane header's rules, being the inner tree's, give way.
  // The element's own rules, its `:host` and what only its tree has, are in sheet.element.css.
  static override styles = [common, motion, sheet, unsafeCSS(forShadow(sheetOwn))];

  private readonly appearance = new AppearanceConsumer(this);
  // on a phone, dragged down by its grabber or its header to close; a press on a control is the control's
  private readonly swipe = new SwipeToClose(this, {
    enabled: () => this.appearance.value?.compact === true && !this.inline,
    close: () => {
      this.dragged = true; // it has slid off under the finger: no second slide on the way out
      this.close();
      if (!this.exit.leaving) this.dragged = false; // (Liquid Glass closes at once)
    },
    handle: '.grab, hp-pane-header',
  });
  // Material's sheet says it is closed after its fade and slide (the owner may take it out of its template on the event), and stays drawn while it fades
  private settled = false; // its own leave has ended: the owner's `open=false` that follows needs none
  private readonly exit = new Exit({
    animated: () => this.getAttribute('design') === 'material' && !this.inline,
    target: () => this.renderRoot.querySelector<HTMLElement>('.sheet'),
    mark: on => {
      this.leaving = on;
      if (!on) this.dragged = false;
    },
    drawn: () => this.updateComplete,
  });

  constructor() {
    super();
    this.open = false;
    this.inline = false;
    this.icon = 'house';
    this.color = 'var(--fg3)';
    this.heading = '';
    this.label = '';
    this.closeLabel = '';
    this.hasSub = false;
    this.hasActions = false;
    this.leaving = false;
    this.dragged = false;
  }

  // The sub-line and the controls ride in the pane header's own slots, in wrappers: a slot forwarded into a slot is a `<slot>`,
  // which has no box of its own for the margin the pane header's `::slotted` rules give.
  protected override render() {
    return html`<div
      class="sheet ${this.leaving ? 'leaving' : ''} ${this.dragged ? 'dragged' : ''}"
      ?hidden=${!this.open && !this.leaving}
      @click=${this.onBackdrop}
    >
      <div
        class="panel"
        role=${this.inline ? 'region' : 'dialog'}
        aria-modal=${ifDefined(this.inline ? undefined : 'true')}
        aria-label=${this.label || this.heading}
        @pointerdown=${this.swipe.onPointerDown}
        @pointermove=${this.swipe.onPointerMove}
        @pointerup=${this.swipe.onPointerEnd}
        @pointercancel=${this.swipe.onPointerEnd}
      >
        <div class="grab" aria-hidden="true"></div>
        <hp-pane-header .icon=${this.icon} .color=${this.color}>
          <slot name="icon" slot="icon">${ico(this.icon, 26)}</slot>
          <h2 slot="title">${this.heading}</h2>
          <div slot="sub" class="subline" ?hidden=${!this.hasSub}>
            <slot name="sub" @slotchange=${this.onSubChange}></slot>
          </div>
          <div slot="actions" class="actions">
            <slot name="tabs"></slot><slot name="actions" @slotchange=${this.onActionsChange}></slot>
            <button class="icon close" type="button" aria-label=${this.closeLabel} @click=${this.close}>✕</button>
          </div>
        </hp-pane-header>
        <slot></slot>
      </div>
    </div>`;
  }

  // the slot tells when its nodes change, and an empty one at the first draw says nothing, which `hasSub`'s false already means
  private readonly onSubChange = (e: Event): void => {
    this.hasSub = (e.target as HTMLSlotElement).assignedNodes({flatten: true}).length > 0;
  };

  // the same for the actions: `has-actions` on the host is the CSS's to read (sheet.element.css), and is absent for a sheet whose owner slots none
  private readonly onActionsChange = (e: Event): void => {
    this.hasActions = (e.target as HTMLSlotElement).assignedNodes({flatten: true}).length > 0;
  };

  // Under Material the event follows the fade, so an owner that takes the sheet out of its template on it does not cut the fade; a second ask while it leaves does nothing
  private readonly close = (): void => {
    void this.exit.run(() => {
      this.settled = this.getAttribute('design') === 'material' && !this.inline;
      this.dispatchEvent(new CustomEvent('sheet-close', {bubbles: true, composed: true}));
    });
  };

  // a tap on the backdrop, not on the panel
  private readonly onBackdrop = (e: Event): void => {
    if (e.target === e.currentTarget) this.close();
  };

  protected override willUpdate(changed: PropertyValues<this>): void {
    // closed by its owner, with no ask of its own (Escape, through the sheet host): Material's sheet still fades out, and stays drawn until it has,
    // unless its own leave just ended, or it is inline
    if (changed.has('open') && changed.get('open') === true && !this.open) {
      if (!this.settled) void this.exit.run(() => {});
      this.settled = false;
    } else if (changed.has('open') && this.open) this.settled = false;
  }

  protected override updated(changed: PropertyValues<this>): void {
    // a field marked `autofocus` in the body, else the Close button (as the legacy sheet's did), takes focus, so a keyboard or a switch is inside the sheet at once
    if (changed.has('open') && this.open) void this.focusFirst();
  }

  // The button is slotted into the pane header, whose own tree is drawn after this one's: a sheet made open (a feature draws it only while
  // it is open) has no slot for the button until the header has rendered, and a button that is not drawn cannot take focus.
  // A sheet whose body is a field to type in marks it `autofocus`: that takes the focus instead, so the keyboard is in the field at once.
  private async focusFirst(): Promise<void> {
    await this.renderRoot.querySelector<PaneHeader>('hp-pane-header')?.updateComplete;
    if (!this.open) return;
    (this.querySelector<HTMLElement>('[autofocus]') ?? this.renderRoot.querySelector<HTMLElement>('.close'))?.focus();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-sheet': HpSheet;
  }
  interface HTMLElementEventMap {
    'sheet-close': CustomEvent<void>;
  }
}

if (!customElements.get('hp-sheet')) customElements.define('hp-sheet', HpSheet);
