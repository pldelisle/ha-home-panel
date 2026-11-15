// <hp-sensor-history>: one door or motion sensor's history: a sheet with Day and Week, the strip of its on-periods, the last events and four tiles.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the pure history.ts: `segments`, `stripBars`, `axisLabels`, `eventRows` and
// `statTiles` make what it places; the history comes through the pane's cache (read-through, spec 17). It exists only while its sheet is
// open: a reply on its way is dropped unless the sheet is still connected on the same sensor and range.
// Must not: read an entity but to find the sensor, call the API client but through the cache, mutate a cached reply, or open or close a sheet itself.
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {StaleReply} from '../../core/api.ts';
import type {HistoryPoint} from '../../core/ha.ts';
import type {StatisticsCache} from '../../core/statistics-cache.ts';
import {doorMotionSensors, type SensorInputs, type SensorKind} from '../../providers/door-motion.ts';
import {
  axisLabels,
  eventRows,
  periodStats,
  segments,
  sheetTexts,
  statTiles,
  stripBars,
  type SheetRange,
} from './history.ts';
import {HISTORY_SHEET} from './sheets.ts';
import sheetOwn from './sensor-history.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail, RangeTab} from '../../ui/range-tabs.ts';
import {RANGES} from '../../ui/ranges.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {common, inner, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The colour a kind of sensor is drawn in, for the badge and the strip: a door open is amber, motion is the home colour. */
const TONE: Record<SensorKind, string> = {door: 'var(--t-warn)', motion: 'var(--t-home)'};

/** What a request brought back, with what it was for. */
interface Loaded {
  range: SheetRange;
  points: readonly HistoryPoint[];
}

export class SensorHistory extends LitElement {
  static override properties = {
    sensorId: {},
    cache: {attribute: false},
    range: {state: true},
  };
  /** Which sensor: the id the tap asked for, bound by the pane from the sheet host's detail. */
  declare sensorId: string | undefined;
  /** The pane's history cache, whose replies are shared: nothing here changes one. */
  declare cache: StatisticsCache | undefined;
  /** The range chosen; each opening starts at the day. */
  declare range: SheetRange;

  // The host is a block with nothing of its own: the sheet it holds is fixed to the screen. The legacy sheet's rule for the inner cards
  // on a phone (`.app.cp .sheet .inner`) is in sensor-history.element.css by hand, a known copy, as weather-history.ts has it.
  // The element's own rules, its `:host`, the strip, the axis and the events, are in sensor-history.element.css.
  static override styles = [common, inner, tiles, unsafeCSS(forShadow(sheetOwn))];

  private readonly storeController = new StoreController(this, {ids: () => (this.sensorId ? [this.sensorId] : [])});

  /** The instant this opening reads the window from: fixed, so a range chosen again is the cache's hit and the axis does not move under the reader. */
  private now = 0;
  private sensor: SensorInputs | undefined;
  private loaded: Loaded | undefined;
  private failed = false;
  /** What the last request was for: `sensor/range/generation`, answered, failed or in flight. */
  private asked: string | undefined;

  constructor() {
    super();
    this.sensorId = undefined;
    this.cache = undefined;
    this.range = 'day';
    // `compact` and `glass` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // another sensor is a new opening
    if (changed.has('sensorId')) {
      this.now = Date.now();
      this.range = 'day';
      this.loaded = undefined;
      this.failed = false;
      this.asked = undefined;
    }
    const {store} = this.storeController;
    const {hass} = store;
    this.sensor =
      this.sensorId && hass
        ? doorMotionSensors(
            hass.states,
            {entities: hass.entities, devices: hass.devices, areas: hass.areas},
            store.names,
          ).find(sensor => sensor.id === this.sensorId)
        : undefined;
  }

