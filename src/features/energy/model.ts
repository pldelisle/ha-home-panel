// energyModel: the live power, Hilo, the water heater and the loaded history in, every text, figure and shape the Energy detail, the two cards and the phone's tiles place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through
// `deps.t` and every number through `deps.fmt`, and delegates the two drawings to the pure geometry of flow-layout.ts and water-chart.ts. Each rule is the legacy
// panel's own (`renderEnergy`, `renderWater`, `renderHilo`, `renderEnergyTiles` and, in #240, `energySheet` and `sankeyData`, deleted; `energySummary`, deleted in #241); the detail's blocks, the donut and the totals included.
// Must not: import the DOM, Lit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import type {MessageKey} from '../../core/i18n/en.ts';
import {fixedOr, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {HiloTier} from '../../providers/hilo.ts';
import {sum} from '../../providers/power-history.ts';
import type {Names} from '../../core/i18n/names.ts';
import {roomName} from '../../core/i18n/room-name.ts';
import type {RangeTab} from '../../ui/range-tabs.ts';
import {emptyChartText} from '../../ui/chart-notice.ts';
import {RANGES} from '../../ui/ranges.ts';
import {ENERGY_RANGES, mainRows, middleOf, type EnergyRange, type MainRows} from './charts.ts';
import {flowLayout, LIVE_KW, type FlowGeometry} from './flow-layout.ts';
import {
  GROUPS,
  groupTotals,
  roomTotals,
  waterCycles,
  type DailyRow,
  type EnergyHistoryData,
  type MonthSplit,
} from './history.ts';
import type {EnergyInputs} from './inputs.ts';
import {sankeyLayout, type GroupKey, type SankeyGeometry} from './sankey-layout.ts';
import {waterChartGeometry, type WaterChartGeometry} from './water-chart.ts';

/** A tier's name and its short form, in running text ("Low tier", "low rate"), by tier. */
const TIER_WORDS: Record<HiloTier, {name: MessageKey; short: MessageKey}> = {
  low: {name: 'energy.tier.low', short: 'energy.rate.low'},
  medium: {name: 'energy.tier.medium', short: 'energy.rate.medium'},
  challenge: {name: 'energy.tier.challenge', short: 'energy.rate.challenge'},
  current: {name: 'energy.tier.current', short: 'energy.rate.current'},
  unknown: {name: 'energy.tier.unknown', short: 'energy.rate.unknown'},
};

/** The phases Hilo's challenge sensor reports that the catalog words; any other state is shown as the sensor says it. */
const PHASE_WORDS: ReadonlyMap<string, MessageKey> = new Map([
  ['appreciation', 'energy.phase.appreciation'],
  ['pre_heat', 'energy.phase.preHeat'],
  ['reduction', 'energy.phase.reduction'],
  ['recovery', 'energy.phase.recovery'],
]);

/** The legend of the water heater's chart: a swatch kind and its label, in order. */
const LEGEND: readonly {kind: 'line' | 'bars'; label: MessageKey}[] = [
  {kind: 'line', label: 'energy.water.temperature'},
  {kind: 'bars', label: 'energy.water.power'},
];

/** The range tabs' words: the kit's for the three ranges it has, Energy's own `Now` and `Today`. */
const RANGE_WORDS: Record<EnergyRange, MessageKey> = {
  now: 'energy.now',
  today: 'energy.today',
  week: RANGES.week.tabKey,
  month: RANGES.month.tabKey,
  year: RANGES.year.tabKey,
};

/** The four uses' words, by key: the legend, the donut's table and the Sankey's nodes say them. */
const GROUP_WORDS: Record<GroupKey, MessageKey> = {
  heat: 'energy.tile.heat',
  wh: 'energy.tile.water',
  ev: 'energy.tile.ev',
  rest: 'energy.flow.rest',
};

/** How many of the history's last days each range sums: the days the Sankey and the donut draw (the history reaches 400 days back). */
const PERIOD_DAYS: Record<EnergyRange, number> = {now: 1, today: 1, week: 7, month: 30, year: 365};

/**
 * What the cards that sum the history draw for the tab's one range: the Sankey's period (`live` for Now, else that many days) and the donut's
 * (Now draws today's, the one day). The hours chart needs none: `mainRows` draws today's hours for Now, as for Today.
 */
export interface Periods {
  sankey: 'live' | number;
  donut: number;
}

export const periodsOf = (range: EnergyRange): Periods => ({
  sankey: range === 'now' ? 'live' : PERIOD_DAYS[range],
  donut: PERIOD_DAYS[range],
});

/** A month's heating over this many kWh is worth naming as the peak, and a day's charging over this many is a charging day (the legacy `energyMain` and `energySheet`'s own). */
const HEATING_PEAK_KWH = 50;
const EV_DAY_KWH = 5;

/** The unit symbols the tiles write small after a figure; words ("kW · HOME") are catalog keys. */
const UNIT = {kwh: 'kWh', degrees: '°', celsius: '°C', cents: '¢', centsPerKwh: '¢/kWh', dollars: '$'} as const;

export interface EnergyModelDeps {
  /** The instant the model is read at, in milliseconds: the water heater's 24 hours end here. */
  now: number;
  t: Translate;
  fmt: Formatters;
  /** A room's name is the resolver's, in the profile's language (`store.names` and `store.language`). */
  names: Names;
  language: string;
  /** The tab's one range (now when absent), which every card of the detail follows: the pane keeps it for the panel's life. */
  range?: EnergyRange;
  /** Why the history did not load (`EnergyHistory.error`); null or absent when it did. */
  error?: string | null;
}

/** A figure and the unit written small after it. */
export interface Reading {
  value: string;
  unit: string;
}

/** A tile of the Hilo card or of the detail's totals: a reading with its label and a line under it (empty when there is none). */
export interface EnergyTile extends Reading {
  label: string;
  sub: string;
  /** The tab's range that holds the tile's period, which a tap sets (a total of the detail); absent for a tile that leads nowhere, which is no button. */
  range?: EnergyRange;
}

/** A tile of the phone's Energy tab, which opens its card in a sheet. */
export interface PhoneTile extends EnergyTile {
  key: 'water' | 'hilo';
  /** The sensor reads nothing: `value` is the word that says so (with no unit), which the tile draws in the line's style, never a dash as its big figure. */
  missing?: boolean;
  /** The water heater is heating. */
  on: boolean;
}

/** A use, by its key (which names its colour token) and its word. */
export interface LegendItem {
  key: GroupKey;
  name: string;
}

/** What the Sankey block draws: the live flow, the ribbons of a period, or the line it says when there is nothing to draw. */
export type SankeyBody =
  {kind: 'flow'; flow: FlowGeometry} | {kind: 'ribbons'; geometry: SankeyGeometry} | {kind: 'empty'; text: string};

/** A row of the donut's table: a use, its energy and share of the 30 days, already written. */
export interface DonutRow extends LegendItem {
  kwh: string;
  share: string;
}

/** What stands in a card's place when its range holds no history yet: the one sentence, in place of axes, a donut or tiles of 0 kWh; null when the card draws. */
export type Notice = string | null;

export interface EnergyDetailView {
  title: string;
  /** The same sentence as the pane's. */
  sub: string;
  /** "History didn't load: …"; null when it did. */
  error: string | null;
  /** The range tabs, now to year. */
  ranges: RangeTab<EnergyRange>[];
  main: {title: string; caption: string; legend: LegendItem[]; notice: Notice};
  sankey: {title: string; note: string; body: SankeyBody};
  donut: {title: string; hint: string; parts: (LegendItem & {kwh: number})[]; rows: DonutRow[]; notice: Notice};
  totals: {title: string; hint: string; tiles: EnergyTile[]; notice: Notice};
}

export interface EnergyViewModel {
  /** The pane's sub-line: "Grid supplying 2.30 kW · room heating 1.10 kW · Hilo low rate". */
  summary: string;
  water: {
    present: boolean;
    title: string;
    name: string;
    temperature: Reading;
    state: {heating: boolean; text: string};
    /** Null before the history loads, and when the day holds neither a line nor a bar. */
    chart: WaterChartGeometry | null;
    /** Empty before the history loads. */
    legend: {kind: 'line' | 'bars'; label: string}[];
    /** "Last 24 hours: 3.2 kWh over 2 heating cycles. 14-day average: 4.1 kWh a day."; null before the history loads. */
    line: string | null;
  };
  hilo: {
    present: boolean;
    title: string;
    challenge: string;
    rate: Reading;
    tier: {text: string; ok: boolean};
    /** Medium, Reward, Rewards. */
    tiles: EnergyTile[];
  };
  /** The phone's tiles, for the sections the house has: the water heater, then Hilo. */
  tiles: PhoneTile[];
  detail: EnergyDetailView;
}

/** What the challenge sensor says, in words: its phase when one is scheduled, else that none is (or that the sensor reads nothing). */
function challengeText(challenge: EnergyInputs['challenge'], t: Translate): string {
  if (!challenge) return t('energy.challenge.unknown');
  if (!challenge.active) return t('energy.challenge.none');
  const word = PHASE_WORDS.get(challenge.state);
  return t('energy.challenge.phase', {phase: word ? t(word) : challenge.state});
}

/** The water heater's last 24 hours and, when days are known, their average: two sentences, joined by a space. */
function waterLine(history: EnergyHistoryData, now: number, {t, fmt}: Pick<EnergyModelDeps, 't' | 'fmt'>): string {
  const {kwh24, cycles} = waterCycles(history.wh24.p, now);
  const days = history.wh14;
  const sentences = [t('energy.water.last24', {kwh: fmt.fixed(kwh24, 1), cycles})];
  if (days.length)
    sentences.push(
      t('energy.water.average', {
        days: days.length,
        kwh: fmt.fixed(sum(days.map(([, daily]) => daily)) / days.length, 1),
      }),
    );
  return sentences.join(' ');
}

type DetailDeps = Required<Pick<EnergyModelDeps, 'now' | 't' | 'fmt' | 'names' | 'language' | 'range'>>;

const legendOf = (t: Translate): LegendItem[] => GROUPS.map(key => ({key, name: t(GROUP_WORDS[key])}));

/** The main chart's title, by the shape of the rows it draws. */
const MAIN_TITLES: Record<MainRows['range'], MessageKey> = {
  today: 'energy.detail.today',
  week: 'energy.detail.week',
  month: 'energy.detail.month',
  year: 'energy.detail.year',
};

/** The main chart's title and caption for a range: the busiest hour of the hours it draws, the 30 days' split, or the month the heating peaked in. */
function mainBlock(history: EnergyHistoryData | null, {now, t, fmt, range}: DetailDeps): EnergyDetailView['main'] {
  const legend = legendOf(t);
  if (!history) return {title: t('energy.detail.loading'), caption: '', legend, notice: null};
  const main = mainRows(range, history, {fmt, now});
  const title = t(MAIN_TITLES[main.range]);
  // no row to draw: the title and the one sentence, no caption, no legend and no axes
  if (!main.rows.length) return {title, caption: '', legend: [], notice: emptyChartText(t)};
  if (main.range === 'month') {
    const [heat, water, ev, rest] = history.g30.map(kwh => whole(fmt, kwh));
    const total = whole(fmt, sum(history.g30));
    return {
      title,
      caption: t('energy.detail.monthSum', {total, heat, water, ev, rest}),
      legend,
      notice: null,
    };
  }
  if (main.range === 'year') {
    const top = main.rows.reduce<[string, MonthSplit] | undefined>(
      (best, row) => (!best || row[1].heat > best[1].heat ? row : best),
      undefined,
    );
    return {
      title,
      caption:
        top && top[1].heat > HEATING_PEAK_KWH
          ? t('energy.detail.yearPeak', {month: fmt.month(middleOf(top[0]), 'long'), kwh: fmt.integer(top[1].heat)})
          : t('energy.detail.yearCaption'),
      legend,
      notice: null,
    };
  }
  const {rows} = main;
  const busiest = rows.reduce((best, row) => (row[5] > best[5] ? row : best), rows[0]);
  const day = main.range === 'week' ? `${fmt.weekday(busiest[0], 'short')} ` : '';
  const when = `${day}${fmt.time(busiest[0])}`;
  return {title, caption: t('energy.detail.busiest', {kwh: fmt.fixed(busiest[5], 1), when}), legend, notice: null};
}

/** What a period of the Sankey draws: the grid's total, the four uses in the order of `GROUPS`, the rooms' shares, the figure's format and the note. */
interface SankeyPeriod {
  total: number;
  uses: readonly number[];
  rooms: readonly number[];
  format: (kwh: number) => string;
  note: string;
}

/** The rows of the history's last `days` days; for a single day, today's row, or none when nothing has been read since midnight. */
function daysOf(history: EnergyHistoryData, days: number, {now, fmt}: Pick<DetailDeps, 'now' | 'fmt'>): DailyRow[] {
  const last = history.daily.slice(-days);
  return days === 1 && last[0]?.day !== fmt.isoDay(now) ? [] : last;
}

/** The last `days` days' totals from the history; null when today is the period and has no row (the caller says "loading" before the history is in). */
function sankeyPeriod(days: number, history: EnergyHistoryData, rooms: number, deps: DetailDeps): SankeyPeriod | null {
  const {t, fmt} = deps;
  const rows = daysOf(history, days, deps);
  if (days === 1 && !rows.length) return null;
  const uses = groupTotals(rows, days);
  const total = sum(uses);
  const today = days === 1;
  return {
    total,
    uses,
    rooms: roomTotals(rows, rooms, days),
    format: kwh => (today ? `${fmt.fixed(kwh, 1)} kWh` : `${whole(fmt, kwh)} kWh`),
    note: today
      ? t('energy.sankey.noteToday', {kwh: fmt.fixed(total, 1)})
      : t('energy.sankey.noteDays', {days, kwh: whole(fmt, total)}),
  };
}

function sankeyBlock(
  inputs: EnergyInputs,
  history: EnergyHistoryData | null,
  flow: FlowGeometry,
  deps: DetailDeps,
): EnergyDetailView['sankey'] {
  const {t, names, language, range} = deps;
  const {power} = inputs;
  // an empty body says its one sentence and has no note: no reading from the grid (live), the history still loading, or no history yet
  const empty = (text: string) => block('', {kind: 'empty', text});
  const block = (note: string, body: SankeyBody) => ({title: t('energy.sankey.title'), note, body});
  const {sankey} = periodsOf(range);
  if (sankey === 'live') {
    // the live flow is the power flow's geometry; with no reading from the grid there is nothing to show
    return (power.grid ?? 0) > 0
      ? block(t('energy.sankey.noteNow'), {kind: 'flow', flow})
      : empty(t('energy.noReading'));
  }
  if (!history) return empty(t('energy.detail.loading'));
  const period = sankeyPeriod(sankey, history, power.rooms.length, deps);
  if (!period || period.total <= 0) return empty(emptyChartText(t));
  const words = legendOf(t);
  const geometry = sankeyLayout(
    {
      total: period.total,
      groups: words.map(({key, name}, index) => ({
        key,
        name,
        color: `var(--c-${key})`,
        value: period.uses[index],
      })),
    },
    power.rooms.map((room, index) => ({
      name: roomName(room, {names, t, language}),
      value: period.rooms[index] ?? 0,
    })),
    {t, format: period.format},
  );
  return block(period.note, {kind: 'ribbons', geometry});
}

/** The range's period's split by use (today's for Now), as the donut's slices and its table's rows; none before the history. */
function donutBlock(history: EnergyHistoryData | null, deps: DetailDeps): EnergyDetailView['donut'] {
  const {t, fmt, range} = deps;
  const {donut: days} = periodsOf(range);
  const uses = history ? groupTotals(daysOf(history, days, deps), days) : [];
  const parts = history ? legendOf(t).map((use, index) => ({...use, kwh: uses[index]})) : [];
  const total = sum(parts.map(part => part.kwh));
  // a loaded history whose period holds nothing draws no donut of 0 kWh: the title and the one sentence
  if (history && total <= 0)
    return {title: t('energy.donut.title'), hint: '', parts: [], rows: [], notice: emptyChartText(t)};
  return {
    title: t('energy.donut.title'),
    hint: t('energy.donut.hint', {days}),
    notice: null,
    parts,
    rows: parts.map(({key, name, kwh}) => ({
      key,
      name,
      kwh: `${fmt.fixed(kwh, 1)} kWh`,
      share: t('energy.donut.percent', {n: total ? Math.round((kwh / total) * 100) : 0}),
    })),
  };
}

/** The six totals the Hilo meter and the history give: today, yesterday, 30 days, this month, the car's 30 days and the rate now. */
function totalsBlock(
  history: EnergyHistoryData | null,
  rate: {value: string; tier: string},
  {now, t, fmt}: DetailDeps,
): EnergyDetailView['totals'] {
  const title = t('energy.totals.title');
  const hint = t('energy.totals.hint');
  if (!history) return {title, hint, tiles: [], notice: null};
  const {totals, g30} = history;
  // a meter that read nothing and no day: no tile of 0 kWh and dashes, the one sentence
  if (!history.daily.length && !totals.today && totals.yesterday === null && !totals.d30 && !totals.month)
    return {title, hint: '', tiles: [], notice: emptyChartText(t)};
  const chargingDays = history.daily.slice(-30).filter(row => row.ev > EV_DAY_KWH).length;
  return {
    title,
    hint,
    notice: null,
    tiles: [
      {
        label: t('energy.totals.today'),
        value: fmt.fixed(totals.today, 1),
        unit: UNIT.kwh,
        sub: t('energy.totals.until', {time: fmt.time(now)}),
        range: 'today',
      },
      {
        label: t('energy.totals.yesterday'),
        value: fixedOr(fmt, totals.yesterday, 1),
        unit: UNIT.kwh,
        sub: '',
        range: 'week',
      },
      {
        label: t('energy.days30'),
        value: whole(fmt, totals.d30),
        unit: UNIT.kwh,
        sub: t('energy.totals.perDay', {kwh: fmt.fixed(totals.d30 / 30, 1)}),
        range: 'month',
      },
      {
        label: fmt.month(now, 'long'),
        value: whole(fmt, totals.month),
        unit: UNIT.kwh,
        sub: t('energy.totals.soFar'),
        range: 'month',
      },
      {
        label: t('energy.totals.ev'),
        value: whole(fmt, g30[2]),
        unit: UNIT.kwh,
        sub: t('energy.totals.chargingDays', {n: chargingDays}),
      },
      {
        label: t('energy.totals.rate'),
        value: rate.value,
        unit: UNIT.cents,
        sub: t('energy.totals.rateTier', {tier: rate.tier}),
      },
    ],
  };
}

export function energyModel(
  inputs: EnergyInputs,
  history: EnergyHistoryData | null,
  {now, t, fmt, names, language, error = null, range = 'now'}: EnergyModelDeps,
): EnergyViewModel {
  const {power, hilo, water} = inputs;
  const tier = TIER_WORDS[hilo.tier];
  const challenge = challengeText(inputs.challenge, t);
  const heating = (water.power ?? 0) > LIVE_KW;
  const cents = (rate: number | null): string => fixedOr(fmt, rate === null ? null : rate * 100, 2);
  const tank = fixedOr(fmt, water.temperature, 1);
  const heatingText = t('energy.water.heating', {kw: fmt.fixed(water.power ?? 0, 1)});

  const flow = flowLayout(power, {
    t,
    fmt,
    waterTemperature: water.temperature,
    chargerStatus: inputs.wallbox.status,
  });
  const summary = t('energy.summary', {
    grid: fixedOr(fmt, power.grid, 2),
    heat: fmt.fixed(power.heat, 2),
    rate: t(tier.short),
  });
  const detail: DetailDeps = {now, t, fmt, names, language, range};

  // a tile's figure and unit, or the word for no reading flagged `missing`, so the tile never draws a dash as its big figure
  const figure = (value: string | null, unit: string): Pick<PhoneTile, 'value' | 'unit' | 'missing'> =>
    value === null ? {value: t('energy.noReading'), unit: '', missing: true} : {value, unit};
  const phone: PhoneTile[] = [
    ...(water.present
      ? [
          {
            key: 'water' as const,
            label: t('energy.water.title'),
            sub: heating ? heatingText : t('energy.idle'),
            ...figure(water.temperature === null ? null : tank, UNIT.degrees),
            on: heating,
          },
        ]
      : []),
    ...(inputs.hiloPresent
      ? [
          {
            key: 'hilo' as const,
            label: t('energy.hilo.title'),
            sub: t('energy.hiloTile', {tier: t(tier.name), challenge}),
            ...figure(hilo.current === null ? null : cents(hilo.current), UNIT.cents),
            on: false,
          },
        ]
      : []),
  ];

  return {
    summary,
    water: {
      present: water.present,
      title: t('energy.water.title'),
      name: water.name,
      temperature: {value: tank, unit: UNIT.celsius},
      state: {heating, text: heating ? heatingText : t('energy.water.idle')},
      chart: history ? waterChartGeometry(history.wh24, now, {t, fmt}) : null,
      legend: history ? LEGEND.map(({kind, label}) => ({kind, label: t(label)})) : [],
      line: history ? waterLine(history, now, {t, fmt}) : null,
    },
    hilo: {
      present: inputs.hiloPresent,
      title: t('energy.hilo.title'),
      challenge,
      rate: {value: cents(hilo.current), unit: UNIT.centsPerKwh},
      tier: {text: t(tier.name), ok: hilo.tier === 'low'},
      tiles: [
        {label: t('energy.hilo.medium'), value: cents(hilo.medium), unit: UNIT.cents, sub: ''},
        {label: t('energy.hilo.reward'), value: cents(hilo.reward), unit: UNIT.cents, sub: ''},
        {label: t('energy.hilo.rewards'), value: fixedOr(fmt, inputs.rewards, 0), unit: UNIT.dollars, sub: ''},
      ],
    },
    tiles: phone,
    detail: {
      title: t('energy.card.title'),
      sub: summary,
      error: error === null ? null : t('energy.historyFailed', {reason: error}),
      ranges: ENERGY_RANGES.map(key => ({range: key, label: t(RANGE_WORDS[key])})),
      main: mainBlock(history, detail),
      sankey: sankeyBlock(inputs, history, flow, detail),
      donut: donutBlock(history, detail),
      totals: totalsBlock(history, {value: cents(hilo.current), tier: t(tier.name).toLowerCase()}, detail),
    },
  };
}
