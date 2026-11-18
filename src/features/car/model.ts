// carModel: the car, its charger and its history in, every text, figure and shape the Car card, the phone's line and the detail's read-only blocks place out.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, words every message through `deps.t` and every number through `deps.fmt`,
// and delegates the bars to bars-geometry.ts and the schedule's words to schedule.ts. Each rule was the legacy panel's (`renderCarCard`, `carSheet`, `renderSessions`, `renderCarSheetLive`, which #251 and #252 deleted, and `schedText`, deleted in #269).
// The pane's header and the card draw it since #251, the detail's blocks since #252; the controls' view is controls.ts (#253).
// Must not: import the DOM, Lit or the shell, read the clock (the sessions' "today" is the history's), hold text the household reads (a catalog key says it), or build the controls' view (controls.ts does).
import {capitalise, DASH, DAY_MS, HOUR_MS, joined} from '../../core/figures.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {money, noonOf, percent, power, temperatureFigure, whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {CarInputs, FordMessage, LastPlug} from '../../providers/fordpass.ts';
import {sum} from '../../providers/power-history.ts';
import {DEFAULT_KWH_PRICE, type Session, type WallboxInputs} from '../../providers/wallbox.ts';
import {barsGeometry, type BarsGeometry} from './bars-geometry.ts';
import {DAILY_DAYS, monthlySessions, type CarHistoryData, type MonthlySessions} from './history.ts';
import type {CarFeatureInputs} from './inputs.ts';
import type {RangeTab} from '../../ui/range-tabs.ts';
import {RANGES} from '../../ui/ranges.ts';

/** What the model words and formats with, and what the detail's table is showing. */
export interface CarModelDeps {
  t: Translate;
  fmt: Formatters;
  /** The sessions' table shows every session and not the latest ten: the detail's toggle, element state. */
  allSessions: boolean;
  /** The window the history sheet's sessions, tiles and months cover: the pane's state, which the sheet's Month / Year tabs set. */
  historyWindow: HistoryWindow;
  /** Why the history did not load (the loader's), or null. */
  historyError: string | null;
}

/** What the history sheet's sessions cover: the last 30 days or the year the history holds. */
export type HistoryWindow = 'month' | 'year';

/** The windows in the order their tabs show them; their words are the kit's range tabs' (`range.<window>.tab`). */
export const HISTORY_WINDOWS: readonly HistoryWindow[] = ['month', 'year'];

/** A tab's range that is one of the history sheet's windows. */
export const isHistoryWindow = (range: string): range is HistoryWindow => HISTORY_WINDOWS.some(one => one === range);

/**
 * What each window means, in one table rather than a check per use: how far back from the history's own instant it reaches (the kit's month,
 * `RANGES.month.days`; null for the whole year the history holds), the sentence when it holds no session, and whether the months' chart is drawn.
 */
const WINDOW_RULES: Record<HistoryWindow, {days: number | null; none: MessageKey; charted: boolean}> = {
  month: {days: RANGES.month.days, none: 'car.sessions.noneMonth', charted: false},
  year: {days: null, none: 'car.sessions.none', charted: true},
};

/** The table shows this many sessions, the latest, until "show all". */
const LATEST_SESSIONS = 10;
/** A day with more than this many kWh is a charging day in the card's line. */
const CHARGING_DAY_KWH = 5;
/** The widest the table's energy bar is, in pixels, beyond its four-pixel stub. */
const SESSION_BAR_PX = 70;
const SESSION_BAR_STUB_PX = 4;
/** The units under a figure: symbols, the same in every language. */
const UNIT = {
  kwh: 'kWh',
  km: 'km',
  percent: '%',
  hours: 'h',
  psi: 'psi',
  volts: 'V',
  amps: 'A',
  degrees: '°',
} as const;

/** One tile: a label, a figure and its unit, and the line under it; `word` is a figure that is a word ("Charging"), which the tile writes smaller. */
export interface CarTile {
  label: string;
  value: string;
  unit: string;
  sub: string;
  word: boolean;
}

