// <hp-clock-line>: the header's clock, the time with its am or pm smaller beside it (French says the 24-hour time alone), and the small line
// under it, "Live · history 2:00 pm", the time of the statistics cache's last reply, or "Live · loading history" before the first.
// Pattern: a humble object (Meszaros, xUnit Test Patterns) on a one-second tick, drawn in light DOM (ADR 0033) so the legacy `.clock` rules
// still size it; it reads the panel's cache (ADR 0028) through context. It replaced the legacy `renderHeader`'s clock (#269).
// Must not: read an entity, ask the cache for anything, or word anything but through the catalog.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing} from 'lit';
import type {StatisticsCache} from '../core/statistics-cache.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {TickController} from '../ui/controllers/tick.ts';
import {statisticsCacheContext} from '../ui/contexts.ts';

export class ClockLine extends LitElement {
  // the language and the formats; no entity
  private readonly storeController = new StoreController(this, {ids: () => []});
  private cache: StatisticsCache | undefined;

  constructor() {
    super();
    new ContextConsumer(this, {
      context: statisticsCacheContext,
      subscribe: false,
      callback: cache => {
        this.cache = cache;
      },
    });
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
    const at = this.cache?.lastLoadedAt ?? null;
    return html`${time}<span style="font-size:.45em;margin-left:4px">${period}</span
      ><small>${at === null ? t('home.clock.loading') : t('home.clock.history', {time: fmt.time(at)})}</small>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-clock-line': ClockLine;
  }
}

if (!customElements.get('hp-clock-line')) customElements.define('hp-clock-line', ClockLine);
