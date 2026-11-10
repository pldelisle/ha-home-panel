// <hp-weather-history>: one tile's history: a sheet with the range tabs, a chart of its series and the low, mean and high of each.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the pure history.ts: `tileHistory`, `tileStats` and `historyChartOptions` make
// what it places; the statistics come through the pane's cache (read-through, spec 15) and the chart through <hp-chart> (ADR 0022).
// It exists only while the sheet is open, so it loads while connected and lets go on disconnect: a reply on its way is dropped, the chart goes.
// Must not: read an entity but to ask whether a sensor is there, call the API client but through the cache, mutate a cached reply, or open or close a sheet itself.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {StaleReply} from '../../core/api.ts';
import type {HistoryPoint, StatisticRow} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail, RangeTab} from '../../ui/range-tabs.ts';
import {RANGES, type Range} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {chart, common, inner, tiles} from '../../ui/styles/index.ts';
import {
  historyChartOptions,
  idsWithoutStatistics,
  statisticsStart,
  tileHistory,
  tileStats,
  type SeriesStats,
  type TileIds,
  type TileSeriesData,
} from './history.ts';
import {HISTORY_SHEET} from './sheets.ts';
import {tileDefinition, type TileKey, type Tone} from './tiles.ts';
import weatherHistoryOwn from './weather-history.element.css?inline';
import {forShadow} from '../../ui/styles/host.ts';

type Rows = Record<string, readonly StatisticRow[]>;

/** What a range's request brought back, with what it was asked for. */
interface Loaded {
  /** `tile/range/generation`: what the rows are for. */
  key: string;
  range: Range;
  statistics: Rows;
  history: Readonly<Record<string, readonly HistoryPoint[]>>;
  at: number;
}

/** What the sheet draws from a reply: the lines, their figures and the chart's options. */
interface Drawn {
  series: TileSeriesData[];
  stats: SeriesStats[];
  options: ReturnType<typeof historyChartOptions>;
}

/** The custom properties the lines take their colours from, in order: the legend names the same ones. */
const LINES = ['--c-home', '--c-wh', '--c-heat', '--c-ev'] as const;
const TONES: Record<Tone, string> = {ok: '--ok', warn: '--warn', crit: '--crit', blue: '--m-blue'};

/** What a failed read of the plain history comes to: an empty one (the statistics are the chart's), but a StaleReply stays one, to ask again under the new config. */
const optional = (error: unknown): Record<string, never> => {
  if (error instanceof StaleReply) throw error;
  return {};
};

export class WeatherHistory extends LitElement {
  static override properties = {
    tile: {},
    cache: {attribute: false},
    range: {state: true},
  };
  /** Which tile's history: the key the tile asked for. */
  declare tile: TileKey | undefined;
  /** The pane's statistics cache, whose replies are shared: nothing here changes one. */
  declare cache: StatisticsCache | undefined;
  /** The range chosen; each opening starts at the week. */
  declare range: Range;

  // The host is a block with nothing of its own: the sheet it holds is fixed to the screen. The legacy sheet's rules for the inner cards
  // on a phone (`.app.cp .sheet .inner`) are in weather-history.element.css by hand, a known copy: the cards are this element's children and not the sheet's,
  // so the kit's rule cannot reach them. The same rule is in weather-detail.ts; both go with the legacy sheets.
  // The element's own rules, its `:host` and what only its tree has, are in weather-history.element.css.
  static override styles = [common, inner, tiles, chart, unsafeCSS(forShadow(weatherHistoryOwn))];

  private readonly storeController = new StoreController(this, {ids: store => this.configured(store.config.entities)});
  private readonly appearance = new AppearanceConsumer(this);

  private loaded: Loaded | undefined;
  /** The key of the request in flight, and of the last one that failed (so a house with no history is not asked at every update). */
  private requested: string | undefined;
  private failed: string | undefined;
  private token = 0;
  private drawn: Drawn | undefined;
  private drawnKey = '';