/** The battery bar: how full it is, where the charge limit stands, what a screen reader hears, and the words under it. */
export interface SocBar {
  /** The charge, 0 to 100. */
  fill: number;
  /** The charge limit in percent; null when Ford sends none. */
  limit: number | null;
  label: string;
  /** `end` is empty on the card, which draws no 100%. */
  scale: {start: string; limit: string; end: string};
}

/** The card's daily bars: the geometry, a title for each bar and the sentence under them. */
export interface DailyBars {
  geometry: BarsGeometry;
  /** For a screen reader, over the whole drawing. */
  label: string;
  /** Each bar's "Nov 6: 3.2 kWh", in the bars' order. */
  titles: string[];
  line: string;
}

/** What the car's picture needs, which the card and the battery block both draw: Ford's photo, else the drawn car. */
export interface CarArtView {
  name: string;
  /** Ford's photo of the car, through Home Assistant's image proxy; null when it has none. */
  picture: string | null;
  /** The body colour the config gave the drawn car; null for the default. */
  color: string | null;
  /** What a screen reader says of the drawn car, which stands where the photo fails to load. */
  drawing: string;
}

export interface TireView {
  label: string;
  psi: string;
  unit: string;
  state: {text: string; ok: boolean} | null;
}

/** One fact under the summary's bar, with its tone: `ok` for the good news of the moment (charging), `warn` for what needs a look (a door open, unlocked), `plain` for the rest. */
export interface Fact {
  text: string;
  tone: 'ok' | 'warn' | 'plain';
}

/** The top of the tab: the charge and the range beside the car, the bar with the limit Ford sets, and the facts under it, said once (docs/apple-hig-audit-car-2026-11-17.md). */
export interface SummaryBlock extends CarArtView {
  charge: string;
  range: string;
  soc: SocBar;
  facts: Fact[];
}

export interface StatusBlock {
  title: string;
  /** The top view's label for a screen reader. */
  drawing: string;
  /** The body colour the config gave the car, the side view's too; null for the default. */
  color: string | null;
  tires: TireView[];
  /** The details the car reports, as value rows (HIG, Lists and tables: a grouped label and value list): odometer, full range, AC limit, cabin, 12 V battery, usable energy, battery temperature, software, automatic updates. */
  rows: CarTile[];
}

/** A line of the Ford block: one of Ford's messages. */
export interface FordRow {
  title: string;
  body: string;
}

export interface FordBlock {
  title: string;
  caption: string;
  rows: FordRow[];
}

export interface LastBlock {
  title: string;
  /** "Nov 6, 5:00 pm to Nov 6, 7:00 pm", or what Ford has not reported yet. */
  caption: string;
  /** Empty while Ford has reported no plug-in. */
  tiles: CarTile[];
}

/** One row of the sessions' table: the figures a column writes, and the width of the energy bar. */
export interface SessionRow {
  /** The session's start, which keys the row. */
  key: number;
  date: string;
  times: string;
  length: string;
  energy: string;
  /** The energy bar's width in pixels. */
  barPx: number;
  peak: string;
  cost: string;
}

export interface SessionsBlock {
  title: string;
  /** The sentence under the title; empty until the history loads. */
  summary: string;
  tiles: CarTile[];
  /** The kWh by month, which the chart draws (`sessionsChartOptions`); empty in the month window, as the chart is the year's. */
  months: MonthlySessions[];
  columns: {date: string; time: string; length: string; energy: string; peak: string; cost: string};
  rows: SessionRow[];
  /** The toggle between the latest ten and all of them; null when there are no more than ten. */
  toggle: string | null;
}

/** The history's row on the tab (it opens the sessions in a sheet) and the 30 days of bars the sheet draws. */
export interface HistoryBlock {
  title: string;
  /** The sheet's button that closes it. */
  done: string;
  /** The tabs that choose what the sheet's sessions cover. */
  windows: RangeTab<HistoryWindow>[];
  /** `3 sessions · 39 kWh`; `''` until the history loads. */
  line: string;
  /** The year's estimated cost; `''` until the history loads. */
  value: string;
  daily: DailyBars | null;
}

export interface CarDetail {
  title: string;
  /** "Parked at home · locked · the car last checked in at 4:05 pm". */
  sub: string;
  summary: SummaryBlock;
  status: StatusBlock;
  history: HistoryBlock;
  sessions: SessionsBlock;
  /** Ford's own messages; null when it sent none. */
  ford: FordBlock | null;
  last: LastBlock;
}

