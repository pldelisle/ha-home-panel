// The header's three live activities (the Hilo challenge, the car's charge, the water heater's cycle) as pure functions at a known instant.
// Pattern: functional core (Bernhardt): each reads `LiveInputs` and the loaded history and returns data (texts through `t()`, a card as a view
// model); the rules are the legacy `liveActs()`'s three blocks (deleted in #256), its thresholds and its order copied and named.
// Must not: import a feature, read the clock or the states, hold a callable (a button is a flag, the element runs the command), or draw.
import {MINUTE_MS} from '../../core/figures.ts';
import {money, percent, power, temperature, temperatureFigure, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Point} from '../../providers/power-history.ts';
import {DEFAULT_KWH_PRICE, pauseHold, type Session} from '../../providers/wallbox.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import type {LiveInputs} from './inputs.ts';

/** What the activities read of the loaded history: the water heater's last 25 hours and the Wallbox's charging sessions. */
export interface LiveHistoryData {
  at: number;
  /** Five-minute means: the water heater's temperature (`t`) and power in kW (`p`). */
  wh24: {t: Point[]; p: Point[]};
  sessions: Session[];
}

export interface ActivityDeps {
  t: Translate;
  fmt: Formatters;
  /** The held values (ADR 0023): a tap on "Pause charging" shows at once, as the legacy `sw()` did. */
  overlay: Overlay;
}

/** One of the pill's texts: a label, a value, and what follows the separator; any may be absent. */
export interface PillText {
  label: string | null;
  value: string | null;
  extra: string | null;
}

/** A line of the card that has bold parts: each piece is a text, bold or not, in order. */
export type Rich = {text: string; strong?: boolean}[];

export interface HiloCardView {
  kind: 'hilo';
  title: string;
  right: string;
  /** The four phases' bar, when the challenge's next event names all four times. */
  phases: {
    segments: {label: string; flex: number; color: string}[];
    /** Each phase's start and the recovery's end, as a percent of the bar and a time of day. */
    ticks: {left: number; text: string}[];
    /** Where now is, as a percent of the bar, 0 to 100. */
    marker: number;
    aria: string;
  } | null;
  big: {n: string; to: string} | null;
  note: string;
  meta: Rich;
}

export interface CarCardView {
  kind: 'car';
  name: string;
  state: string;
  right: string;
  big: {soc: string; limit: string; eta: {at: string; inText: string} | null};
  bar: {soc: number; limit: number; aria: string};
  meta: Rich;
  /** The Wallbox's pause switch, when it has a value: the button turns it on (`resume`, while the charger is paused) or off. */
  pause: {id: string; resume: boolean; label: string} | null;
  /** The button that opens the Car's detail. */
  openCar: string;
}

export interface WaterCardView {
  kind: 'wh';
  title: string;
  right: string;
  /** The temperature's line this cycle in a 340 × 46 box; null under two points. */
  spark: {line: string; area: string; aria: string} | null;
  big: {t: string; rate: string | null; left: {main: string; usual: string} | null};
  meta: Rich;
}

export type ActivityCardView = HiloCardView | CarCardView | WaterCardView;

export interface Activity {
  key: 'hilo' | 'car' | 'wh';
  /** 0 a reduction, 1 a pre-heat or recovery, 2 the car, 3 the water heater: the pill shows the lowest. */
  priority: number;
  icon: 'bolt' | 'car' | 'drop';
  /** A CSS colour, as the ring and the card's accent take it. */
  color: string;
  /** How far along, 0 to 1 (the ring clamps it); null when nothing says. */
  progress: number | null;
  /** The pill is tinted with the colour (a reduction). */
  tint: boolean;
  /** The long text, a phone's. */
  pill: PillText;
  /** The short one, a tablet's. */
  short: PillText;
  ariaLabel: string;
  card: ActivityCardView;
}

/** What the done check needs to know of what ran: the car's limit, and that a challenge did. */
export interface Seen {
  car?: {limit: number};
  hilo?: boolean;
}

/** A Hilo phase. */
type Phase = 'pre_heat' | 'reduction' | 'recovery';
const PHASES: readonly string[] = ['pre_heat', 'reduction', 'recovery'];

