// energyModel: the live power, Hilo, the water heater and the loaded history in, every text, figure and shape the Energy card, the two cards and the phone's tiles place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through
// `deps.t` and every number through `deps.fmt`, and delegates the two drawings to the pure geometry of flow-layout.ts and water-chart.ts. Each rule is the legacy
// panel's own (`renderEnergy`, `renderWater`, `renderHilo`, `renderEnergyTiles` and, in #240, `energySheet` and `sankeyData`, deleted; `energySummary`, in #241); the detail's blocks, the donut and the totals included.
// Must not: import the DOM, Lit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {fixedOr, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {HiloTier} from '../../providers/hilo.ts';
import {sum} from '../../providers/power-history.ts';
import type {Names} from '../../core/i18n/names.ts';
import {roomName} from '../../core/i18n/room-name.ts';
import type {RangeTab} from '../../ui/range-tabs.ts';
import {RANGES} from '../../ui/ranges.ts';
import {ENERGY_RANGES, mainRows, middleOf, type EnergyRange} from './charts.ts';
import {flowLayout, LIVE_KW, type FlowGeometry} from './flow-layout.ts';
import {GROUPS, waterCycles, type DailyRow, type EnergyHistoryData, type MonthSplit} from './history.ts';
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

/** The range tabs' words: the kit's for the three ranges it has, Energy's own `Today` (the key the card's tile already uses). */
const RANGE_WORDS: Record<EnergyRange, MessageKey> = {
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

/** The three periods of the Sankey, in the order of its tabs: the live flow, today's energy, the last 30 days. */
export const SANKEY_MODES = ['now', 'today', 'd30'] as const;
export type SankeyMode = (typeof SANKEY_MODES)[number];

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
  /** The range the detail's main chart shows (today when absent) and the period of its Sankey (now when absent): the pane keeps both for the panel's life. */
  range?: EnergyRange;
  sankeyMode?: SankeyMode;
  /** Why the history did not load (`EnergyHistory.error`); null or absent when it did. */
  error?: string | null;
}

/** A figure and the unit written small after it. */
export interface Reading {
  value: string;
  unit: string;
}

/** A tile of the card or the Hilo card: a reading with its label and a line under it (empty when there is none). */
export interface EnergyTile extends Reading {
  label: string;
  sub: string;
}

/** A tile of the phone's Energy tab, which opens its card in a sheet. */
export interface PhoneTile extends EnergyTile {
  key: 'water' | 'hilo';
  /** The water heater is heating. */
  on: boolean;
}

/** A use, by its key (which names its colour token) and its word. */
export interface LegendItem {
  key: GroupKey;
  name: string;
}

/** What the Sankey block draws: the live flow (the card's own geometry), the ribbons of a period, or the line it says when there is nothing to draw. */
export type SankeyBody =
  {kind: 'flow'; flow: FlowGeometry} | {kind: 'ribbons'; geometry: SankeyGeometry} | {kind: 'empty'; text: string};

/** A row of the donut's table: a use, its energy and share of the 30 days, already written. */
export interface DonutRow extends LegendItem {
  kwh: string;
  share: string;
}

export interface EnergyDetailView {
  title: string;
  /** The same sentence as the pane's. */
  sub: string;
  /** The range tabs, today to year. */
  ranges: RangeTab<EnergyRange>[];
  main: {title: string; caption: string; legend: LegendItem[]};
  sankey: {
    title: string;
    /** The tabs' accessible name. */
    label: string;
    modes: {mode: SankeyMode; label: string}[];
    note: string;
    body: SankeyBody;
  };
  donut: {title: string; hint: string; parts: (LegendItem & {kwh: number})[]; rows: DonutRow[]};
  totals: {title: string; hint: string; tiles: EnergyTile[]};
}