  constructor() {
    super();
    this.tile = undefined;
    this.cache = undefined;
    this.range = 'week';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // a reply on its way finds a newer token and is dropped; the chart goes with its element
    this.token++;
    this.requested = undefined;
  }

  // the ids the tile's series name in this house, and the ones Home Assistant has a state for
  private configured(entities: Readonly<Record<string, string | null>>): string[] {
    const def = this.tile ? tileDefinition(this.tile) : undefined;
    return (def?.series ?? []).flatMap(({entity}) => (entities[entity] ? [entities[entity]] : []));
  }

  private present(): TileIds {
    const {store} = this.storeController;
    const def = this.tile ? tileDefinition(this.tile) : undefined;
    return Object.fromEntries(
      (def?.series ?? []).map(({entity}) => {
        const id = store.config.entities[entity];
        return [entity, id && store.hass?.states[id] ? id : null];
      }),
    );
  }

  // The lines, their figures and the chart's options are made again only when a reply, the theme or the language changed: an update
  // for anything else (a sensor's new state) leaves the chart the object it was, so <hp-chart> is not asked to draw it again.
  protected override willUpdate(): void {
    const {loaded, tile} = this;
    if (!tile || !loaded) return;
    const {store} = this.storeController;
    const key = `${loaded.at}/${loaded.key}/${this.appearance.value?.theme ?? 'light'}/${store.language}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const def = tileDefinition(tile);
    const series = tileHistory(def, this.present(), loaded.statistics, loaded.history, loaded.range, loaded.at);
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const tokens = {
      series: LINES.map(token),
      tones: Object.fromEntries(Object.entries(TONES).map(([tone, name]) => [tone, token(name)])) as Record<
        Tone,
        string
      >,
      muted: token('--fg3'),
    };
    this.drawn = {
      series,
      stats: tileStats(series),
      options: historyChartOptions(def, series, loaded.range, {fmt: store.fmt, t: store.t, tokens, now: loaded.at}),
    };
  }

  protected override render() {
    const {tile} = this;
    if (!tile) return nothing;
    const {t, fmt} = this.storeController.store;
    const def = tileDefinition(tile);
    const heading = t(def.labelKey);
    const title = t('weather.history.title', {name: heading, range: t(RANGES[this.range].labelKey)});
    const note = t(def.noteKey);
    const tabs: RangeTab[] = (Object.keys(RANGES) as Range[]).map(range => ({range, label: t(RANGES[range].tabKey)}));
    const state = this.state();
    const lines = state === 'chart' ? (this.drawn?.series ?? []) : [];
    return html`<hp-sheet
        .open=${true}
        .icon=${'wx'}
        .color=${'var(--m-blue)'}
        .heading=${heading}
        .closeLabel=${t('weather.history.close')}
        @sheet-close=${this.dismiss}
      >
        <div slot="sub">${t(def.subKey)}</div>
        <hp-range-tabs slot="tabs" .ranges=${tabs} .value=${this.range} @range-change=${this.onRange}></hp-range-tabs>
        <div class="inner">
          <h3>${title}</h3>
          <p>${note}</p>
          <div class="legend">
            ${lines.map(
              (line, index) =>
                html`<span><b style=${`background:var(${LINES[index % LINES.length]})`}></b>${t(line.nameKey)}</span>`,
            )}
          </div>
          ${this.renderBody(state, `${title}. ${note}`)}
        </div>
        <div class="inner over">
          <h3>${t('weather.history.period')}</h3>
          <div class="tiles">
            ${repeat(
              state === 'chart' ? (this.drawn?.stats ?? []) : [],
              stat => stat.entity,
              stat => {
                const name = t(stat.nameKey);
                const figure = (key: 'low' | 'mean' | 'high') =>
                  html`<div class="tile">
                    <div class="k">${t(`weather.history.${key}`, {name})}</div>
                    <div class="v num">${fmt.number(stat[key], def.dec ?? 1)}<small>${stat.unit}</small></div>
                  </div>`;
                return html`${figure('low')}${figure('mean')}${figure('high')}`;
              },
            )}
          </div>
        </div>
      </hp-sheet>
      ${lensLike(this.getRootNode())}`;
  }

  // what the sheet has to say: a sensor Home Assistant lacks, a read that failed, the wait, no points at all, or the chart. A range
  // chosen while the last one is drawn keeps its chart until the new rows arrive, as the legacy sheet did.
  private state(): 'missing' | 'failed' | 'loading' | 'empty' | 'chart' {
    if (!Object.values(this.present()).some(id => id !== null)) return 'missing';
    if (this.failed === this.wanted()) return 'failed';
    if (!this.drawn) return 'loading';
    return this.drawn.series.some(line => line.points.length) ? 'chart' : 'empty';
  }

  // the chart, or the line that says why there is none
  private renderBody(state: ReturnType<WeatherHistory['state']>, label: string) {
    const {t} = this.storeController.store;
    switch (state) {
      case 'missing':
        return html`<p>${t('weather.history.missing')}</p>`;
      case 'failed':
        return html`<p>${t('weather.detail.historyFailed')}</p>`;
      case 'loading':
        return html`<p class="loading">${t('weather.history.loading')}</p>`;
      case 'empty':
        return html`<p class="loading">${t('weather.history.empty')}</p>`;
      case 'chart':
        return html`<hp-chart .height=${300} .label=${label} .options=${this.drawn?.options}></hp-chart>`;
    }
  }

  private readonly onRange = (event: CustomEvent<RangeChangeDetail>): void => {
    this.range = event.detail.range;
    // a range that failed is asked again when it is chosen again, as the legacy sheet asked at every tab
    this.failed = undefined;
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the element only says so
  private readonly dismiss = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(HISTORY_SHEET));
  };

  protected override updated(): void {
    this.loadIfDue();
  }

  // what the rows are for: the tile, the range and the config they are asked under
  private wanted(): string {
    return `${this.tile}/${this.range}/${this.storeController.store.generation}`;
  }

  // The statistics are asked for when the sheet first shows and for each range chosen; a second ask within the cache's time, or of a
  // range already seen, is the cache's hit (the hour-aligned start makes the call the same).
  private loadIfDue(): void {
    const {cache, tile} = this;
    if (!cache || !tile) return;
    const ids = [...new Set(Object.values(this.present()).filter((id): id is string => id !== null))];
    if (!ids.length) return;
    const key = this.wanted();
    if (this.loaded?.key === key || this.requested === key || this.failed === key) return;
    void this.load(cache, key, ids);
  }

  private async load(cache: StatisticsCache, key: string, ids: string[]): Promise<void> {
    const range = this.range;
    const {days, period} = RANGES[range];
    const token = ++this.token;
    this.requested = key;
    const now = Date.now();
    const start = statisticsStart(now, days);
    try {
      const statistics = await cache.statistics(ids, period, start, ['mean', 'min', 'max']);
      // the sensors the recorder keeps no statistics for (Environment Canada's chance, UV and AQHI) are drawn from their plain history
      const missing = idsWithoutStatistics(statistics, ids);
      const history = missing.length
        ? await cache.history(missing, start, {minimal: true, attributes: false}).catch(optional)
        : {};
      if (token !== this.token) return;
      this.loaded = {key, range, statistics, history, at: now};
    } catch (error) {
      if (token !== this.token) return;
      // a reply of a config that is gone: ask again under the new one
      if (!(error instanceof StaleReply)) {
        console.error('home-panel weather history', error);
        this.failed = key;
      }
    }
    this.requested = undefined;
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-weather-history': WeatherHistory;
  }
}

if (!customElements.get('hp-weather-history')) customElements.define('hp-weather-history', WeatherHistory);