export interface CarViewModel {
  /** The phone's header and the line under it. */
  summary: {title: string; line: string};
  /** Null where the house has no FordPass car. */
  detail: CarDetail | null;
  /** What stands where a car's detail would: "No FordPass car found."; null when there is one. */
  none: string | null;
  /** "History didn't load: …", for the card's and the detail's line; null when it did, or has not been asked. */
  error: string | null;
}

/** What a tile may add to its label and figure: the unit after the figure, the line under it, and whether the figure is a word. */
interface TileExtras {
  unit?: string;
  sub?: string;
  word?: boolean;
}

/** A tile; `value` is a figure, and `word` says it is a word instead. */
const tile = (label: string, value: string, {unit = '', sub = '', word = false}: TileExtras = {}): CarTile => ({
  label,
  value,
  unit,
  sub,
  word,
});

/** The tiles a car has something for: a dash is a sensor it does not have, left out rather than shown. */
const present = (tiles: CarTile[]): CarTile[] => tiles.filter(({value}) => value !== DASH);

/** A figure the sensor gave, as written: whole or with a decimal where it has one. */
const reading = (fmt: Formatters, value: number | null): string => (value === null ? DASH : fmt.number(value));

/** The period that ends the sentence "since {date}": none after a date that ends with one ("6 nov."; French writes the month short), so the sentence has one point and not two. */
const stopAfter = (date: string): string => (date.endsWith('.') ? '' : '.');

/** Where the car is: at home, away, or the zone the tracker names; nothing while the tracker reads nothing. */
function whereOf(car: CarInputs, t: Translate): string {
  if (car.tracker === null) return '';
  if (car.tracker === 'home') return t('car.where.home');
  return car.tracker === 'not_home' ? t('car.where.away') : car.tracker;
}

const lockWord = (locked: boolean | null, t: Translate): string =>
  locked === null ? '' : t(locked ? 'car.state.locked' : 'car.state.unlocked');

const stateWord = (car: CarInputs, t: Translate): string =>
  t(car.charging ? 'car.state.charging' : car.plugged ? 'car.state.pluggedIn' : 'car.state.unplugged');

/** The battery bar and the words under it: the limit as Ford sets it ("Limit 90% · set in FordPass"; the panel cannot change it) and the full scale. */
function socBar(car: CarInputs, {t, fmt}: CarModelDeps): SocBar {
  const limit = car.limit || null;
  const charge = percent(fmt, car.soc);
  const named = limit === null ? '' : fmt.number(limit);
  return {
    fill: car.soc || 0,
    limit,
    label: limit === null ? t('car.socLabel', {n: charge}) : t('car.socLabelLimit', {n: charge, limit: named}),
    scale: {
      start: t('car.percent', {n: fmt.integer(0)}),
      limit: limit === null ? '' : t('car.limitFord', {n: named}),
      end: t('car.percent', {n: fmt.integer(100)}),
    },
  };
}

/** The last 30 days' charging as bars, a title for each, and the line that counts the charging days and the kWh. */
function dailyBars({daily}: CarHistoryData, {t, fmt}: CarModelDeps): DailyBars {
  const last = daily.slice(-DAILY_DAYS);
  const values = last.map(({ev}) => ev);
  const days = last.map(({day}) => fmt.date(noonOf(day, fmt)));
  const geometry = barsGeometry(values, days);
  return {
    geometry,
    label: t('car.card.barsLabel', {n: fmt.fixed(geometry.highest, 1)}),
    titles: values.map((value, index) => t('car.card.barTitle', {day: days[index], kwh: fmt.fixed(value, 1)})),
    line: t('car.card.daily', {
      days: DAILY_DAYS,
      charging: values.filter(value => value > CHARGING_DAY_KWH).length,
      kwh: whole(fmt, sum(values)),
    }),
  };
}