/** The phase's start and end in the challenge sensor's event. */
const PHASE_TIMES: Record<Phase, [string, string]> = {
  pre_heat: ['preheat_start', 'preheat_end'],
  reduction: ['reduction_start', 'reduction_end'],
  recovery: ['recovery_start', 'recovery_end'],
};

/** The water heater heats above this many kW; a cycle under five minutes is not a usual one. */
const WATER_ON_KW = 0.2;
const POINT_MS = 5 * MINUTE_MS;
/** A cycle that ended within this long is still the current one. */
const STILL_OPEN_MS = 15 * MINUTE_MS;
/** Under this long left is "almost done". */
const ALMOST_DONE_MS = 3 * MINUTE_MS;
/** The rate is said per ten minutes, and from 0.05 degrees on. */
const RATE_PER_MS = 10 * MINUTE_MS;
const RATE_SHOWN_FROM = 0.05;
/** The last session is the current one when it ended within two hours and started at most an hour before the plug-in. */
const SESSION_RECENT_MS = 2 * 60 * MINUTE_MS;
const SESSION_BEFORE_PLUG_MS = 60 * MINUTE_MS;
/** A card's meta line: the pieces that apply, joined by a middle dot. */
function metaLine(pieces: readonly (Rich | false)[]): Rich {
  return pieces
    .filter((piece): piece is Rich => piece !== false)
    .flatMap((piece, i) => (i ? [{text: ' · '}, ...piece] : piece));
}

/** The capacity rule needs the charger to draw more than this many kW. */
const CAPACITY_RULE_KW = 0.3;
/** The car's head shows its power from this many kW. */
const POWER_SHOWN_KW = 0.05;

/** A time the challenge sensor writes as `2026-11-16 16:00:00`, read as an instant: the legacy space-to-T rule. */
export function phaseTime(text: string | undefined): number | null {
  const at = Date.parse(String(text || '').replace(' ', 'T'));
  return Number.isFinite(at) ? at : null;
}

/** A time of day on the phase bar: the time without its English day period (`4:07`, `16 h 07`). */
const tickTime = (fmt: Formatters, at: number) => fmt.time(at).replace(/ [ap]m$/, '');

/** The Hilo challenge from the start of its pre-heat until its recovery ends; null otherwise. */
export function hiloActivity(inputs: LiveInputs, {t, fmt}: ActivityDeps): Activity | null {
  const {challenge} = inputs.hilo;
  const state = challenge ? (challenge.state === 'on' ? 'reduction' : challenge.state) : null;
  if (!challenge || !state || !PHASES.includes(state)) return null;
  const phase = state as Phase;
  const {now} = inputs;
  const phases = challenge.nextEvent?.phases ?? {};
  const time = (key: string) => phaseTime(phases[key]);
  const [from, to] = PHASE_TIMES[phase].map(time);
  const next = phase === 'pre_heat' ? (time('reduction_start') ?? to) : to;
  const reduction = phase === 'reduction';
  const left = next ? fmt.durationShort(next - now) : '';
  const name = t('live.hiloName', {phase});
  const short = t('live.hiloShort', {phase});
  const what = left ? t(phase === 'pre_heat' ? 'live.challengeIn' : 'live.endsIn', {d: left}) : '';
  const temperatures = inputs.power.rooms.map(room => room.temperature).filter((v): v is number => v !== null);
  const inside = temperatures.length ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : null;
  const used = challenge.nextEvent?.used ?? null;
  const allowed = challenge.nextEvent?.allowed ?? null;
  const grid = inputs.power.grid;
  const meta = metaLine([
    inside !== null && [{text: temperature(fmt, inside), strong: true}, {text: ` ${t('live.inside')}`}],
    grid !== null && [{text: `${t('live.houseUsing')} `}, {text: power(fmt, grid * 1000), strong: true}],
    used !== null &&
      !!allowed && [
        {text: fmt.fixed(used, 1), strong: true},
        {text: ` ${t('live.ofAllowed', {n: fmt.fixed(allowed, 1)})}`},
      ],
  ]);
  return {
    key: 'hilo',
    priority: reduction ? 0 : 1,
    icon: 'bolt',
    color: reduction ? 'var(--crit)' : 'var(--c-grid)',
    progress: from && to && to > from ? (now - from) / (to - from) : null,
    tint: reduction,
    pill: {label: name, value: null, extra: what || null},
    short: {label: short, value: null, extra: left || null},
    ariaLabel: what ? t('live.labelWith', {name, what}) : name,
    card: {
      kind: 'hilo',
      title: t('live.hiloCardTitle'),
      right: from && to ? t('live.phaseSpan', {phase: short, from: fmt.time(from), to: fmt.time(to)}) : short,
      phases: phaseBar(phases, now, {t, fmt}),
      big: left ? {n: left, to: t('live.until', {phase})} : null,
      note: t('live.hiloNote', {phase}),
      meta,
    },
  };
}

