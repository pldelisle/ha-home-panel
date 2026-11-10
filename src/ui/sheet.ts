// <hp-sheet>: the kit's sheet: a backdrop, a panel with a grabber, a header (badge, heading, sub-line, tabs, actions, Close) and a body.
// Pattern: humble object (Meszaros, xUnit Test Patterns) composing <hp-pane-header>, with slots for what varies (Lit docs, Shadow DOM:
// Slots); properties down (`open`, `inline`), events up (`sheet-close`), the drag to close a controller (Lit docs, Reactive Controllers).
// Must not: know which sheet is open or listen for Escape (the sheet host does, ADR 0021), fetch anything, or choose `inline` itself.
import {LitElement, css, html, type PropertyValues} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {SwipeToClose} from './controllers/swipe-to-close.ts';
import type {IconName} from './icons.ts';
import './pane-header.ts';
import {common, motion, sheet} from './styles/index.ts';

export class HpSheet extends LitElement {
  static override properties = {
    open: {type: Boolean, reflect: true},
    inline: {type: Boolean, reflect: true},
    icon: {},
    color: {},
    heading: {},
    label: {},
    closeLabel: {attribute: 'close-label'},
  };
  /** On screen. Its owner binds it to the sheet host's `isOpen`; the Close button takes focus when it turns true. */
  declare open: boolean;
  /** Placed in its pane (a tablet's detail panel) instead of over the page: no backdrop, no `aria-modal`, no swipe. */
  declare inline: boolean;
  declare icon: IconName;
  /** A colour token for the badge (`--acc`), such as `var(--c-home)`. */
  declare color: string;
  /** The heading, already in the panel's language. */
  declare heading: string;
  /** The dialog's accessible name; the heading when it is empty. */
  declare label: string;
  /** The Close button's accessible name, already in the panel's language. */
  declare closeLabel: string;

  // `display: contents`: the sheet is `position: fixed`, so the host takes no room where its owner puts it. The rules for the
  // header the legacy sheet's `.ph` carried are here and not in sheet.css, because the header is the pane header's now: the
  // heading is slotted so that it can be a size up from a pane's, and the pane header's rules, being the inner tree's, give way.
  static override styles = [
    common,
    motion,
    sheet,
    css`
      :host {
        display: contents;
      }
      hp-pane-header {
        margin-bottom: 18px;
      }
      h2 {
        margin: 0;
        font-family: var(--f-num);
        font-weight: var(--num-w);
        font-size: calc(30px * var(--tx));
        letter-spacing: -0.02em;
      }
      :host([compact]) hp-pane-header {
        margin-bottom: 14px;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      :host([compact]) h2 {
        font-size: calc(22px * var(--tx));
      }
      /* a sheet's sub-line keeps its colour on glass, where a pane's goes darker (the pane header's rule) */
      .subline {
        color: var(--fg2);
      }
      .actions {
        display: contents;
      }
      /* the legacy sheet's rule: Close in the corner, and the heading clear of it, on a phone and on a narrow window */
      @media (max-width: 720px) {
        hp-pane-header {
          position: relative;
        }
        h2,
        .subline {
          padding-right: 48px;
        }
        .close {
          position: absolute;
          top: 0;
          right: 0;
        }
      }
      :host([inline]) .sheet {
        position: static;
        display: block;
        padding: 0;
        background: none;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        animation: none;
      }
    `,
  ];

  private readonly appearance = new AppearanceConsumer(this);
  // on a phone, dragged down by its grabber or its header to close; a press on a control is the control's
  private readonly swipe = new SwipeToClose(this, {
    enabled: () => this.appearance.value?.compact === true && !this.inline,
    close: () => this.close(),
    handle: '.grab, hp-pane-header',
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
  }

  // The sub-line and the controls ride in the pane header's own slots, in wrappers: a slot forwarded into a slot is a `<slot>`,
  // which has no box of its own for the margin the pane header's `::slotted` rules give.
  protected override render() {
    return html`<div class="sheet" ?hidden=${!this.open} @click=${this.onBackdrop}>
      <div
        class="panel"
        role="dialog"
        aria-modal=${ifDefined(this.inline ? undefined : 'true')}
        aria-label=${this.label || this.heading}
        @pointerdown=${this.swipe.onPointerDown}
        @pointermove=${this.swipe.onPointerMove}
        @pointerup=${this.swipe.onPointerEnd}
        @pointercancel=${this.swipe.onPointerEnd}
      >
        <div class="grab" aria-hidden="true"></div>
        <hp-pane-header .icon=${this.icon} .color=${this.color}>
          <h2 slot="title">${this.heading}</h2>
          <div slot="sub" class="subline"><slot name="sub"></slot></div>
          <div slot="actions" class="actions">
            <slot name="tabs"></slot><slot name="actions"></slot>
            <button class="icon close" type="button" aria-label=${this.closeLabel} @click=${this.close}>✕</button>
          </div>
        </hp-pane-header>
        <slot></slot>
      </div>
    </div>`;
  }

  private readonly close = (): void => {
    this.dispatchEvent(new CustomEvent('sheet-close', {bubbles: true, composed: true}));
  };

  // a tap on the backdrop, not on the panel
  private readonly onBackdrop = (e: Event): void => {
    if (e.target === e.currentTarget) this.close();
  };

  protected override updated(changed: PropertyValues<this>): void {
    // the Close button takes focus, as the legacy sheet's did, so a keyboard or a switch is inside the sheet at once
    if (changed.has('open') && this.open) this.renderRoot.querySelector<HTMLElement>('.close')?.focus();
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