/** The phone's line: where, the charge and the range, and what the plug is doing; or the missing car. */
function summaryOf(car: CarInputs, {t, fmt}: CarModelDeps) {
  const range = car.range === null ? '' : `${whole(fmt, car.range)} ${UNIT.km}`;
  const charge = t('car.percent', {n: percent(fmt, car.soc)});
  return {
    title: car.name || t('car.title'),
    line: joined(whereOf(car, t), joined(charge, range), stateWord(car, t)),
  };
}

/** The plug as a fact: charging with its power in the `ok` tone, plugged in or unplugged plain. */
function plugFact(car: CarInputs, {t, fmt}: CarModelDeps): Fact {
  if (car.charging)
    return {
      text: joined(t('car.plug.charging'), car.chargingKw ? power(fmt, car.chargingKw * 1000) : ''),
      tone: 'ok',
    };
  return {text: t(car.plugged ? 'car.plug.pluggedIn' : 'car.plug.unplugged'), tone: 'plain'};
}

function summaryBlockOf(car: CarInputs, deps: CarModelDeps): SummaryBlock {
  const {t, fmt} = deps;
  return {
    name: car.name || t('car.title'),
    picture: car.picture,
    color: car.color,
    drawing: t('car.art.side'),
    charge: percent(fmt, car.soc),
    range: car.range === null ? '' : t('car.range', {n: whole(fmt, car.range)}),
    soc: socBar(car, deps),
    facts: [plugFact(car, deps), ...factsOf(car, deps)],
  };
}

/** The tire's name and the pressure Ford reported, a tenth of a psi; Ford's word for it is the catalog's where it knows it, and as Ford gave it, lower case, where it does not. */
function tireOf(label: string, {psi, state}: CarInputs['tires']['frontLeft'], {t, fmt}: CarModelDeps): TireView {
  return {
    label,
    psi: psi === null ? DASH : fmt.fixed(psi, 1),
    unit: UNIT.psi,
    state: state === null ? null : {text: t('car.tire.state', {state: state.toLowerCase()}), ok: state === 'NORMAL'},
  };
}

/** The doors, windows, hood, lock, alarm and gear as facts, what needs a look in the warning tone; a sensor the car does not have gives none. */
function factsOf(car: CarInputs, {t}: CarModelDeps): Fact[] {
  const {doors, windowsClosed, locked, alarm, gear} = car;
  const chips: ({text: string; good: boolean} | null)[] = [
    doors.closed === null
      ? null
      : {text: t(doors.closed ? 'car.chip.doorsClosed' : 'car.chip.doorOpen'), good: doors.closed},
    windowsClosed === null
      ? null
      : {text: t(windowsClosed ? 'car.chip.windowsClosed' : 'car.chip.windowOpen'), good: windowsClosed},
    doors.hoodTailgateClosed === null
      ? null
      : {
          text: t(doors.hoodTailgateClosed ? 'car.chip.hoodClosed' : 'car.chip.hoodOpen'),
          good: doors.hoodTailgateClosed,
        },
    locked === null ? null : {text: t(locked ? 'car.chip.locked' : 'car.chip.unlocked'), good: locked},
    alarm === null
      ? null
      : {
          text: alarm === 'DISARMED' ? t('car.chip.alarmOff') : t('car.chip.alarm', {state: alarm.toLowerCase()}),
          good: true,
        },
    gear === null
      ? null
      : {text: gear === 'PARK' ? t('car.chip.park') : t('car.chip.gear', {gear: gear.toLowerCase()}), good: true},
  ];
  return chips.flatMap(chip =>
    chip === null ? [] : [{text: chip.text, tone: chip.good ? ('plain' as const) : ('warn' as const)}],
  );
}

