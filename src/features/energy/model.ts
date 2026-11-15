// energyModel: the live power, Hilo, the water heater and the loaded history in, every text, figure and shape the Energy card, the two cards and the phone's tiles place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through
// `deps.t` and every number through `deps.fmt`, and delegates the two drawings to the pure geometry of flow-layout.ts and water-chart.ts. Each rule is the legacy
// panel's own (`renderEnergy`, `energySummary`, `renderWater`, `renderHilo`, `renderEnergyTiles`), deleted in #241; the detail's blocks come with #240.
// Must not: import the DOM, Lit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import {DASH} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {fixedOr, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {HiloTier} from '../../providers/hilo.ts';
import {sum} from '../../providers/power-history.ts';
import {flowLayout, LIVE_KW, type FlowGeometry} from './flow-layout.ts';
import {waterCycles, type EnergyHistoryData} from './history.ts';
import type {EnergyInputs} from './inputs.ts';
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

/** The unit symbols the tiles write small after a figure; words ("kW · HOME") are catalog keys. */
const UNIT = {kwh: 'kWh', degrees: '°', celsius: '°C', cents: '¢', centsPerKwh: '¢/kWh', dollars: '$'} as const;

export interface EnergyModelDeps {
  /** The instant the model is read at, in milliseconds: the water heater's 24 hours end here. */
  now: number;
  t: Translate;
  fmt: Formatters;
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

export function energyModel(
  inputs: EnergyInputs,
  history: EnergyHistoryData | null,
  {now, t, fmt, error = null}: EnergyModelDeps,
): EnergyViewModel {
  const {power, hilo, water} = inputs;
  const tier = TIER_WORDS[hilo.tier];
  const challenge = challengeText(inputs.challenge, t);
  const heating = (water.power ?? 0) > LIVE_KW;
  const cents = (rate: number | null): string => fixedOr(fmt, rate === null ? null : rate * 100, 2);
  const tank = fixedOr(fmt, water.temperature, 1);
  const heatingText = t('energy.water.heating', {kw: fmt.fixed(water.power ?? 0, 1)});
  const last30 = (index: number): string => (history ? whole(fmt, history.g30[index]) : DASH);

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
    summary: t('energy.summary', {
      grid: fixedOr(fmt, power.grid, 2),
      heat: fmt.fixed(power.heat, 2),
      rate: t(tier.short),
    }),
    card: {
      title: t('energy.card.title'),
      open: t('energy.open'),
      topRight: t('energy.gridOnly', {rate: t(tier.short)}),
      flow: flowLayout(power, {
        t,
        fmt,
        waterTemperature: water.temperature,
        chargerStatus: inputs.wallbox.status,
      }),
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
  };
}