export interface EnergyViewModel {
  /** The pane's sub-line: "Grid supplying 2.30 kW · room heating 1.10 kW · Hilo low rate". */
  summary: string;
  card: {
    title: string;
    /** The screen reader's description of the card as a button. */
    open: string;
    /** "Grid only · low rate". */
    topRight: string;
    flow: FlowGeometry;
    /** Today, room heating, water heating, EV charging; the last three over 30 days. */
    tiles: EnergyTile[];
    /** "History didn't load: …"; null when it did. */
    error: string | null;
  };
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

type DetailDeps = Required<Pick<EnergyModelDeps, 'now' | 't' | 'fmt' | 'names' | 'language' | 'range' | 'sankeyMode'>>;

const legendOf = (t: Translate): LegendItem[] => GROUPS.map(key => ({key, name: t(GROUP_WORDS[key])}));

/** The main chart's title and caption for a range: the busiest hour of the hours it draws, the 30 days' split, or the month the heating peaked in. */
function mainBlock(history: EnergyHistoryData | null, {now, t, fmt, range}: DetailDeps): EnergyDetailView['main'] {
  const legend = legendOf(t);
  if (!history) return {title: t('energy.detail.loading'), caption: '', legend};
  const main = mainRows(range, history, {fmt, now});
  if (main.range === 'month') {
    const [heat, water, ev, rest] = history.g30.map(kwh => whole(fmt, kwh));
    const total = whole(fmt, sum(history.g30));
    return {
      title: t('energy.detail.month'),
      caption: t('energy.detail.monthSum', {total, heat, water, ev, rest}),
      legend,
    };
  }
  if (main.range === 'year') {
    const top = main.rows.reduce<[string, MonthSplit] | undefined>(
      (best, row) => (!best || row[1].heat > best[1].heat ? row : best),
      undefined,
    );
    return {
      title: t('energy.detail.year'),
      caption:
        top && top[1].heat > HEATING_PEAK_KWH
          ? t('energy.detail.yearPeak', {month: fmt.month(middleOf(top[0]), 'long'), kwh: fmt.integer(top[1].heat)})
          : t('energy.detail.yearCaption'),
      legend,
    };
  }
  const {rows} = main;
  const title = t(main.range === 'today' ? 'energy.detail.today' : 'energy.detail.week');
  if (!rows.length) return {title, caption: t('energy.detail.noHour'), legend};
  const busiest = rows.reduce((best, row) => (row[5] > best[5] ? row : best), rows[0]);
  const day = main.range === 'week' ? `${fmt.weekday(busiest[0], 'short')} ` : '';
  const when = `${day}${fmt.time(busiest[0])}`;
  return {title, caption: t('energy.detail.busiest', {kwh: fmt.fixed(busiest[5], 1), when}), legend};
}

/** What a period of the Sankey draws: the grid's total, the four uses in the order of `GROUPS`, the rooms' shares, the figure's format and the note. */
interface SankeyPeriod {
  total: number;
  uses: readonly number[];
  rooms: readonly number[];
  format: (kwh: number) => string;
  note: string;
}

/** Today's day and the 30 days' totals from the history; null when it is not loaded, or its last day is not today (nothing has been read since midnight). */
function sankeyPeriod(
  mode: Exclude<SankeyMode, 'now'>,
  history: EnergyHistoryData | null,
  {now, t, fmt}: DetailDeps,
): SankeyPeriod | null {
  if (!history) return null;
  if (mode === 'today') {
    const day: DailyRow | undefined = history.daily.at(-1);
    if (!day || day.day !== fmt.isoDay(now)) return null;
    return {
      total: day.total,
      uses: [day.heat, day.wh, day.ev, day.rest],
      rooms: day.rooms,
      format: kwh => `${fmt.fixed(kwh, 1)} kWh`,
      note: t('energy.sankey.noteToday', {kwh: fmt.fixed(day.total, 1)}),
    };
  }
  const total = sum(history.g30);
  return {
    total,
    uses: history.g30,
    rooms: history.room30,
    format: kwh => `${whole(fmt, kwh)} kWh`,
    note: t('energy.sankey.note30', {kwh: whole(fmt, total)}),
  };
}

function sankeyBlock(
  inputs: EnergyInputs,
  history: EnergyHistoryData | null,
  flow: FlowGeometry,
  deps: DetailDeps,
): EnergyDetailView['sankey'] {
  const {t, names, language, sankeyMode} = deps;
  const {power} = inputs;
  const empty = (): SankeyBody => ({kind: 'empty', text: t('energy.sankey.empty')});
  const modes = SANKEY_MODES.map(mode => ({
    mode,
    label: t(mode === 'now' ? 'energy.sankey.now' : mode === 'today' ? 'energy.today' : 'energy.days30'),
  }));
  const block = (note: string, body: SankeyBody) => ({
    title: t('energy.sankey.title'),
    label: t('energy.sankey.period'),
    modes,
    note,
    body,
  });
  if (sankeyMode === 'now') {
    // the live flow is the card's own geometry; with no reading from the grid there is nothing to show
    return (power.grid ?? 0) > 0
      ? block(t('energy.sankey.noteNow'), {kind: 'flow', flow})
      : block(t('energy.sankey.noData'), empty());
  }
  const period = sankeyPeriod(sankeyMode, history, deps);
  if (!period || period.total <= 0) return block(t('energy.sankey.noData'), empty());
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

/** The 30 days' split by use, as the donut's slices and its table's rows; none before the history. */
function donutBlock(history: EnergyHistoryData | null, {t, fmt}: DetailDeps): EnergyDetailView['donut'] {
  const parts = history ? legendOf(t).map((use, index) => ({...use, kwh: history.g30[index]})) : [];
  const total = sum(parts.map(part => part.kwh));
  return {
    title: t('energy.donut.title'),
    hint: t('energy.donut.hint'),
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
  if (!history) return {title, hint, tiles: []};
  const {totals, g30} = history;
  const chargingDays = history.daily.slice(-30).filter(row => row.ev > EV_DAY_KWH).length;
  return {
    title,
    hint,
    tiles: [
      {
        label: t('energy.totals.today'),
        value: fmt.fixed(totals.today, 1),
        unit: UNIT.kwh,
        sub: t('energy.totals.until', {time: fmt.time(now)}),
      },
      {label: t('energy.totals.yesterday'), value: fixedOr(fmt, totals.yesterday, 1), unit: UNIT.kwh, sub: ''},
      {
        label: t('energy.days30'),
        value: whole(fmt, totals.d30),
        unit: UNIT.kwh,
        sub: t('energy.totals.perDay', {kwh: fmt.fixed(totals.d30 / 30, 1)}),
      },
      {label: fmt.month(now, 'long'), value: whole(fmt, totals.month), unit: UNIT.kwh, sub: t('energy.totals.soFar')},
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
  {now, t, fmt, names, language, error = null, range = 'today', sankeyMode = 'now'}: EnergyModelDeps,
): EnergyViewModel {
  const {power, hilo, water} = inputs;
  const tier = TIER_WORDS[hilo.tier];
  const challenge = challengeText(inputs.challenge, t);
  const heating = (water.power ?? 0) > LIVE_KW;
  const cents = (rate: number | null): string => fixedOr(fmt, rate === null ? null : rate * 100, 2);
  const tank = fixedOr(fmt, water.temperature, 1);
  const heatingText = t('energy.water.heating', {kw: fmt.fixed(water.power ?? 0, 1)});
  const last30 = (index: number): string => (history ? whole(fmt, history.g30[index]) : DASH);

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
  const detail: DetailDeps = {now, t, fmt, names, language, range, sankeyMode};

  const phone: PhoneTile[] = [
    ...(water.present
      ? [
          {
            key: 'water' as const,
            label: t('energy.water.title'),
            sub: heating ? heatingText : t('energy.idle'),
            value: tank,
            unit: UNIT.degrees,
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
            value: cents(hilo.current),
            unit: UNIT.cents,
            on: false,
          },
        ]
      : []),
  ];

  return {
    summary,
    card: {
      title: t('energy.card.title'),
      open: t('energy.open'),
      topRight: t('energy.gridOnly', {rate: t(tier.short)}),
      flow,
      tiles: [
        {label: t('energy.today'), value: history ? fmt.fixed(history.totals.today, 1) : DASH, unit: UNIT.kwh, sub: ''},
        {label: t('energy.tile.heat'), value: last30(0), unit: UNIT.kwh, sub: t('energy.last30')},
        {label: t('energy.tile.water'), value: last30(1), unit: UNIT.kwh, sub: t('energy.last30')},
        {label: t('energy.tile.ev'), value: last30(2), unit: UNIT.kwh, sub: t('energy.last30')},
      ],
      error: error === null ? null : t('energy.historyFailed', {reason: error}),
    },
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
      ranges: ENERGY_RANGES.map(key => ({range: key, label: t(RANGE_WORDS[key])})),
      main: mainBlock(history, detail),
      sankey: sankeyBlock(inputs, history, flow, detail),
      donut: donutBlock(history, detail),
      totals: totalsBlock(history, {value: cents(hilo.current), tier: t(tier.name).toLowerCase()}, detail),
    },
  };
}