function statusOf(car: CarInputs, deps: CarModelDeps): StatusBlock {
  const {t, fmt} = deps;
  const {tires, firmware, battery12, battery} = car;
  const updated = firmware?.since ?? null;
  return {
    title: t('car.status.title'),
    drawing: t('car.art.top'),
    color: car.color,
    tires: [
      tireOf(t('car.tire.frontLeft'), tires.frontLeft, deps),
      tireOf(t('car.tire.frontRight'), tires.frontRight, deps),
      tireOf(t('car.tire.rearLeft'), tires.rearLeft, deps),
      tireOf(t('car.tire.rearRight'), tires.rearRight, deps),
    ],
    rows: present([
      tile(t('car.odometer'), car.odometer === null ? DASH : fmt.integer(car.odometer), {unit: UNIT.km}),
      tile(t('car.battery.fullRange'), battery.fullRangeKm === null ? DASH : whole(fmt, battery.fullRangeKm), {
        unit: UNIT.km,
        sub: t('car.battery.atFull'),
      }),
      tile(t('car.battery.acLimit'), reading(fmt, car.acLimit), {unit: UNIT.amps}),
      tile(t('car.battery.cabin'), temperatureFigure(fmt, car.cabin), {
        unit: UNIT.degrees,
        sub: car.outsideTemp === null ? '' : t('car.battery.outside', {n: temperatureFigure(fmt, car.outsideTemp)}),
      }),
      tile(t('car.status.battery12'), reading(fmt, battery12.percent), {
        unit: UNIT.percent,
        sub: battery12.volts ? `${fmt.fixed(battery12.volts, 1)} ${UNIT.volts}` : '',
      }),
      tile(t('car.status.usable'), battery.remainingKwh === null ? DASH : fmt.fixed(battery.remainingKwh, 1), {
        unit: UNIT.kwh,
        sub: battery.capacityKwh === null ? '' : t('car.status.ofCapacity', {n: fmt.fixed(battery.capacityKwh, 1)}),
      }),
      tile(t('car.status.batteryTemp'), temperatureFigure(fmt, battery.temperature), {unit: UNIT.degrees}),
      tile(t('car.status.software'), firmware?.version ?? DASH, {
        sub: updated === null ? '' : t('car.since', {date: fmt.date(updated)}),
        word: true,
      }),
      tile(t('car.status.autoUpdates'), car.autoUpdates === null ? DASH : t(car.autoUpdates ? 'car.on' : 'car.off'), {
        word: true,
      }),
    ]),
  };
}

/** Ford's own texts the catalog words in the household's language: the legacy rewrite layer knew these two, and a text it did not know is shown as Ford sent it. */
const FORD_TEXTS: ReadonlyMap<string, MessageKey> = new Map([
  ['Tire Pressure Monitor System Warning', 'car.ford.tpmsSubject'],
  [
    'The Tire Pressure Monitoring System has detected one or more tires are significantly under-inflated.',
    'car.ford.tpmsBody',
  ],
]);

const fordText = (text: string, t: Translate): string => {
  const key = FORD_TEXTS.get(text);
  return key ? t(key) : text;
};

function messageRow(message: FordMessage, {t, fmt}: CarModelDeps): FordRow {
  const subject = fordText(message.subject, t);
  return {
    title: message.created === null ? subject : t('car.ford.dated', {subject, date: fmt.date(message.created)}),
    body: fordText(message.body, t),
  };
}

/** Ford's own messages; null when it sent none (the departure schedule is its own row, controls.ts). */
function fordOf(car: CarInputs, deps: CarModelDeps): FordBlock | null {
  if (!car.messages.length) return null;
  const {t} = deps;
  return {
    title: t('car.ford.title'),
    caption: t('car.ford.subtitle'),
    rows: car.messages.map(message => messageRow(message, deps)),
  };
}

/** Ford's plug-in or plug-out time as `Nov 6, 5:00 pm`, or a dash where Ford sent none or something that is not a date. */
const stamp = (time: number | null, {t, fmt}: CarModelDeps): string =>
  time === null ? DASH : t('car.stamp', {date: fmt.date(time), time: fmt.time(time)});

/** The kWh the Wallbox's sessions delivered while the car was plugged in; null when the history has not loaded or Ford gave no plug-in or plug-out time. */
function delivered(plug: LastPlug, sessions: readonly Session[] | undefined): number | null {
  if (!sessions || plug.plugIn === null || plug.plugOut === null) return null;
  const {plugIn, plugOut} = plug;
  return sum(sessions.filter(session => session.end > plugIn && session.start < plugOut).map(session => session.kwh));
}