/** The bar of the four phases, when all four times are known and in order. */
function phaseBar(
  phases: Record<string, string>,
  now: number,
  {t, fmt}: Pick<ActivityDeps, 't' | 'fmt'>,
): HiloCardView['phases'] {
  const [p0, p1, p2, p3] = ['preheat_start', 'reduction_start', 'recovery_start', 'recovery_end'].map(key =>
    phaseTime(phases[key]),
  );
  if (!p0 || !p1 || !p2 || !p3 || !(p3 > p0)) return null;
  const percent = (at: number) => +(((at - p0) / (p3 - p0)) * 100).toFixed(1);
  return {
    segments: [
      {label: t('live.phase', {phase: 'pre_heat'}), flex: p1 - p0, color: 'var(--c-grid)'},
      {label: t('live.phase', {phase: 'reduction'}), flex: p2 - p1, color: 'var(--crit)'},
      {label: t('live.phase', {phase: 'recovery'}), flex: p3 - p2, color: 'var(--c-ev)'},
    ],
    ticks: [p0, p1, p2, p3].map(at => ({left: percent(at), text: tickTime(fmt, at)})),
    marker: Math.max(0, Math.min(100, percent(now))),
    aria: t('live.phasesAria', {p0: fmt.time(p0), p1: fmt.time(p1), p2: fmt.time(p2), p3: fmt.time(p3)}),
  };
}

/** The Wallbox's charging switch, its held value first: on while it charges, off while it is paused. */
const pauseOn = ({pause}: LiveInputs['wallbox'], overlay: Overlay): boolean =>
  pause.id ? overlay(pauseHold(pause.id), pause.on) : pause.on;

/** The car's paused-below-its-limit rule: plugged in, not charging, the Wallbox's pause switch off, and the charge under the limit less one. */
export function chargingPaused({car, wallbox}: LiveInputs, overlay: Overlay): boolean {
  if (
    !car ||
    car.charging ||
    !car.plugged ||
    !wallbox.pause.id ||
    !wallbox.pause.available ||
    pauseOn(wallbox, overlay)
  )
    return false;
  return car.soc === null || car.limit === null || car.soc < car.limit - 1;
}

/** When the charge will be full: Ford's first estimate that is ahead (a date) or a count of minutes, else the battery's capacity at the charger's power. */
export function chargeEta(inputs: LiveInputs, power: number | null): number | null {
  const {car, now, carBatteryKwh} = inputs;
  if (!car) return null;
  for (const estimate of car.chargeEstimates) {
    if ('at' in estimate) {
      if (estimate.at > now) return estimate.at;
    } else return now + estimate.minutes * MINUTE_MS;
  }
  const limit = car.limit || 100;
  if (
    car.charging &&
    carBatteryKwh &&
    car.soc !== null &&
    power !== null &&
    power > CAPACITY_RULE_KW &&
    car.soc < limit
  )
    return now + (((limit - car.soc) / 100) * carBatteryKwh * 60 * MINUTE_MS) / power;
  return null;
}

/** The session that started with this plug-in: the last one, when it ended within two hours and started at most an hour before the plug went in. */
export function currentSession(sessions: readonly Session[], pluggedAt: number | null, now: number): Session | null {
  const last = sessions.at(-1);
  if (!last || last.end < now - SESSION_RECENT_MS) return null;
  return !pluggedAt || last.start >= pluggedAt - SESSION_BEFORE_PLUG_MS ? last : null;
}

