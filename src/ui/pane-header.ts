// <hp-pane-header>: the block a pane opens with: a badge with the subject's icon and colour, the heading, a sub-line and actions.
// Pattern: humble object (Meszaros, xUnit Test Patterns) with slots (Lit docs, Shadow DOM: Slots): the sub-line, the actions, a heading
// and, for a subject whose icon is drawn in colour (the weather's), the badge's icon stay light DOM in the parent's root (ADR 0016).
// Must not: write the sub-line or the actions, know the subject it heads, or decide where it sits in a pane (the pane does).
import {LitElement, css, html, nothing} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {ico, type IconName} from './icons.ts';
import {lensLike} from './lens.ts';
import {badge, common, paneHeader} from './styles/index.ts';

export class PaneHeader extends LitElement {
  static override properties = {
    icon: {},
    color: {},
    heading: {},
  };
  declare icon: IconName;
  /** A colour token for the badge (`--acc`), such as `var(--m-blue)`. */
  declare color: string;
  /** The heading, already in the panel's language. A node in the `title` slot takes its place. */
  declare heading: string;

  // The host is a block with the pane's gap under it: the pane puts it where it goes (a grid column, a margin, none on a
  // phone's Home) with rules on the element, which win over these.
  static override styles = [
    common,
    badge,
    paneHeader,
    css`
      :host {
        display: block;
        margin-bottom: 18px;
      }
      :host([compact]) {
        margin-bottom: 12px;
      }
    `,
  ];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the kit's rules test
    new AppearanceConsumer(this);
    this.icon = 'house';
    this.color = 'var(--fg3)';
    this.heading = '';
  }

  // The heading is the slot's fallback, drawn only when someone gave one: a pane whose heading is slotted has one heading in
  // its tree. Whitespace between the parts draws nothing (a flex container ignores it, and a block's collapses). The lens's svg
  // comes last, so the badge's icon is still the first svg of a pane.
  protected override render() {
    return html`<div class="ph">
        <span class="badge" part="badge" style=${styleMap({'--acc': this.color})}
          ><slot name="icon">${ico(this.icon, 26)}</slot></span
        >
        <div class="grow">
          <slot name="title">${this.heading ? html`<h2>${this.heading}</h2>` : nothing}</slot>
          <slot name="sub"></slot>
        </div>
        <slot name="actions"></slot>
      </div>
      ${lensLike(this.getRootNode())}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-pane-header': PaneHeader;
  }
}

if (!customElements.get('hp-pane-header')) customElements.define('hp-pane-header', PaneHeader);