function lastOf(car: CarInputs, history: CarHistoryData | null, deps: CarModelDeps): LastBlock {
  const {t, fmt} = deps;
  const plug = car.lastPlug;
  if (!plug) return {title: t('car.last.noneTitle'), caption: t('car.last.noneBody'), tiles: []};
  const stoppedAtLimit = plug.lastSoc !== null && !!car.limit && plug.lastSoc >= car.limit;
  const kwh = delivered(plug, history?.sessions);
  return {
    title: t('car.last.title'),
    caption: t('car.last.window', {from: stamp(plug.plugIn, deps), to: stamp(plug.plugOut, deps)}),
    tiles: [
      tile(
        t('car.battery.title'),
        plug.firstSoc !== null && plug.lastSoc !== null
          ? `${fmt.number(plug.firstSoc)}→${fmt.number(plug.lastSoc)}`
          : DASH,
        {unit: UNIT.percent, sub: stoppedAtLimit ? t('car.last.stopped') : ''},
      ),
      tile(t('car.last.rangeAdded'), plug.rangeAddedKm === null ? DASH : whole(fmt, plug.rangeAddedKm), {
        unit: UNIT.km,
      }),
      tile(t('car.plug.pluggedIn'), plug.pluggedHours === null ? DASH : fmt.fixed(plug.pluggedHours, 1), {
        unit: UNIT.hours,
      }),
      tile(t('car.delivered'), kwh === null ? DASH : fmt.fixed(kwh, 1), {
        unit: UNIT.kwh,
        sub: t('car.last.perWallbox'),
      }),
    ],
  };
}

/** A sum of money as the household's language writes it: whole dollars or with cents. */
const amountText = ({t, fmt}: CarModelDeps, amount: number, cents: boolean): string =>
  t('car.money', {amount: money(fmt, amount, cents ? 'cents' : 'headline')});

/** The columns' titles of the sessions' table. */
const sessionColumns = (t: Translate): SessionsBlock['columns'] => ({
  date: t('car.sessions.date'),
  time: t('car.sessions.time'),
  length: t('car.sessions.length'),
  energy: t('car.sessions.energy'),
  peak: t('car.sessions.peak'),
  cost: t('car.estCost'),
});

/** One row of the table: the session's figures as the columns write them, its energy bar scaled to the `widest` session's kWh, and its cost at `price` dollars a kWh. */
function sessionRow(session: Session, widest: number, price: number, deps: CarModelDeps): SessionRow {
  const {t, fmt} = deps;
  return {
    key: session.start,
    date: capitalise(fmt.dateWeekday(session.start)),
    times: t('car.sessions.times', {from: fmt.time(session.start), to: fmt.time(session.end)}),
    length: `${whole(fmt, (session.end - session.start) / HOUR_MS)} ${UNIT.hours}`,
    energy: `${fmt.fixed(session.kwh, 1)} ${UNIT.kwh}`,
    barPx: Math.round((session.kwh / widest) * SESSION_BAR_PX) + SESSION_BAR_STUB_PX,
    peak: power(fmt, session.peak * 1000),
    cost: amountText(deps, session.kwh * price, true),
  };
}

/** The four tiles over the table: how many sessions and since when, the kWh delivered, the average, and the estimated cost at `price` dollars a kWh (`cents` is it, written). */
function sessionTiles(sessions: readonly Session[], price: number, cents: string, deps: CarModelDeps): CarTile[] {
  const {t, fmt} = deps;
  const total = sum(sessions.map(session => session.kwh));
  const since = sessions.length ? t('car.since', {date: fmt.date(sessions[0].start)}) : '';
  return [
    tile(t('car.sessions.sessions'), fmt.integer(sessions.length), {sub: since}),
    tile(t('car.delivered'), fmt.integer(total), {unit: UNIT.kwh}),
    tile(t('car.sessions.average'), sessions.length ? fmt.fixed(total / sessions.length, 1) : DASH, {
      unit: UNIT.kwh,
      sub: t('car.sessions.perSession'),
    }),
    tile(t('car.estCost'), amountText(deps, total * price, false), {sub: t('car.sessions.rate', {cents})}),
  ];
}

/** The sessions of the window: the year's are the history's, the month's are those that started within 30 days of the history's own instant (the model reads no clock). */
function inWindow({at, sessions}: CarHistoryData, chosen: HistoryWindow): Session[] {
  const {days} = WINDOW_RULES[chosen];
  return days === null ? sessions : sessions.filter(session => session.start >= at - days * DAY_MS);
}