/** The car while Ford says it charges, or while it is plugged in with the Wallbox paused below its limit; null otherwise. */
export function carActivity(
  inputs: LiveInputs,
  history: LiveHistoryData | null,
  {t, fmt, overlay}: ActivityDeps,
): Activity | null {
  const {car, wallbox, now} = inputs;
  const paused = chargingPaused(inputs, overlay);
  if (!car || !(car.charging || paused)) return null;
  const {soc} = car;
  const limit = car.limit || 100;
  const kw = wallbox.power ?? car.chargePowerKw;
  const eta = chargeEta(inputs, kw);
  const left = eta ? fmt.durationShort(eta - now) : '';
  const charge = percent(fmt, soc);
  const session = currentSession(history?.sessions ?? [], car.plugChangedAt, now);
  const price = wallbox.price ?? DEFAULT_KWH_PRICE;
  const meta = metaLine([
    car.plugged && car.plugChangedAt !== null && [{text: t('live.pluggedInAt', {time: fmt.time(car.plugChangedAt)})}],
    !!session && [
      {text: `+${fmt.fixed(session.kwh, 1)} kWh`, strong: true},
      {text: ` ${t('live.soFarAbout')} `},
      {text: t('car.money', {amount: money(fmt, session.kwh * price, 'cents')}), strong: true},
    ],
    car.range !== null && [{text: t('live.range', {n: Math.round(car.range)})}],
  ]);
  return {
    key: 'car',
    priority: 2,
    icon: 'car',
    color: paused ? 'var(--fg3)' : 'var(--c-ev)',
    progress: soc === null ? null : soc / 100,
    tint: false,
    pill: {
      label: t(paused ? 'live.chargingPaused' : 'live.charging'),
      value: t('live.percent', {n: charge}),
      extra: left || null,
    },
    short: {
      label: null,
      value: t('live.percent', {n: charge}),
      extra: paused ? t('live.paused') : left || t('live.chargingShort'),
    },
    ariaLabel: left
      ? t('live.carAriaLeft', {paused: paused ? 'yes' : 'no', n: charge, left})
      : t('live.carAria', {paused: paused ? 'yes' : 'no', n: charge}),
    card: {
      kind: 'car',
      name: car.name || t('car.title'),
      state: t(paused ? 'live.paused' : 'live.chargingShort'),
      right: kw !== null && kw > POWER_SHOWN_KW ? power(fmt, kw * 1000) : '',
      big: {
        soc: charge,
        limit: t('live.toLimit', {n: limit}),
        eta: eta ? {at: t('live.fullAt', {time: fmt.time(eta)}), inText: t('live.inDuration', {d: left})} : null,
      },
      bar: {soc: soc ?? 0, limit, aria: t('live.batteryAria', {n: charge, limit})},
      meta,
      pause:
        wallbox.pause.id && wallbox.pause.available
          ? {
              id: wallbox.pause.id,
              resume: !pauseOn(wallbox, overlay),
              label: t(pauseOn(wallbox, overlay) ? 'live.pauseCharging' : 'live.resumeCharging'),
            }
          : null,
      openCar: t('live.openCar'),
    },
  };
}

/** The water heater's runs over the points: on above 0.2 kW, a run closed at its last point plus five minutes when the points end on it. */
export function waterRuns(points: readonly Point[]): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  points.forEach(([at, kw], i) => {
    const on = kw > WATER_ON_KW;
    if (on && start === null) start = at;
    if ((!on || i === points.length - 1) && start !== null) {
      runs.push([start, on ? at + POINT_MS : at]);
      start = null;
    }
  });
  return runs;
}

/** The median of the sorted lengths: the upper middle for an even count, as the legacy panel took it. */
const median = (sorted: readonly number[]): number | null =>
  sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

