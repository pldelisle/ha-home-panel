// The pieces the Climate detail and the pane draw around a chart: its legend, and the place of the chart itself, which holds the notice before there is a line.
// Pattern: template helpers (Lit docs, Templates: composing templates) over the model's `LegendItem` and `ChartNotice`, so the room chart and the heatmap
// place `<hp-chart>` (ADR 0022) by one rule: the notice when the model has one, the chart once its options are made, nothing while they are not.
// Must not: word a string (the model does), build options (`ClimateCharts` does), or keep state: each is a pure function of what it is given.
import {html, nothing} from 'lit';
import type {ChartOptions} from '../../ui/chart-options.ts';
import type {ChartNotice, LegendItem} from './model.ts';

/** What stands in a chart's place before there is a line: the paragraph the legacy panel wrote there, the failure's plain and the others as the kit's waiting line. */
export const noticeLine = ({kind, text}: ChartNotice) =>
  html`<p class=${kind === 'failed' ? '' : 'loading'}>${text}</p>`;

/** A chart's legend: a swatch and a name, or a dashed stroke for a dashed line. */
export const legendItems = (items: readonly LegendItem[]) =>
  items.map(({name, color, dashed}) =>
    dashed
      ? html`<span><b class="dash" style=${`color:${color}`}></b>${name}</span>`
      : html`<span><b style=${`background:${color}`}></b>${name}</span>`,
  );

/** A chart's place: the block's notice while the range loads or when it failed, else `<hp-chart>` of the options once `ClimateCharts` made them, else nothing. */
export const chartPlace = (
  {notice}: {notice: ChartNotice | null},
  options: ChartOptions | null | undefined,
  height: number,
  label: string,
) =>
  notice
    ? noticeLine(notice)
    : options
      ? html`<hp-chart .height=${height} .label=${label} .options=${options}></hp-chart>`
      : nothing;