function sessionsOf(history: CarHistoryData | null, charger: WallboxInputs, deps: CarModelDeps): SessionsBlock {
  const {t, fmt, allSessions, historyWindow} = deps;
  const columns = sessionColumns(t);
  const title = t('car.sessions.title');
  if (!history) return {title, summary: '', tiles: [], months: [], columns, rows: [], toggle: null};
  const sessions = inWindow(history, historyWindow);
  const price = charger.price ?? DEFAULT_KWH_PRICE;
  const cents = fmt.fixed(price * 100, 0);
  const since = sessions.length ? fmt.date(sessions[0].start) : '';
  const newest = sessions.slice().reverse();
  const widest = Math.max(1, ...sessions.map(session => session.kwh));
  const shown = allSessions ? newest : newest.slice(0, LATEST_SESSIONS);
  return {
    title,
    summary: sessions.length
      ? t('car.sessions.summary', {n: sessions.length, date: since, stop: stopAfter(since), cents})
      : t(WINDOW_RULES[historyWindow].none),
    tiles: sessionTiles(sessions, price, cents, deps),
    months: WINDOW_RULES[historyWindow].charted ? monthlySessions(sessions, fmt) : [],
    columns,
    rows: shown.map(session => sessionRow(session, widest, price, deps)),
    toggle:
      newest.length <= LATEST_SESSIONS
        ? null
        : allSessions
          ? t('car.sessions.showLatest', {n: LATEST_SESSIONS})
          : t('car.sessions.showAll', {n: newest.length}),
  };
}

/** The history's row and the 30 days of bars its sheet draws; the row is empty until the history loads. */
function historyOf(history: CarHistoryData | null, charger: WallboxInputs, deps: CarModelDeps): HistoryBlock {
  const {t, fmt} = deps;
  const title = t('car.sessions.title');
  const done = t('car.history.done');
  const windows = HISTORY_WINDOWS.map(range => ({range, label: t(`range.${range}.tab`)}));
  if (!history) return {title, done, windows, line: '', value: '', daily: null};
  const {sessions} = history;
  const total = sum(sessions.map(session => session.kwh));
  const price = charger.price ?? DEFAULT_KWH_PRICE;
  return {
    title,
    done,
    windows,
    line: t('car.history.line', {n: sessions.length, kwh: fmt.integer(total)}),
    value: sessions.length ? amountText(deps, total * price, false) : '',
    daily: dailyBars(history, deps),
  };
}

/** The detail's line under the name: where the car is, whether it is locked, and when it last checked in. */
function subOf(car: CarInputs, {t, fmt}: CarModelDeps): string {
  return joined(
    whereOf(car, t),
    lockWord(car.locked, t),
    car.lastRefresh === null ? '' : t('car.checkedIn', {time: fmt.time(car.lastRefresh)}),
  );
}

/**
 * The Car tab's view: the card, the phone's line and the detail's read-only blocks, from the inputs, in the language `deps.t` words. `history` is the loader's;
 * until it arrives the card has no bars and the detail no sessions, and a failed load puts its reason in `error`. A house with no car has only the line that says so.
 */
export function carModel(inputs: CarFeatureInputs, history: CarHistoryData | null, deps: CarModelDeps): CarViewModel {
  const {t} = deps;
  const {car, charger} = inputs;
  const error = deps.historyError === null ? null : t('car.historyFailed', {reason: deps.historyError});
  if (!car) {
    return {
      summary: {title: t('car.title'), line: t('car.noCar')},
      detail: null,
      none: t('car.noCar'),
      error,
    };
  }
  return {
    summary: summaryOf(car, deps),
    detail: {
      title: car.name || t('car.title'),
      sub: subOf(car, deps),
      summary: summaryBlockOf(car, deps),
      status: statusOf(car, deps),
      history: historyOf(history, charger, deps),
      sessions: sessionsOf(history, charger, deps),
      ford: fordOf(car, deps),
      last: lastOf(car, history, deps),
    },
    none: null,
    error,
  };
}
