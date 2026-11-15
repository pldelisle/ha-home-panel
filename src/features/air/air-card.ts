// <hp-air-card>: the Air card: the outside figure with its level, the state line, and a box per room with its three pollutants and the fan's line.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `card` view, rooms keyed by purifier (Lit docs, repeat); written
// to be placed by any pane, the Home tab's later (spec 24). Given `openLabel` its box is a button that asks the shell for the detail (ADR 0021).
// Must not: read an entity or the clock, word a string (the model does), or open the sheet (it asks).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import type {AirViewModel, RoomLine} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import cardOwn from './air-card.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

type Card = AirViewModel['card'];
/** The card of a house with purifiers; the other is the title with "No purifiers found". */
type Body = Extract<Card, {empty: false}>;
const isFilled = (card: Card): card is Body => !card.empty;

export class AirCard extends LitElement {
  static override properties = {
    view: {attribute: false},
    openLabel: {},
  };
  /** The model's card: the title, and the empty message or the outside figure, the state and the rooms. */
  declare view: Card | undefined;
  /** What a screen reader says of the box when a tap opens the detail; absent where the detail is already on screen (a tablet), and the box is no button. */
  declare openLabel: string | undefined;

  // The element's own rules, the card's chrome as the box's and what only its tree has, are in air-card.element.css.
  static override styles = [common, unsafeCSS(forShadow(cardOwn))];

  constructor() {
    super();
    this.view = undefined;
    this.openLabel = undefined;
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const open = this.openLabel;
    // the box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the pane's
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the role and the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <div
        class=${classMap({aqbox: true, tap: !!open})}
        role=${ifDefined(open ? 'button' : undefined)}
        tabindex=${ifDefined(open ? '0' : undefined)}
        aria-description=${ifDefined(open)}
        @click=${this.open}
        @keydown=${this.onKey}
      >
        ${isFilled(view) ? this.renderBody(view) : this.renderEmpty(view)}
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  private renderEmpty({title, message}: {title: string; message: string}) {
    return html`<div class="top"><span class="lbl">${title}</span><span class="right">${message}</span></div>`;
  }

  // the figure's words and the `›` are direct children of `.right`, as the legacy card wrote them: the flex gap is between each
  private renderBody(view: Body) {
    const {outside, state, rooms} = view;
    return html`<div class="top">
        <span class="lbl">${view.title}</span
        ><span class="right"
          >${outside ? html`${outside.label} <b class="num">${outside.aqi}</b> ${outside.level}` : nothing}<span
            class="aqgo"
            >›</span
          ></span
        >
      </div>
      <div class="aqstate lv${state.tone}">
        <span class="state"><i></i>${state.text}</span><span class="why">${state.why}</span>
      </div>
      <div class="aqlist">
        ${repeat(
          rooms,
          room => room.id,
          room => this.renderRoom(room),
        )}
      </div>`;
  }

  private renderRoom(room: RoomLine) {
    return html`<div class="aqroom lv${room.tone}">
      <div class="n"><i></i>${room.name}</div>
      <div class="aqm">
        ${room.metrics.map(
          m => html`<span class=${m.high ? 'hi' : ''}><b class="num">${m.value}</b><small>${m.label}</small></span>`,
        )}
      </div>
      <div class="s">${room.line}</div>
    </div>`;
  }

  // arrow fields, so the template hands the same function at every render
  private readonly open = (): void => {
    if (this.openLabel) this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET));
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.openLabel || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    this.open();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-card': AirCard;
  }
}

if (!customElements.get('hp-air-card')) customElements.define('hp-air-card', AirCard);
