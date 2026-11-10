// <hp-stat-tile>: the summary tile of the phone, an icon, a label, a line under it and optionally a value, in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) of the kit: it draws what its properties say and tells its parent
// by an event (Lit docs, Events: properties down, events up); its look is the kit's `.stile` rules, adopted (ADR 0019).
// Must not: know what it stands for (a section, a room), import a feature or the shell, or draw anything the parent should.
import {LitElement, css, html, nothing} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {ico, type IconName} from './icons.ts';
import {common, statTile} from './styles/index.ts';

/** What a tile says when it is tapped: the key its parent gave it, so one listener serves a list of them. */
export interface TileOpenDetail {
  key: string;
}

// a line with nothing to say still takes its height, so the tiles beside it stay one height
const NBSP = ' ';

export class StatTile extends LitElement {
  static override properties = {
    key: {reflect: true},
    icon: {},
    size: {type: Number},
    label: {},
    sub: {},
    value: {},
    unit: {},
    tone: {},
    color: {},
  };
  /** What the parent calls this tile, sent back in `tile-open`; reflected, so a parent's own markup can find it. */
  declare key: string;
  declare icon: IconName;
  /** The icon's size in pixels. */
  declare size: number;
  declare label: string;
  /** The line under the label. */
  declare sub: string;
  /** A number or word shown big, before the label; the tile has no value slot without one. */
  declare value: string | undefined;
  /** What follows the value, smaller. */
  declare unit: string | undefined;
  /**
   * What the tile looks like, as the words of the modifier classes it grew from, separated by spaces: `blue`, `grid`,
   * `home`, `on`, `wide`, `sel` (the ring of the one shown) and `list` (an icon beside its words, as the More list sets them).
   */
  declare tone: string;
  /** A colour token for the tile's accent (`--rc`), such as `var(--m-blue)`. */
  declare color: string | undefined;

  // `display: contents`: the host has no box of its own, so the button is a child of whatever lays the tiles out, as the
  // legacy tile was
  static override styles = [
    common,
    statTile,
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    // data-theme, compact, narrow, glass and large-text come from the shell, as host attributes the kit's rules test
    new AppearanceConsumer(this);
    this.key = '';
    this.icon = 'house';
    this.size = 20;
    this.label = '';
    this.sub = '';
    this.tone = '';
  }

  protected override render() {
    return html`<button
      type="button"
      class="stile ${this.tone}"
      style=${ifDefined(this.color ? `--rc:${this.color}` : undefined)}
      @click=${this.open}
    >
      <span class="ic">${ico(this.icon, this.size)}</span>
      ${
        this.value === undefined
          ? nothing
          : html`<span class="tv num">${this.value}${this.unit ? html`<small>${this.unit}</small>` : nothing}</span>`
      }
      <span class="tx"><b>${this.label}</b><small>${this.sub || NBSP}</small></span>
    </button>`;
  }

  // The button turns Enter and Space into a click, so this one listener covers a tap and the keyboard. The event leaves
  // the shadow root (`composed`), so a list's parent hears it.
  private readonly open = (): void => {
    this.dispatchEvent(
      new CustomEvent<TileOpenDetail>('tile-open', {bubbles: true, composed: true, detail: {key: this.key}}),
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-stat-tile': StatTile;
  }
  interface HTMLElementEventMap {
    'tile-open': CustomEvent<TileOpenDetail>;
  }
}

if (!customElements.get('hp-stat-tile')) customElements.define('hp-stat-tile', StatTile);
