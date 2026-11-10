// <hp-weather-detail>: the Weather detail: now, sun, alerts, radar, the next hours and days, three seven-day charts and the season.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down and the pure history of history.ts, keyed
// (Lit docs, repeat); the statistics come through the pane's cache (read-through, spec 15) and the charts through <hp-chart> (ADR 0022).
// It loads while connected and lets go on disconnect (the radar, a late reply, the charts): the pane shows it only when it is on screen.
// Must not: read an entity (the pane's model did), call the API client for statistics except through the cache, mutate a cached reply, or open a sheet itself.
import {ContextConsumer} from '@lit/context';
import {LitElement, css, html, nothing, svg, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {StaleReply, type PanelApi} from '../../core/api.ts';
import type {PanelHass} from '../../core/hass.ts';
import type {StatisticRow} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {MediaQueryController} from '../../ui/controllers/media-query.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext} from '../../ui/contexts.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {weatherIcon} from '../../ui/icons.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {chart, common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import {
  detailChartOptions,
  SEASON_DAYS,
  seasonTicks,
  seasonView,
  sevenDaySeries,
  statisticsStart,
  STATISTICS_TTL_MS,
  WEEK_DAYS,
  type DetailCharts,
  type SeasonView,
} from './history.ts';
import {sevenDayIds} from './ids.ts';
import type {DayRow, HourCell, StatTileView, WeatherViewModel} from './model.ts';
import {mountRadar, type RadarMount} from './radar.ts';
import {HISTORY_SHEET} from './sheets.ts';
import detailStyles from './styles.css?inline';

type Rows = Record<string, readonly StatisticRow[]>;

/** The statistics as the cache returned them, with the instant and the config generation they were asked under. */
interface Loaded {
  hour: Rows;
  day: Rows;
  at: number;
  generation: number;
}

/** The radar's narrow shape: the same breakpoint the legacy panel's `phone` test used. */
const NARROW = '(max-width: 720px)';

export class WeatherDetail extends LitElement {
  static override properties = {
    view: {attribute: false},
    cache: {attribute: false},
  };
  /** The pane's view model: now, sun, alerts, hours and days. */
  declare view: WeatherViewModel | undefined;
  /** The pane's statistics cache. */
  declare cache: StatisticsCache | undefined;