/** The water heater while it draws power: the time left from how long its other cycles of the last day lasted; null otherwise. */
export function waterActivity(
  inputs: LiveInputs,
  history: LiveHistoryData | null,
  {t, fmt}: ActivityDeps,
): Activity | null {
  const {power: kw, temperature: tank, powerChangedAt} = inputs.waterHeater;
  const {now} = inputs;
  if (kw === null || !(kw > WATER_ON_KW)) return null;
  const points = history ? history.wh24.p.filter(([at]) => at >= now - 24 * 60 * MINUTE_MS) : [];
  const runs = waterRuns(points);
  const last = runs.at(-1);
  const open = !!last && last[1] >= now - STILL_OPEN_MS;
  const start = open ? last[0] : (powerChangedAt ?? now);
  const usual = median(
    runs
      .filter(run => run !== (open ? last : null) && run[1] - run[0] >= POINT_MS)
      .map(([from, to]) => to - from)
      .sort((a, b) => a - b),
  );
  const elapsed = now - start;
  const leftMs = usual ? Math.max(0, usual - elapsed) : null;
  const left = leftMs === null ? '' : leftMs < ALMOST_DONE_MS ? t('live.almostDone') : `~${fmt.durationShort(leftMs)}`;
  const temps = history ? history.wh24.t.filter(([at]) => at >= start - 10 * MINUTE_MS) : [];
  const first = temps[0];
  const latest = temps.at(-1);
  const rate =
    first && latest && temps.length > 1 && latest[0] > first[0]
      ? (latest[1] - first[1]) / ((latest[0] - first[0]) / RATE_PER_MS)
      : null;
  const kwh = points.filter(([at]) => at >= start).reduce((total, [, kw]) => total + kw, 0) / 12;
  const meta = metaLine([
    [{text: t('live.started', {time: fmt.time(start)})}],
    points.length > 0 && [{text: `${fmt.fixed(kwh, 1)} kWh`, strong: true}, {text: ` ${t('live.thisCycle')}`}],
    runs.length > 1 && [{text: t('live.cyclesIn24h', {n: runs.length})}],
  ]);
  return {
    key: 'wh',
    priority: 3,
    icon: 'drop',
    color: 'var(--c-wh)',
    progress: usual ? elapsed / usual : null,
    tint: false,
    pill: {
      label: t('live.waterHeater'),
      value: tank === null ? null : temperature(fmt, tank),
      extra: left || null,
    },
    short: {label: t('live.water'), value: null, extra: left || null},
    ariaLabel:
      leftMs === null ? t('live.waterHeating') : t('live.waterHeatingLeft', {left: waterLeftAria(leftMs, fmt, t)}),
    card: {
      kind: 'wh',
      title: t('live.waterHeating'),
      right: power(fmt, kw * 1000),
      spark: sparkline(temps, now, t),
      big: {
        t: temperatureFigure(fmt, tank),
        rate:
          rate !== null && Math.abs(rate) >= RATE_SHOWN_FROM
            ? t('live.rate', {up: rate > 0 ? 'yes' : 'no', n: temperatureFigure(fmt, Math.abs(rate))})
            : null,
        left:
          leftMs === null || usual === null
            ? null
            : {
                main: leftMs < ALMOST_DONE_MS ? t('live.almostDoneTitle') : t('live.left', {d: left}),
                usual: t('live.usualCycle', {d: fmt.durationShort(usual)}),
              },
      },
      meta,
    },
  };
}

/** The time left as the aria label says it: `about 52 min`, or `almost done`. */
const waterLeftAria = (leftMs: number, fmt: Formatters, t: Translate) =>
  leftMs < ALMOST_DONE_MS ? t('live.almostDone') : t('live.about', {d: fmt.durationShort(leftMs)});

/** The temperature this cycle as a line and its filled area in a 340 × 46 box, from the first point to now. */
function sparkline(points: readonly Point[], now: number, t: Translate): WaterCardView['spark'] {
  if (points.length < 2) return null;
  const values = points.map(([, v]) => v);
  const low = Math.min(...values) - 0.5;
  const high = Math.max(...values) + 0.5;
  const x0 = points[0][0];
  const x1 = Math.max(now, x0 + 1);
  const x = (at: number) => (((at - x0) / (x1 - x0)) * 330 + 5).toFixed(1);
  const y = (v: number) => (40 - ((v - low) / (high - low)) * 34).toFixed(1);
  const line = points.map(([at, v], i) => `${i ? 'L' : 'M'}${x(at)},${y(v)}`).join('');
  const [end] = points.at(-1)!;
  return {line, area: `${line}L${x(end)},46L5,46Z`, aria: t('live.waterSparkAria')};
}

/** The activities in the pill's order: the lowest priority first, a tie in the order given. */
export const sortActivities = (activities: readonly (Activity | null)[]): Activity[] =>
  activities.filter((a): a is Activity => a !== null).sort((a, b) => a.priority - b.priority);

/** What ran at this instant, for the done check. */
export function seenOf(activities: readonly Activity[]): Seen {
  const seen: Seen = {};
  for (const activity of activities) {
    if (activity.key === 'hilo') seen.hilo = true;
    if (activity.key === 'car' && activity.card.kind === 'car') seen.car = {limit: activity.card.bar.limit};
  }
  return seen;
}
