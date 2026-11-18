// The Energy detail's two charts as plain data: the main stacked bars by range, the donut of the range's period, and the rows the bars are drawn from.
// Pattern: functional core (Bernhardt, Boundaries) behind <hp-chart> (ADR 0027): options are data, never ApexCharts instances, every number is written
// by `fmt`, and the colours are the tokens the element resolved. The options are those of the legacy `energyMain` and `energySheet` (deleted in #240), field for field.
// Must not: import Lit, the DOM or the library, read the clock or a token itself (the element hands them in), or write a word a person reads outside `t`.
import {noonOf, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {FlowRow} from '../../providers/power-history.ts';
import {sum} from '../../providers/power-history.ts';
import {hourRowsAxis, mergeOptions, tooltipDate, type TooltipDate, type ChartOptions} from '../../ui/chart-options.ts';
import {thinCategories} from '../../ui/thin-axis.ts';
import {GROUPS, type DailyRow, type EnergyHistoryData, type MonthSplit} from './history.ts';

/**
 * The tab's ranges, in the order of its tabs: Energy's own, since `now` and `today` are no ranges of the kit's `RANGES` (they ask the recorder for
 * nothing). `now` is the live flow, and the hours chart draws today's for it, as for `today`.
 */
export const ENERGY_RANGES = ['now', 'today', 'week', 'month', 'year'] as const;
export type EnergyRange = (typeof ENERGY_RANGES)[number];

/** The range a tab chose is one the detail draws (the tabs offer no other; the event carries any string). */
export const isEnergyRange = (range: string): range is EnergyRange => ENERGY_RANGES.some(one => one === range);

/** The kind of axis a range's bars stand on: a time axis for now, today and the week, categories for the month and the year. */
export type MainShape = 'time' | 'category';

/** The shape `<hp-chart>` is told (ADR 0029): a new chart only where the axis changes in kind, an update between two ranges of the same kind. */
export const mainShape = (range: EnergyRange): MainShape =>
  range === 'month' || range === 'year' ? 'category' : 'time';

/** The rows a range's bars are drawn from: hours for today and the week, days for the month, months for the year. */
export type MainRows =
  | {range: 'today'; rows: FlowRow[]}
  | {range: 'week'; rows: FlowRow[]}
  | {range: 'month'; rows: DailyRow[]}
  | {range: 'year'; rows: [string, MonthSplit][]};

/** What a chart reads of the page: the colour of each use and the card, the text and the figures' face, resolved from the kit's tokens. */
export interface EnergyTokens {
  heat: string;
  wh: string;
  ev: string;
  rest: string;
  card: string;
  fg: string;
  fg2: string;
  numberFont: string;
}

export interface ChartDeps {
  fmt: Formatters;
  t: Translate;
  tokens: EnergyTokens;
  /** A phone: thinner strokes and fewer labels on a category axis. */
  compact: boolean;
}

/** One slice of the donut: a use, its energy over the 30 days and its colour. */
export interface DonutPart {
  name: string;
  kwh: number;
  color: string;
}

/** The unit symbols the axes and tooltips write; the household's language does not change them. */
const KWH = 'kWh';
const MWH = 'MWh';
/** A flow row's column for each use: `[t, ev, wh, heat, rest, total]`. */
export const COLUMN = {heat: 3, wh: 2, ev: 1, rest: 4} as const;
/** The height of a flow row's bar: the four uses stacked (columns 1 to 4), which is the grid's total only while the devices fit the meter. */
export const stackOf = (row: FlowRow): number => row[COLUMN.ev] + row[COLUMN.wh] + row[COLUMN.heat] + row[COLUMN.rest];
/** The bars' rounded top, shared by the four ranges. */
const STACK = {borderRadius: 3, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last'} as const;
/** What a time axis' tooltip names: the clock for today, the day and the clock for the week. */
const TOOLTIP_DATE: Record<'today' | 'week', TooltipDate> = {
  today: {day: null, clock: 'time'},
  week: {day: 'date', clock: 'time'},
};
/** About how many labels a category axis writes on a phone, for the month's days and the year's months. */
const PHONE_LABELS = {month: 5, year: 4} as const;

/** The hours of today the main chart draws, as flow rows. */
export function hoursOfToday(
  history: Pick<EnergyHistoryData, 'flow'>,
  {fmt, now}: {fmt: Pick<Formatters, 'isoDay'>; now: number},
): FlowRow[] {
  const today = fmt.isoDay(now);
  return history.flow.filter(([start]) => fmt.isoDay(start) === today);
}

/** The rows a range draws: today's hours (for now too), the week's, the last 30 days or the last 12 months, from what the history derived. */
export function mainRows(
  range: EnergyRange,
  history: Pick<EnergyHistoryData, 'flow' | 'daily' | 'monthly'>,
  {fmt, now}: {fmt: Pick<Formatters, 'isoDay'>; now: number},
): MainRows {
  if (range === 'now' || range === 'today') return {range: 'today', rows: hoursOfToday(history, {fmt, now})};
  if (range === 'week') return {range, rows: history.flow};
  if (range === 'month') return {range, rows: history.daily.slice(-30)};
  return {range, rows: history.monthly};
}

/** A month key's middle, which no zone moves to another month. */
export const middleOf = (month: string): number => Date.parse(`${month}-15T12:00:00Z`);

const series = (
  names: readonly string[],
  colors: readonly string[],
  data: (key: (typeof GROUPS)[number]) => unknown[],
) => ({
  series: GROUPS.map((key, index) => ({name: names[index], data: data(key)})),
  colors,
});

/**
 * The options of the main chart, without the theme: stacked bars by use, on a time axis for today and the week (hours), on thinned categories for
 * the month (days) and the year (months, in MWh). `names` are the four uses' words, in the order of `GROUPS`.
 */
export function mainChartOptions(main: MainRows, names: readonly string[], deps: ChartDeps): ChartOptions {
  const {fmt, tokens, compact} = deps;
  const colors = GROUPS.map(key => tokens[key]);
  const kwh = (value: number, digits: number) => `${fmt.fixed(value, digits)} ${KWH}`;
  const bars = {chart: {type: 'bar', stacked: true}};
  const shared = {shared: true, intersect: false};
  if (main.range === 'today' || main.range === 'week') {
    const {range, rows} = main;
    return {
      ...bars,
      ...series(names, colors, key => rows.map(row => [row[0], row[COLUMN[key]]])),
      plotOptions: {bar: {...STACK, columnWidth: range === 'today' ? '70%' : '90%'}},
      stroke: {show: false},
      fill: {opacity: 1},
      // the ticks fall on whole hours, every two hours for a morning, every day for the week (`hourRowsAxis`)
      xaxis: {
        type: 'datetime',
        labels: {datetimeUTC: false},
        ...(rows.length ? hourRowsAxis(rows[0][0], rows[rows.length - 1][0], fmt) : undefined),
      },
      yaxis: {
        min: 0,
        tickAmount: 4,
        forceNiceScale: true,
        labels: {formatter: (value: number) => `${whole(fmt, value)} ${KWH}`},
      },
      tooltip: {
        ...shared,
        x: {formatter: tooltipDate(TOOLTIP_DATE[range], fmt)},
        y: {formatter: (value: number) => kwh(value, 2)},
      },
    };
  }
  const stroke = {show: true, colors: [tokens.card]};
  if (main.range === 'month') {
    const {rows} = main;
    const days = rows.map(row => fmt.date(noonOf(row.day, fmt)));
    return mergeOptions(
      {
        ...bars,
        ...series(names, colors, key => rows.map(row => +row[key].toFixed(1))),
        plotOptions: {bar: {...STACK, borderRadius: 4, columnWidth: '64%'}},
        stroke: {...stroke, width: compact ? 1 : 2},
        yaxis: {labels: {formatter: (value: number) => `${whole(fmt, value)} ${KWH}`}},
        tooltip: {...shared, y: {formatter: (value: number) => kwh(value, 1)}},
      },
      thinCategories(days, PHONE_LABELS.month, days.length, compact),
    );
  }
  const {rows} = main;
  const months = rows.map(([month]) => `${fmt.month(middleOf(month), 'short')} ${month.slice(2, 4)}`);
  return mergeOptions(
    {
      ...bars,
      ...series(names, colors, key => rows.map(([, split]) => +split[key].toFixed(1))),
      plotOptions: {bar: {...STACK, borderRadius: 6, columnWidth: '58%'}},
      stroke: {...stroke, width: 2},
      yaxis: {labels: {formatter: (value: number) => `${fmt.fixed(value / 1000, 1)} ${MWH}`}},
      tooltip: {...shared, y: {formatter: (value: number) => `${whole(fmt, value)} ${KWH}`}},
    },
    thinCategories(months, PHONE_LABELS.year, months.length, compact),
  );
}

/** The options of the donut, without the theme: a ring at 70 percent with the figure of each slice and the total of the period in its middle. */
export function donutOptions(parts: readonly DonutPart[], {fmt, t, tokens}: Omit<ChartDeps, 'compact'>): ChartOptions {
  const total = sum(parts.map(part => part.kwh));
  return {
    chart: {type: 'donut', height: 190},
    series: parts.map(part => +part.kwh.toFixed(1)),
    labels: parts.map(part => part.name),
    colors: parts.map(part => part.color),
    stroke: {width: 3, colors: [tokens.card]},
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            name: {show: true, fontSize: '12px', offsetY: 18},
            value: {
              show: true,
              fontSize: '22px',
              fontWeight: 600,
              fontFamily: tokens.numberFont,
              color: tokens.fg,
              offsetY: -14,
              formatter: (value: number) => whole(fmt, value),
            },
            total: {
              show: true,
              label: t('energy.donut.total'),
              fontSize: '11px',
              color: tokens.fg2,
              formatter: () => whole(fmt, total),
            },
          },
        },
      },
    },
    tooltip: {y: {formatter: (value: number) => `${fmt.fixed(value, 1)} ${KWH}`}},
  };
}
