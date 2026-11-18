// <hp-clock-line>: the header's clock, the time with its am or pm smaller beside it (French says the 24-hour time alone), and the small line
// under it, empty while the history is fresh and "Updated 2:00 pm" (the time the history on screen was last answered, which the header hands it as `answeredAt` and the line asks at each tick) once `isHistoryStale` says it is old; a pane that reads no history has no line (#426).
// Pattern: a humble object (Meszaros, xUnit Test Patterns) on a one-second tick, drawn in light DOM (ADR 0033) so the legacy `.clock` rules
// still size it. It replaced the legacy `renderHeader`'s clock (#269).
// Must not: read an entity or the cache, or word anything but through the catalog.
import {LitElement, html, nothing} from 'lit';
import {isHistoryStale} from './clock-note.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {TickController} from '../ui/controllers/tick.ts';

export class ClockLine extends LitElement {
  static override properties = {answeredAt: {attribute: false}};
  /** When the history on screen was last answered, in milliseconds; null when the pane shown reads none. Asked at each render, so a hit that moves it needs no redraw of the header. */
  declare answeredAt: () => number | null;

  // the language and the formats; no entity
  private readonly storeController = new StoreController(this, {ids: () => []});

  constructor() {
    super();
    this.answeredAt = () => null;
    new TickController(this, 1_000);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const {hass, isFrench, t, fmt} = this.storeController.store;
    if (!hass) return nothing;
    const now = Date.now();
    // "2:00 pm" is the time and its day period, the second drawn smaller; French has none
    const [time, period = ''] = isFrench ? [fmt.time24(now)] : fmt.time(now).split(' ');
    const at = this.answeredAt();
    return html`${time}<span style="font-size:.45em;margin-left:4px">${period}</span>${
        at !== null && isHistoryStale(at, now)
          ? html`<small>${t('home.clock.updated', {time: fmt.time(at)})}</small>`
          : nothing
      }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-clock-line': ClockLine;
  }
}

if (!customElements.get('hp-clock-line')) customElements.define('hp-clock-line', ClockLine);