  protected override render() {
    const {sensor} = this;
    if (!sensor) return nothing;
    const {t, fmt} = this.storeController.store;
    const door = sensor.kind === 'door';
    const texts = sheetTexts(sensor.kind, sensor.name, t(RANGES[this.range].labelKey), t);
    const tabs: RangeTab[] = (['day', 'week'] as const).map(range => ({range, label: t(RANGES[range].tabKey)}));
    const {loaded} = this;
    // a range chosen while the last one is drawn keeps it until the new points arrive, as the legacy sheet did
    const segs = loaded ? segments(loaded.points, this.start(loaded.range), this.now) : [];
    const stats = loaded ? statTiles(periodStats(segs, this.now), sensor.kind, this.now, fmt, t) : [];
    return html`<hp-sheet
        .open=${true}
        .icon=${door ? 'door' : 'walk'}
        .color=${TONE[sensor.kind]}
        .heading=${texts.title}
        .closeLabel=${t('security.close')}
        @sheet-close=${this.dismiss}
      >
        <div slot="sub">${texts.kind}</div>
        <hp-range-tabs slot="tabs" .ranges=${tabs} .value=${this.range} @range-change=${this.onRange}></hp-range-tabs>
        <div class="inner">
          <h3>${texts.heading}</h3>
          ${this.renderBody(texts, sensor, loaded, segs)}
        </div>
        <div class="inner over">
          <h3>${texts.overPeriod}</h3>
          <div class="tiles">
            ${repeat(
              stats,
              stat => stat.label,
              stat =>
                html`<div class="tile">
                  <div class="k">${stat.label}</div>
                  <div class="v num">${stat.value}</div>
                </div>`,
            )}
          </div>
        </div>
      </hp-sheet>
      ${lensLike(this.getRootNode())}`;
  }

  // the strip, its axis and the events, or the line that says why there are none
  private renderBody(
    texts: ReturnType<typeof sheetTexts>,
    sensor: SensorInputs,
    loaded: Loaded | undefined,
    segs: ReturnType<typeof segments>,
  ) {
    if (this.failed) return html`<p>${texts.unavailable}</p>`;
    if (!loaded) return html`<p class="loading">${texts.loading}</p>`;
    const {t, fmt} = this.storeController.store;
    const t0 = this.start(loaded.range);
    const rows = eventRows(segs, sensor.kind, loaded.range, fmt, t);
    return html`<div class="sstrip" style=${`--acc:${TONE[sensor.kind]}`} role="img" aria-label=${texts.strip}>
        ${stripBars(segs, t0, this.now).map(bar => html`<i style=${`left:${bar.left}%;width:${bar.width}%`}></i>`)}
      </div>
      <div class="saxis">${axisLabels(loaded.range, t0, this.now, fmt).map(label => html`<span>${label}</span>`)}</div>
      ${
        rows.length
          ? html`<ul class="sevents">
              ${repeat(
                rows,
                row => row.key,
                row => html`<li><b>${row.when}</b><span>${row.text}</span></li>`,
              )}
            </ul>`
          : html`<p class="hint">${texts.empty}</p>`
      }`;
  }

  // the window's start for a range, from this opening's instant
  private start(range: SheetRange): number {
    return this.now - RANGES[range].days * 864e5;
  }

  private readonly onRange = (event: CustomEvent<RangeChangeDetail>): void => {
    const range = event.detail.range;
    if (range !== 'day' && range !== 'week') return;
    this.range = range;
    // a range that failed is asked again when it is chosen again, as the legacy sheet asked at every tab
    this.failed = false;
    this.asked = undefined;
  };

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the element only says so
  private readonly dismiss = (event: Event): void => {
    event.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(HISTORY_SHEET));
  };

  protected override updated(): void {
    this.loadIfDue();
  }

  // The history is asked for when the sheet first shows and for each range chosen; a range seen before is the cache's hit, since the
  // window's start is this opening's and does not move.
  private loadIfDue(): void {
    const {cache, sensorId, range, sensor} = this;
    if (!cache || !sensorId || !sensor) return;
    const key = `${sensorId}/${range}/${this.storeController.store.generation}`;
    if (this.asked === key) return;
    this.asked = key;
    void this.load(cache, sensorId, range);
  }

  private async load(cache: StatisticsCache, id: string, r: SheetRange): Promise<void> {
    try {
      const rows = await cache.history([id], new Date(this.start(r)), {minimal: true, attributes: false});
      // the sheet left, or another range or sensor was asked for meanwhile
      if (!this.isConnected || this.range !== r || this.sensorId !== id) return;
      this.loaded = {range: r, points: rows[id] ?? []};
      this.failed = false;
    } catch (error) {
      // the config changed under the request: it is asked again under the new one
      if (error instanceof StaleReply) {
        if (this.range === r && this.sensorId === id) {
          this.asked = undefined;
          this.requestUpdate();
        }
        return;
      }
      if (!this.isConnected || this.range !== r || this.sensorId !== id) return;
      console.error('home-panel sensor history', error);
      this.failed = true;
    }
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-sensor-history': SensorHistory;
  }
}

if (!customElements.get('hp-sensor-history')) customElements.define('hp-sensor-history', SensorHistory);