  // The host is a block; its blocks are one column with the sixteen pixels between them the pane's `.panel` gave (fourteen on the phone).
  // On a phone the detail sits in a sheet, which draws the heading; the card rules of the old sheet that reached its `.inner` are here.
  static override styles = [
    common,
    inner,
    tiles,
    chart,
    unsafeCSS(forShadow(detailStyles)),
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .blocks {
        min-width: 0;
      }
      .blocks > * + * {
        margin-top: 16px;
      }
      :host([compact]) .blocks > * + * {
        margin-top: 14px;
      }
      :host([compact]) .inner {
        padding: 14px;
        border-radius: 18px;
      }
      [slot='icon'] {
        display: contents;
      }
    `,
  ];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly narrow = new MediaQueryController(this, NARROW);
  private api: PanelApi | undefined;

  private loaded: Loaded | undefined;
  /** The load in flight: which one (a later one, or a disconnect, makes an earlier reply stale) and under which config. */
  private request: {token: number; generation: number} | undefined;
  private token = 0;
  /** When the last load failed, so a house with no history is not asked again at every update. */
  private failedAt: number | undefined;
  private failed = false;

  // the options of each chart, rebuilt only when what they are made of changed
  private hoursKey = '';
  private hoursOptions: DetailCharts['hours'] | undefined;
  private weekKey = '';
  private week: Pick<DetailCharts, 'temperature' | 'wind' | 'pressure'> | undefined;
  private season: SeasonView | null = null;

  private radar: RadarMount | undefined;
  private radarKey = '';
  private radarHass: PanelHass | null = null;

  constructor() {
    super();
    this.view = undefined;
    this.cache = undefined;
    new ContextConsumer(this, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.api = api;
      },
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // a reply on its way finds a newer token and is dropped; the radar's timers and card go with it
    this.token++;
    this.request = undefined;
    this.radar?.destroy();
    this.radar = undefined;
    this.radarKey = '';
    this.radarHass = null;
  }

  // The options of a chart are rebuilt only when what they are made of changed: the hours when the forecast's points or the theme or
  // language did, the week and the season when new statistics arrived. An update for anything else (the temperature now) leaves the
  // charts' `options` the objects they were, so `<hp-chart>` is not asked to draw the same lines again.
  protected override willUpdate(): void {
    const {view, loaded} = this;
    if (!view) return;
    const {store} = this.storeController;
    const base = `${this.appearance.value?.theme ?? 'light'}/${store.language}`;
    const hoursKey = `${base}/${JSON.stringify(view.hourSeries)}`;
    const weekKey = loaded ? `${base}/${loaded.at}` : '';
    if (hoursKey === this.hoursKey && weekKey === this.weekKey) return;
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const tokens = {warm: token('--c-wh'), cool: token('--c-home'), purple: token('--m-purple'), muted: token('--fg3')};
    const {fmt, t} = store;
    const ids = sevenDayIds(store.config);
    const series = loaded ? sevenDaySeries(loaded.hour, ids) : sevenDaySeries({}, ids);
    const charts = detailChartOptions(view.hourSeries, series, {fmt, t, tokens, now: loaded?.at ?? Date.now()});
    if (hoursKey !== this.hoursKey) {
      this.hoursKey = hoursKey;
      this.hoursOptions = charts.hours;
    }
    if (loaded && weekKey !== this.weekKey) {
      this.weekKey = weekKey;
      this.week = charts;
      const days = (id: string | null): readonly StatisticRow[] => (id ? (loaded.day[id] ?? []) : []);
      this.season = seasonView(days(ids.temperature), days(ids.gusts), {fmt, t, now: loaded.at});
    }
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const compact = this.appearance.value?.compact === true;
    // lit-analyzer does not know `aria-description`; the ignore covers the tile buttons' tags below
    return html`<div
        class="blocks"
        role=${ifDefined(compact ? undefined : 'dialog')}
        aria-label=${ifDefined(compact ? undefined : t('weather.title'))}
        @click=${this.onTile}
      >
        ${compact ? nothing : this.renderHeader(view)} ${this.renderAlerts(view)}
        <div class="two">
          <div class="inner">${this.renderNow(view)}</div>
          <div class="inner">${this.renderSun(view)}</div>
        </div>
        <div class="inner">
          <h3>${t('weather.detail.radar')}</h3>
          <p>${t('weather.detail.radarNote')}</p>
          <div class="radar" id="wradar"></div>
        </div>
        <div class="two">
          <div class="inner">${this.renderHours(view)}</div>
          <div class="inner">
            <h3>${t('weather.detail.days')}</h3>
            <p>${t('weather.detail.daysNote')}</p>
            <div id="wdays">${this.renderDays(view.days)}</div>
          </div>
        </div>
        ${this.renderWeek()}
        <div class="inner">${this.renderSeason()}</div>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // On a tablet the detail opens with its own header, the pane's being the phone's; on a phone the sheet draws it.
  private renderHeader({summary}: WeatherViewModel) {
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'wx'} .color=${'var(--m-amber)'} .heading=${t('weather.title')}>
      <span slot="icon">${weatherIcon('partlycloudy', 30, true, t('weather.cond.partlycloudy'))}</span>
      <div slot="sub">${summary}</div>
    </hp-pane-header>`;
  }

  private renderAlerts({alerts}: WeatherViewModel) {
    return html`<div class="walerts" ?hidden=${!alerts.length}>
      ${alerts.map(
        alert =>
          html`<div class="walert ${alert.tone}">
            <b>${alert.kind}</b><span>${alert.title}</span>${alert.time ? html`<small>${alert.time}</small>` : nothing}
          </div>`,
      )}
    </div>`;
  }

  private renderNow({now}: WeatherViewModel) {
    return html`<div class="wnow">
        <div class="wicon">${weatherIcon(now.icon.condition, 64, now.icon.day, now.icon.label)}</div>
        <div>
          <div class="num" style="font-size:64px;line-height:1">${now.temperature}</div>
          <div style="font-weight:600;font-size:16px;margin-top:4px">${now.condition}</div>
          <div class="muted">${now.line}</div>
        </div>
      </div>
      ${now.summary ? html`<p class="wsum">${now.summary}</p>` : nothing}
      <div class="tiles" style="margin-top:14px">${now.tiles.map(tile => this.renderTileButton(tile))}</div>`;
  }

  // a tile that opens its history; the click is heard once on the blocks (`onTile`)
  private renderTileButton(tile: StatTileView) {
    const {t} = this.storeController.store;
    return html`<!-- @ts-ignore -->
      <button
        type="button"
        class="tile tilebtn"
        data-wx=${tile.key}
        aria-description=${t('weather.detail.opensHistory')}
      >
        <div class="k">${tile.label}</div>
        <div class="v num">${tile.value}<small>${tile.unit}</small></div>
        ${tile.sub || tile.arrow ? html`<div class="s">${this.tileSub(tile)}</div>` : nothing}
      </button>`;
  }

  // the wind's bearing arrow is drawn after the compass point, which opens the line
  private tileSub({sub, arrow}: StatTileView) {
    if (!arrow) return sub;
    return html`${sub.slice(0, arrow.after)}<svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        style=${`transform:rotate(${arrow.bearing + 180}deg);vertical-align:-2px;margin-left:4px`}
        aria-hidden="true"
      >
        <path d="M12 3l6 16-6-4-6 4z" fill="currentColor" /></svg
      >${sub.slice(arrow.after)}`;
  }

  private plainTile(label: string, value: string, unit: string, sub: string) {
    return html`<div class="tile">
      <div class="k">${label}</div>
      <div class="v num">${value}<small>${unit}</small></div>
      ${sub ? html`<div class="s">${sub}</div>` : nothing}
    </div>`;
  }

  private renderSun({sun}: WeatherViewModel) {
    if (!sun) return nothing;
    const {t} = this.storeController.store;
    const {cx, cy} = sun;
    return html`<h3>${t('weather.detail.sun')}</h3>
      <p>${sun.daylight}</p>
      <svg class="sunarc" viewBox="0 0 300 150" role="img" aria-label=${sun.label}>
        <path
          d="M30 130 A120 110 0 0 1 270 130"
          fill="none"
          stroke="var(--line)"
          stroke-width="3"
          stroke-dasharray="2 6"
          stroke-linecap="round"
        />
        ${
          sun.isUp
            ? svg`<path
              d="M30 130 A120 110 0 0 1 ${cx} ${cy}"
              fill="none"
              stroke="var(--m-amber)"
              stroke-width="3"
              stroke-linecap="round"
            />`
            : nothing
        }
        <line x1="14" y1="130" x2="286" y2="130" stroke="var(--fg3)" stroke-opacity=".5" />
        ${
          sun.isUp
            ? svg`<circle cx=${cx} cy=${cy} r="11" fill="var(--m-amber)" /><circle
                cx=${cx}
                cy=${cy}
                r="18"
                fill="var(--m-amber)"
                opacity=".25"
              />`
            : nothing
        }
      </svg>
      <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${sun.events.map(event => this.plainTile(event.label, event.time, '', event.sub))}
      </div>`;
  }

  private renderHours({hours}: WeatherViewModel) {
    const {t} = this.storeController.store;
    return html`<h3>${t('weather.detail.hours')}</h3>
      <p>${t('weather.detail.hoursNote')}</p>
      <div id="whours">
        ${
          hours.length
            ? html`<div class="hstrip">
                  ${repeat(
                    hours,
                    hour => hour.key,
                    hour => this.renderHour(hour),
                  )}
                </div>
                <hp-chart
                  .height=${200}
                  .label=${`${t('weather.detail.hours')}. ${t('weather.detail.hoursNote')}`}
                  .options=${this.hoursOptions}
                ></hp-chart>`
            : html`<p>${t('weather.detail.noHours')}</p>`
        }
      </div>`;
  }

  private renderHour(hour: HourCell) {
    const {icon} = hour;
    return html`<div>
      <span>${hour.label}</span>${weatherIcon(icon.condition, 28, icon.day, icon.label)}<b class="num"
        >${hour.temperature}</b
      >${hour.pop ? html`<small>${hour.pop}</small>` : html`<small>&nbsp;</small>`}
    </div>`;
  }

  private renderDays(days: DayRow[]) {
    const {t} = this.storeController.store;
    if (!days.length) return html`<p>${t('weather.detail.noDays')}</p>`;
    return repeat(
      days,
      day => day.dayKey,
      day =>
        html`<div class="drow">
          <span class="dn">${day.label}</span>${weatherIcon(day.icon.condition, 26, day.icon.day, day.icon.label)}<span
            class="dc"
            >${day.condition}</span
          ><span class="dp">${day.pop}</span> <span class="num dl">${day.lo}</span
          ><span class="rng"
            ><b style="left:${day.barLeft}%;width:${day.barWidth}%"></b>${
              day.dot === null ? nothing : html`<i style="left:${day.dot}%"></i>`
            }</span
          ><span class="num dh">${day.hi}</span>
        </div>`,
    );
  }

  private renderWeek() {
    const {t} = this.storeController.store;
    const {week} = this;
    return html`<div class="inner">
        <h3>${t('weather.detail.week')}</h3>
        <p>${t('weather.detail.weekNote')}</p>
        <div class="legend">
          <span><b style="background:var(--c-wh)"></b>${t('weather.series.temperature')}</span>
          <span><b style="background:var(--c-home)"></b>${t('weather.series.dewPoint')}</span>
        </div>
        <hp-chart
          .height=${250}
          .label=${`${t('weather.detail.week')}. ${t('weather.detail.weekNote')}`}
          .options=${week?.temperature}
        ></hp-chart>
      </div>
      <div class="two">
        <div class="inner">
          <h3>${t('weather.tile.wind.label')}</h3>
          <p>${t('weather.detail.windNote')}</p>
          <hp-chart
            .height=${200}
            .label=${`${t('weather.tile.wind.label')}. ${t('weather.detail.windNote')}`}
            .options=${week?.wind}
          ></hp-chart>
        </div>
        <div class="inner">
          <h3>${t('weather.tile.pres.label')}</h3>
          <p>${t('weather.detail.pressureNote')}</p>
          <hp-chart
            .height=${200}
            .label=${`${t('weather.tile.pres.label')}. ${t('weather.detail.pressureNote')}`}
            .options=${week?.pressure}
          ></hp-chart>
        </div>
      </div>`;
  }

  private renderSeason() {
    const {t} = this.storeController.store;
    const {season} = this;
    const step = this.appearance.value?.compact ? 20 : 10;
    return html`<h3>${t('weather.detail.season')}</h3>
      <p id="wseasonp">${season?.since ?? ''}</p>
      <div class="tiles" id="wrec" style="margin:12px 0 8px" ?hidden=${!season}>
        ${season?.tiles.map(tile => this.plainTile(tile.label, tile.value, tile.unit, tile.sub))}
      </div>
      <div>
        ${
          this.failed
            ? html`<p>${t('weather.detail.historyFailed')}</p>`
            : season
              ? html`${repeat(
                    season.rows,
                    row => row.key,
                    row =>
                      html`<div class="mrow">
                        <span class="dn">${row.name}${row.from ? html`<small> ${row.from}</small>` : nothing}</span
                        ><span class="num dl">${row.low}</span>
                        <span class="rng season"
                          >${
                            season.freezingAt === null ? nothing : html`<em style=${`left:${season.freezingAt}%`}></em>`
                          }<b style="left:${row.barLeft}%;width:${row.barWidth}%"></b
                          ><i style="left:${row.averageAt}%" title=${row.title}></i></span
                        ><span class="num dh">${row.high}</span><span class="dp muted">${row.note}</span>
                      </div>`,
                  )}
                  <div class="mrow axis">
                    <span></span><span></span
                    ><span class="rng season" style="background:none"
                      >${seasonTicks(season, step).map(
                        tick => html`<span class="tick" style="left:${tick.at}%">${tick.value}°</span>`,
                      )}</span
                    ><span></span><span></span>
                  </div>`
              : nothing
        }
      </div>`;
  }

  // a tile's button anywhere in the blocks: the history is the shell's to open, as the pane's tiles are
  private readonly onTile = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-wx]');
    if (button?.dataset.wx) this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET, {key: button.dataset.wx}));
  };

  protected override updated(): void {
    this.mountRadarIfDue();
    this.loadIfDue();
  }

  // The radar is mounted while the detail is connected and drawn; a change of theme or of the window's shape makes a new map (the
  // card reads them once), and any other update only hands it the newer `hass`.
  private mountRadarIfDue(): void {
    const box = this.renderRoot.querySelector<HTMLElement>('.radar');
    const {api} = this;
    const {store} = this.storeController;
    if (!box || !api) return;
    const dark = this.appearance.value?.theme === 'dark';
    const phone = this.narrow.matches;
    const key = `${dark}/${phone}`;
    const {hass} = store;
    if (this.radar && key === this.radarKey) {
      if (hass && hass !== this.radarHass) this.radar.update(hass);
    } else {
      this.radar?.destroy();
      this.radar = mountRadar(box, api, {dark, phone, hass, failed: store.t('weather.detail.radarFailed')});
      this.radarKey = key;
    }
    this.radarHass = hass;
  }

  // The statistics are asked for when the detail first shows, and again when they are older than the cache keeps them or the config
  // changed; the cache answers a second opening within the time with the first one's reply (the hour-aligned start makes the call the same).
  private loadIfDue(): void {
    const {cache} = this;
    if (!cache) return;
    const {generation} = this.storeController.store;
    const now = Date.now();
    if (this.request) {
      if (this.request.generation === generation) return;
    } else if (this.loaded?.generation === generation && now - this.loaded.at < STATISTICS_TTL_MS) return;
    else if (this.failedAt !== undefined && now - this.failedAt < STATISTICS_TTL_MS) return;
    void this.load(cache, generation, now);
  }

  private async load(cache: StatisticsCache, generation: number, now: number): Promise<void> {
    const {store} = this.storeController;
    const ids = sevenDayIds(store.config);
    const token = ++this.token;
    this.request = {token, generation};
    try {
      const [hour, day] = await Promise.all([
        cache.statistics(Object.values(ids), 'hour', statisticsStart(now, WEEK_DAYS), ['mean', 'min', 'max']),
        cache.statistics([ids.gusts, ids.temperature], 'day', statisticsStart(now, SEASON_DAYS), [
          'mean',
          'min',
          'max',
        ]),
      ]);
      if (token !== this.token) return;
      this.loaded = {hour, day, at: now, generation};
      this.failed = false;
      this.failedAt = undefined;
    } catch (error) {
      // a reply of a config that is gone: the update that follows the change asks again, and says nothing
      if (token !== this.token || error instanceof StaleReply) return;
      console.error('home-panel weather history', error);
      this.failed = true;
      this.failedAt = now;
    } finally {
      if (token === this.token) this.request = undefined;
    }
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-weather-detail': WeatherDetail;
  }
}

if (!customElements.get('hp-weather-detail')) customElements.define('hp-weather-detail', WeatherDetail);
