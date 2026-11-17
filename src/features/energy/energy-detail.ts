// <hp-energy-detail>: the Energy detail: the main stacked chart by range, the Sankey of a period, the donut with its table and the six totals.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down, the charts through <hp-chart> (ADR 0022, 0027)
// from the pure options of charts.ts and the Sankey through <hp-sankey>; a controlled component (the range and the period are the pane's, told
// upward as `range-chosen` and `mode-chosen`); a switch of range redraws from the history the pane loaded, so it asks nothing.
// Must not: read an entity or the clock for a figure (the model did), call the API client, open a sheet itself, or build options for what did not change.
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {
  donutOptions,
  mainChartOptions,
  mainRows,
  mainShape,
  type ChartDeps,
  type EnergyRange,
  type EnergyTokens,
} from './charts.ts';
import detailOwn from './energy-detail.element.css?inline';
import type {EnergyHistoryData} from './history.ts';
import type {DonutRow, EnergyDetailView, LegendItem, SankeyMode} from './model.ts';
import './power-flow.ts'; // defines <hp-power-flow>
import './sankey.ts'; // defines <hp-sankey>
import {tileList} from './tile-list.ts';
import '../../ui/chart.ts'; // defines <hp-chart>
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/range-tabs.ts'; // defines <hp-range-tabs>
import type {RangeChangeDetail} from '../../ui/range-tabs.ts';
import {chart, common, inner, range as rangeStyles, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** What a tap on the Sankey's tabs says: the period now chosen. */
export interface ModeChosenDetail {
  mode: SankeyMode;
}

/** The charts' options, made for one history, range, theme, language and shape, so an update for anything else draws nothing again. */
interface Built {
  history: EnergyHistoryData;
  range: EnergyRange;
  base: string;
  main: ChartOptions;
  donut: ChartOptions;
}

/** The detail's badge, the legacy sheet's own art (a filled bolt), where the rail and the phone's header draw the outlined `bolt` icon. */
export const detailIcon = svg`<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
</svg>`;

export class EnergyDetail extends LitElement {
  static override properties = {
    view: {attribute: false},
    history: {attribute: false},
    range: {},
    mode: {},
  };
  /** The pane's view model of the detail: the words, the Sankey's geometry, the donut's table and the totals. */
  declare view: EnergyDetailView | undefined;
  /** The history the pane loaded; null before it arrives. The charts are drawn from it. */
  declare history: EnergyHistoryData | null;
  /** The range and the Sankey's period chosen: the pane keeps them for the panel's life and passes them in, as the legacy sheet kept its own. */
  declare range: EnergyRange;
  declare mode: SankeyMode;

  // The kit's wells, tiles, tabs and legend, and the element's own rules last (energy-detail.element.css).
  static override styles = [common, inner, tiles, rangeStyles, chart, unsafeCSS(forShadow(detailOwn))];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private built: Built | undefined;

  constructor() {
    super();
    this.view = undefined;
    this.history = null;
    this.range = 'today';
    this.mode = 'now';
  }

  // The options are rebuilt only when what they are made of changed: new history, another range, the theme, the language or the shape. A power
  // reading, which changes the model every second, leaves the charts' `options` the objects they were, so <hp-chart> is not asked to draw the same bars again.
  protected override willUpdate(): void {
    const {view, history, range} = this;
    if (!view || !history) return;
    const {store} = this.storeController;
    const compact = this.appearance.value?.compact === true;
    const base = `${this.appearance.value?.theme ?? 'light'}/${store.language}/${compact}`;
    if (this.built?.history === history && this.built.range === range && this.built.base === base) return;
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const tokens: EnergyTokens = {
      heat: token('--c-heat'),
      wh: token('--c-wh'),
      ev: token('--c-ev'),
      rest: token('--c-rest'),
      card: token('--card'),
      fg: token('--fg'),
      fg2: token('--fg2'),
      numberFont: token('--f-num'),
    };
    const deps: ChartDeps = {fmt: store.fmt, t: store.t, tokens, compact};
    const rows = mainRows(range, history, {fmt: store.fmt, now: Date.now()});
    this.built = {
      history,
      range,
      base,
      main: mainChartOptions(
        rows,
        view.main.legend.map(({name}) => name),
        deps,
      ),
      donut: donutOptions(
        view.donut.parts.map(({name, key, kwh}) => ({name, kwh, color: tokens[key]})),
        deps,
      ),
    };
  }

  protected override render() {
    const {view} = this;
    if (!view) return nothing;
    const compact = this.appearance.value?.compact === true;
    // `willUpdate` has made the options of this history; before it arrives there are none
    const built = this.history ? this.built : undefined;
    return html`<div
        class="blocks"
        role=${ifDefined(compact ? undefined : 'dialog')}
        aria-label=${ifDefined(compact ? undefined : view.title)}
      >
        ${compact ? nothing : this.renderHeader(view)}
        ${view.error === null ? nothing : html`<p class="histnote">${view.error}</p>`} ${this.renderMain(view, built)}
        ${this.renderSankey(view)}
        <div class="two">
          ${this.renderDonut(view, built)}
          <div class="inner">
            <h3>${view.totals.title}</h3>
            <p>${view.totals.hint}</p>
            <div class="totals">${tileList(view.totals.tiles)}</div>
          </div>
        </div>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // On a tablet the detail opens with its own header, the pane's being the phone's; on a phone the pane or the sheet draws it, tabs included.
  private renderHeader({title, sub, ranges}: EnergyDetailView) {
    return html`<hp-pane-header .icon=${'bolt'} .color=${'var(--c-grid)'} .heading=${title}>
      <span slot="icon">${detailIcon}</span>
      <div slot="sub">${sub}</div>
      <hp-range-tabs
        slot="actions"
        .ranges=${ranges}
        .value=${this.range}
        @range-change=${this.onRange}
      ></hp-range-tabs>
    </hp-pane-header>`;
  }

  private renderLegend(items: readonly LegendItem[]) {
    return html`<div class="legend">
      ${repeat(
        items,
        ({key}) => key,
        ({key, name}) => html`<span><b style=${`background:var(--c-${key})`}></b>${name}</span>`,
      )}
    </div>`;
  }

  private renderMain({main}: EnergyDetailView, built: Built | undefined) {
    return html`<div class="inner">
      <h3>${main.title}</h3>
      <p>${main.caption}</p>
      ${this.renderLegend(main.legend)}
      ${
        built
          ? html`<hp-chart
              .height=${320}
              .shape=${mainShape(built.range)}
              .label=${`${main.title}. ${main.caption}`}
              .options=${built.main}
            ></hp-chart>`
          : nothing
      }
    </div>`;
  }

  private renderSankey({sankey}: EnergyDetailView) {
    const {body} = sankey;
    return html`<div class="inner sankeyblock">
      <div class="sankeyhead">
        <div>
          <h3>${sankey.title}</h3>
          <p>${sankey.note}</p>
        </div>
        <div class="tabs" role="tablist" aria-label=${sankey.label}>
          ${repeat(
            sankey.modes,
            ({mode}) => mode,
            ({mode, label}) =>
              html`<button
                class="tab"
                type="button"
                role="tab"
                aria-selected=${mode === this.mode ? 'true' : 'false'}
                @click=${() => this.onMode(mode)}
              >
                ${label}
              </button>`,
          )}
        </div>
      </div>
      <div class="sankey">
        ${
          body.kind === 'flow'
            ? html`<hp-power-flow .geometry=${body.flow}></hp-power-flow>`
            : body.kind === 'ribbons'
              ? html`<hp-sankey .geometry=${body.geometry}></hp-sankey>`
              : html`<p class="loading">${body.text}</p>`
        }
      </div>
    </div>`;
  }

  private renderDonut({donut}: EnergyDetailView, built: Built | undefined) {
    return html`<div class="inner">
      <h3>${donut.title}</h3>
      <p>${donut.hint}</p>
      <div class="donut">
        <div class="donutchart">
          ${
            built
              ? html`<hp-chart
                  .height=${190}
                  .label=${`${donut.title}. ${donut.hint}`}
                  .options=${built.donut}
                ></hp-chart>`
              : nothing
          }
        </div>
        <table>
          ${repeat(donut.rows, ({key}) => key, this.donutRow)}
        </table>
      </div>
    </div>`;
  }

  private readonly donutRow = ({key, name, kwh, share}: DonutRow) =>
    html`<tr>
      <td><b class="swatch" style=${`background:var(--c-${key})`}></b>${name}</td>
      <td class="r">${kwh}</td>
      <td class="r muted">${share}</td>
    </tr>`;

  // arrow fields, so the template hands the same function at every render

  // the header's tabs (a tablet) tell here; the pane keeps the choice and hands it back
  private readonly onRange = (event: CustomEvent<RangeChangeDetail<string>>): void => {
    this.dispatchEvent(new CustomEvent<RangeChangeDetail<string>>('range-chosen', {detail: event.detail}));
  };

  private onMode(mode: SankeyMode): void {
    if (mode !== this.mode) this.dispatchEvent(new CustomEvent<ModeChosenDetail>('mode-chosen', {detail: {mode}}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-energy-detail': EnergyDetail;
  }
}

if (!customElements.get('hp-energy-detail')) customElements.define('hp-energy-detail', EnergyDetail);
