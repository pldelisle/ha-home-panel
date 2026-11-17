// The smart stack's cards: one named pure rule each over `StackInputs`, in the legacy `stackCards()`'s order, and the list they make.
// Pattern: Chain of Responsibility in its collecting form (Gamma et al.), as the header's Status checks are: `RULES` is the chain and
// `stackCards` asks every link, keeping each card in chain order; a card is a view model (data, never HTML) for `<hp-stack-card>` (#266).
// Must not: import another feature, read the clock or the states (everything comes through `readStack`), or change a threshold: the
// thresholds are copies of the legacy `stackCards()`'s, which #266 deletes with the legacy stack.
import {capitalise, DASH, DAY_MS, MINUTE_MS} from '../../core/figures.ts';
import {conditionName} from '../../core/i18n/condition-name.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import {whole, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Pollutant} from '../../providers/air-quality.ts';
import type {Schedule} from '../../providers/fordpass.ts';
import type {FlowRow} from '../../providers/power-history.ts';
import type {IconName} from '../../ui/icons.ts';
import type {StackInputs} from './inputs.ts';
import {inHours, reminderLeft, type Tone} from './rotation.ts';

/** Where a tap on a card leads: a tab, a sheet (with what it is about), or a sensor's history. */
export type Go = {tab: string} | {sheet: string; detail?: Record<string, string>} | {sensorHistory: string};

/** One part of a card's body, in the order the card shows them; the element places each without HTML. */
export type BodyPart =
  | {kind: 'big'; value: string; unit: string}
  | {kind: 'mid'; text: string}
  /** The first three names, and how many more there are. */
  | {kind: 'chips'; names: string[]; more: number}
  /** A charge ring with its limit's tick, beside up to three labelled figures. */
  | {kind: 'ring'; percent: number | null; limit: number | null; color: string; size: number; rows: Figure[]}
  | {kind: 'people'; people: PersonRow[]}
  | {kind: 'events'; events: EventRow[]}
  | {kind: 'nowPlaying'; picture: string | null; title: string; artist: string}
  /** The shares of a bar, in percent, each with its colour; only the parts above zero. */
  | {kind: 'bar'; parts: {share: number; color: string}[]}
  /** Tomorrow: the condition's icon with its name (`label`), the high and the low, and the condition's words. */
  | {kind: 'weather'; condition: string | null; label: string; value: string; unit: string; text: string};

export interface Figure {
  label: string;
  value: string;
}

export interface PersonRow {
  initial: string;
  name: string;
  home: boolean;
  /** "Arrived 4:07 pm" or "Left 4:07 pm". */
  line: string;
  /** "Home" or "Away". */
  tag: string;
}

export interface EventRow {
  title: string;
  /** "All day", or its start. */
  time: string;
  color: string;
}

export interface StackCard {
  /** Unique in the list: the rule's key, with the reminder's index, the door's id or the room's name where a rule makes several. */
  key: string;
  /** Red pins the card until it clears; amber puts it first in the rotation. */
  tone: Tone;
  /** A filler shows only when no other card applies. */
  filler: boolean;
  icon: IconName;
  label: string;
  color: string;
  right: string;
  go: Go | null;
  /** What a screen reader calls the card when its words do not make a name of their own; empty lets them. */
  name: string;
  body: BodyPart[];
  foot: string;
}

/** The catalog and the formats, in the panel's language and the house's zone. */
export interface StackDeps {
  t: Translate;
  fmt: Formatters;
}

export interface StackRule {
  key: string;
  /** The cards this rule makes at these inputs: none, one, or one per door, reminder or room. */
  run(inputs: StackInputs, deps: StackDeps): StackCard[];
}

/** A door open this long is a red card. */
const DOOR_OPEN_MINUTES = 5;
/** Lights unavailable this long are a red card. */
const LIGHTS_LOST_MINUTES = 5;
/** Under this charge, the car unplugged at night is an amber card. */
const CAR_LOW_PERCENT = 40;
/** The night the car's two cards watch: 21:00 to 6:00 for the low charge, to 7:00 for the overnight charge. */
const NIGHT = {from: 21, lowTo: 6, chargeTo: 7};
/** The sunrise card shows this long before the sun rises. */
const SUNRISE_LEAD_MINUTES = 60;
/** Someone came or left this recently: the who's-home card; a door closed this recently is its footer. */
const MOVED_MINUTES = 30;
/** The agenda shows in the morning, tomorrow in the evening, the Energy filler in the day and the who's-home filler in the waking hours. */
const AGENDA_HOURS = [6, 11] as const;
const TOMORROW_HOURS = [17, 24] as const;
const ENERGY_HOURS = [8, 21] as const;
const WHO_FILLER_HOURS = [7, 22] as const;
/** A pollutant at this level or above (poor) is worth a card. */
const AIR_POOR = 2;
/** The charging power the overnight card shows at all, in kW. */
const CHARGING_SHOWN_KW = 0.05;

const WARN = 'var(--warn)';
const CRIT = 'var(--crit)';
const EVENT_COLORS = ['var(--c-home)', 'var(--m-purple)'];
/** The Energy filler's bar: heating, the water heater, the car and the rest, in that order. */
const ENERGY_COLORS = ['var(--c-heat)', 'var(--c-wh)', 'var(--c-ev)', 'var(--fg3)'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
/** Each pollutant's catalog word and its unit, which no language changes. */
const POLLUTANT: Record<Pollutant, [MessageKey, string]> = {
  pm2_5: ['air.metric.pm25', 'µg/m³'],
  co2: ['air.metric.co2', 'ppm'],
  voc: ['air.metric.voc', 'µg/m³'],
  co: ['air.metric.co', 'ppm'],
};

/** Whole minutes from `at` to `now`, rounded as the legacy stack rounded. */
const minutesSince = (now: number, at: number): number => Math.round((now - at) / MINUTE_MS);

/** A time today, else a date: the legacy stack's `when`. */
const when = (at: number, now: number, fmt: Formatters): string =>
  fmt.isoDay(at) === fmt.isoDay(now) ? fmt.time(at) : fmt.date(at);

/** A time of day as a big figure: the clock, with the day period (`am`, `pm`) as its unit when the language writes one. */
function bigTime(at: number, fmt: Formatters): BodyPart {
  const text = fmt.time(at);
  const split = /^(.+) ([ap]m)$/.exec(text);
  return {kind: 'big', value: split ? split[1] : text, unit: split ? split[2] : ''};
}

const big = (value: string, unit = ''): BodyPart => ({kind: 'big', value, unit});
const mid = (text: string): BodyPart => ({kind: 'mid', text});
const chips = (names: string[]): BodyPart => ({
  kind: 'chips',
  names: names.slice(0, 3),
  more: Math.max(0, names.length - 3),
});

/** A card with the defaults every rule shares: no tone, no filler, nothing on the right, no tap, no footer. */
const card = (
  fields: Pick<StackCard, 'key' | 'icon' | 'label' | 'color' | 'body'> & Partial<StackCard>,
): StackCard => ({
  tone: null,
  filler: false,
  right: '',
  go: null,
  name: '',
  foot: '',
  ...fields,
});

export const doorOpen: StackRule = {
  key: 'door',
  run: ({doors, now}, {t, fmt}) =>
    doors
      .filter(door => door.on && minutesSince(now, door.since) >= DOOR_OPEN_MINUTES)
      .map(door => {
        const m = minutesSince(now, door.since);
        return card({
          key: `door:${door.id}`,
          icon: 'door',
          label: t('stack.door.label', {name: door.name}),
          color: CRIT,
          tone: 'red',
          go: {sensorHistory: door.id},
          body:
            m < 60
              ? [big(fmt.integer(m), t('stack.unit.minutes'))]
              : [
                  big(fmt.integer(Math.floor(m / 60)), t('stack.unit.hours')),
                  mid(t('stack.door.openSince', {when: when(door.since, now, fmt)})),
                ],
          foot: t('stack.door.foot'),
        });
      }),
};

export const lightsUnreachable: StackRule = {
  key: 'lights',
  run: ({lights, now}, {t, fmt}) => {
    const lost = lights.filter(area => area.unavailable.some(l => minutesSince(now, l.since) >= LIGHTS_LOST_MINUTES));
    if (!lost.length) return [];
    const down = lost.flatMap(area => area.unavailable);
    const first = Math.min(...down.map(l => l.since));
    return [
      card({
        key: 'lights',
        icon: 'bulb',
        label: t('stack.lights.label'),
        color: CRIT,
        right: t('stack.since', {when: when(first, now, fmt)}),
        tone: 'red',
        go: {tab: 'lights'},
        body: [big(fmt.integer(down.length), t('stack.lights.unit', {n: down.length})), chips(lost.map(a => a.name))],
        foot: t('stack.lights.foot'),
      }),
    ];
  },
};

export const weatherWarning: StackRule = {
  key: 'wxwarn',
  run: ({alerts, now}, {t, fmt}) => {
    const warnings = alerts.filter(a => a.kind === 'warning');
    const [first] = warnings;
    if (!first) return [];
    const issued = first.time === null ? NaN : Date.parse(first.time);
    return [
      card({
        key: 'wxwarn',
        icon: 'warn',
        label: first.title ?? t('weather.alerts.kindCount', {kind: 'warning', n: first.count ?? 1}),
        color: WARN,
        tone: 'amber',
        go: {sheet: 'weather.detail'},
        right: 'Env. Canada',
        body: [mid(warnings.length > 1 ? t('stack.warning.many', {n: warnings.length}) : t('stack.warning.one'))],
        foot: Number.isFinite(issued)
          ? t('stack.warning.issued', {when: when(issued, now, fmt)})
          : t('stack.tapForDetails'),
      }),
    ];
  },
};

export const carLow: StackRule = {
  key: 'carlow',
  run: ({car, now}, {t, fmt}) => {
    if (!car || car.home === false || car.plugged || car.soc === null || car.soc >= CAR_LOW_PERCENT) return [];
    if (!inHours(fmt.hourNow(now), NIGHT.from, NIGHT.lowTo)) return [];
    return [
      card({
        key: 'carlow',
        icon: 'car',
        label: t('stack.carLow.label', {name: car.name || t('stack.car')}),
        color: WARN,
        tone: 'amber',
        go: {sheet: 'car.detail'},
        body: [
          {
            kind: 'ring',
            percent: car.soc,
            limit: null,
            color: WARN,
            size: 108,
            rows: car.range === null ? [] : [{label: t('stack.range'), value: `${fmt.integer(car.range)} km`}],
          },
        ],
        foot: t('stack.carLow.foot'),
      }),
    ];
  },
};

export const presenceFrozen: StackRule = {
  key: 'presence',
  run: ({frozen, now}, {t, fmt}) => {
    const [first] = frozen;
    if (!first) return [];
    return [
      card({
        key: 'presence',
        icon: 'house',
        label: t('stack.presence.label'),
        color: WARN,
        tone: 'amber',
        right: t('stack.since', {when: when(Date.parse(first.updated), now, fmt)}),
        body: [mid(t('stack.presence.body', {n: frozen.length}))],
        foot: t('stack.presence.foot'),
      }),
    ];
  },
};

export const sunrise: StackRule = {
  key: 'sunrise',
  run: ({sun, now, lights, stack}, {t, fmt}) => {
    const rise = sun.today.rise !== null && now < sun.today.rise ? sun.today.rise : sun.tomorrow.rise;
    if (rise === null) return [];
    const left = (rise - now) / MINUTE_MS;
    if (!(left > 0 && left <= SUNRISE_LEAD_MINUTES)) return [];
    const on = lights.filter(area => area.on).map(area => area.name);
    if (stack.sunriseOff && !on.length) return [];
    return [
      card({
        key: 'sunrise',
        icon: 'sunup',
        label: t(stack.sunriseOff ? 'stack.sunrise.lightsOff' : 'stack.sunrise.label'),
        color: 'var(--m-amber)',
        go: {tab: 'lights'},
        body: [bigTime(rise, fmt), mid(t('stack.inMinutes', {n: Math.round(left)})), ...(on.length ? [chips(on)] : [])],
        foot: t(
          on.length ? (stack.sunriseOff ? 'stack.sunrise.turnsOff' : 'stack.sunrise.stillOn') : 'stack.sunrise.allOff',
        ),
      }),
    ];
  },
};

export const reminders: StackRule = {
  key: 'reminders',
  run: ({stack, now}, {t, fmt}) =>
    stack.reminders.flatMap((reminder, i) => {
      const left = reminderLeft(reminder, fmt.hourNow(now));
      if (left === null) return [];
      return [
        card({
          key: `rem${i}`,
          icon: 'moon',
          label: reminder.title,
          color: 'var(--m-purple)',
          body: [bigTime(now + left * MINUTE_MS, fmt), ...(reminder.text ? [mid(reminder.text)] : [])],
          foot: t('stack.inMinutes', {n: left}),
        }),
      ];
    }),
};

/** The grid's draw as the two peak cards say it: watts under a kilowatt, one decimal above. */
function using({power}: StackInputs, {t, fmt}: StackDeps): string {
  const g = power.grid;
  const figure = g === null ? DASH : g < 1 ? `${whole(fmt, g * 1000)} W` : `${fmt.fixed(g, 1)} kW`;
  return t('stack.using', {power: figure});
}

export const peak: StackRule = {
  key: 'peak',
  run: (inputs, deps) => {
    const {hydroQuebec: hq, challenge} = inputs;
    const {t} = deps;
    const base = {
      key: 'peak',
      icon: 'bolt' as const,
      color: CRIT,
      go: {sheet: 'energy.detail'},
      foot: using(inputs, deps),
    };
    if (hq && (hq.peakNow || hq.peakUpcoming))
      return [
        card({
          ...base,
          label: t(hq.peakNow ? 'stack.peak.now' : 'stack.peak.coming'),
          right: 'Hydro-Québec',
          body: [mid(t(hq.peakNow ? 'stack.peak.lower' : 'stack.peak.announced'))],
        }),
      ];
    if (challenge?.active)
      return [
        card({
          ...base,
          label: t('stack.peak.challenge'),
          right: 'Hilo',
          body: [mid(t('stack.peak.phase', {phase: challenge.state}))],
        }),
      ];
    return [];
  },
};

export const nowPlaying: StackRule = {
  key: 'music',
  run: ({playing}, {t}) =>
    playing
      ? [
          card({
            key: 'music',
            icon: 'spk',
            label: t('stack.music.label'),
            color: 'var(--m-purple)',
            right: playing.place,
            go: {tab: 'media'},
            name: t('stack.music.name', {detail: [playing.title, playing.place].filter(Boolean).join(', ')}),
            body: [
              {
                kind: 'nowPlaying',
                picture: playing.picture,
                title: playing.title || t('stack.music.playing'),
                artist: playing.artist ?? '',
              },
            ],
          }),
        ]
      : [],
};

/** The key of the who's-home card, the came-or-left one and the filler alike; the Home card's filter drops the filler by it. */
export const WHO_KEY = 'who';

/** The people a person entity says came or left, each with when it changed. */
const movedPeople = ({people}: StackInputs) =>
  people.flatMap(p => (p.changed ? [{...p, at: Date.parse(p.changed)}] : []));

/** The people a person entity says came or left, each with when, and the door closed most recently in the last half hour. */
function whoCard(inputs: StackInputs, {t, fmt}: StackDeps, filler: boolean): StackCard {
  const {doors, now} = inputs;
  const moved = movedPeople(inputs);
  const door = doors
    .filter(d => d.available && !d.on && minutesSince(now, d.since) <= MOVED_MINUTES)
    .sort((a, b) => b.since - a.since)[0];
  return card({
    key: WHO_KEY,
    icon: 'house',
    label: t('people.whosHome'),
    color: 'var(--m-orange)',
    filler,
    body: [
      {
        kind: 'people',
        people: moved.map(p => ({
          initial: p.name.charAt(0),
          name: p.name,
          home: p.home,
          line: t(p.home ? 'stack.who.arrived' : 'stack.who.left', {when: when(p.at, now, fmt)}),
          tag: t(p.home ? 'stack.who.home' : 'stack.who.away'),
        })),
      },
    ],
    foot: door ? t('stack.who.opened', {name: door.name, when: when(door.since, now, fmt)}) : '',
  });
}

/** Whether someone came or left in the last half hour: the came-or-left card shows, and the filler does not. */
const movedLately = (inputs: StackInputs): boolean =>
  movedPeople(inputs).some(p => minutesSince(inputs.now, p.at) <= MOVED_MINUTES);

export const cameOrLeft: StackRule = {
  key: WHO_KEY,
  run: (inputs, deps) => (movedLately(inputs) ? [whoCard(inputs, deps, false)] : []),
};

export const agenda: StackRule = {
  key: 'agenda',
  run: ({events, now}, {t, fmt}) => {
    if (!inHours(fmt.hourNow(now), ...AGENDA_HOURS) || !events.length) return [];
    return [
      card({
        key: 'agenda',
        icon: 'cal',
        label: t('stack.agenda.label'),
        color: CRIT,
        right: t('stack.agenda.events', {n: events.length}),
        body: [
          {
            kind: 'events',
            events: events.slice(0, 2).map((e, i) => ({
              title: e.title,
              time: e.allDay ? t('stack.agenda.allDay') : fmt.time(e.start),
              color: EVENT_COLORS[i],
            })),
          },
        ],
        foot: events.length > 2 ? t('stack.agenda.more', {n: events.length - 2}) : t('stack.agenda.foot'),
      }),
    ];
  },
};

export const awayMode: StackRule = {
  key: 'away',
  run: ({away, lights, power, now}, {t, fmt}) => {
    if (!away?.on) return [];
    const on = lights.filter(area => area.on).length;
    const inside = power.rooms.map(r => r.temperature).filter((v): v is number => v !== null);
    const mean = inside.reduce((a, b) => a + b, 0) / inside.length;
    return [
      card({
        key: 'away',
        icon: 'shield',
        label: t('stack.away.label'),
        color: 'var(--c-home)',
        right: t('stack.since', {when: when(away.since, now, fmt)}),
        body: [
          ...(inside.length ? [big(`${fmt.fixed(mean, 1)}°`, t('stack.away.inside'))] : []),
          mid(on ? t('stack.away.lightsOn', {n: on}) : t('stack.away.allOff')),
        ],
        foot: t('stack.away.foot'),
      }),
    ];
  },
};

export const poorAir: StackRule = {
  key: 'air',
  run: ({air}, {t, fmt}) =>
    air.flatMap(({name, rating}) => {
      const bad = rating.pollutants.find(p => p.level >= AIR_POOR);
      if (!bad) return [];
      const [word, unit] = POLLUTANT[bad.k];
      const v = bad.v;
      const figure = v === null ? DASH : bad.k === 'co' && v < 10 ? fmt.fixed(v, 1) : fmt.integer(v);
      return [
        card({
          key: `air:${name}`,
          icon: 'wind',
          label: t('stack.air.label', {room: name}),
          color: 'var(--m-teal)',
          go: {sheet: 'air.detail'},
          body: [big(figure, unit), mid(t('stack.air.high', {pollutant: t(word)}))],
          foot: t(bad.k === 'co2' ? 'stack.air.openWindow' : 'stack.air.faster'),
        }),
      ];
    }),
};

export const tomorrow: StackRule = {
  key: 'tomorrow',
  run: ({forecast, tonight, now}, {t, fmt}) => {
    if (!inHours(fmt.hourNow(now), ...TOMORROW_HOURS)) return [];
    const next = forecast.find(day => day.dayKey === fmt.isoDay(now + DAY_MS));
    if (!next || (next.hi === null && next.lo === null)) return [];
    const today = forecast.find(day => day.dayKey === fmt.isoDay(now));
    const condition = conditionName(next.condition, t);
    const night = today && tonight ? conditionName(tonight, t) : '';
    return [
      card({
        key: 'tomorrow',
        icon: 'cal',
        label: t('stack.tomorrow.label'),
        color: 'var(--c-home)',
        right: capitalise(fmt.weekday(next.at, 'long')),
        go: {sheet: 'weather.detail'},
        body: [
          {
            kind: 'weather',
            condition: next.condition,
            label: condition,
            value: next.hi === null ? DASH : `${whole(fmt, next.hi)}°`,
            unit: next.lo === null ? '' : `/ ${whole(fmt, next.lo)}°`,
            text: next.pop ? t('stack.tomorrow.chance', {condition, pop: Math.round(next.pop)}) : condition,
          },
        ],
        foot: !night
          ? ''
          : today?.lo != null
            ? t('stack.tonightLow', {condition: night, low: whole(fmt, today.lo)})
            : t('stack.tonight', {condition: night}),
      }),
    ];
  },
};

/** The saved departure as the overnight card says it: every day, weekdays, or the days' short names, at the time. */
function departureWords({days, hours, minutes}: Schedule, {t, fmt}: StackDeps): string {
  const named =
    days.length === 7
      ? t('stack.days.every')
      : days.length === 5 && WEEKDAYS.every(d => days.includes(d))
        ? t('stack.days.weekdays')
        : days.map(day => t('car.dayShort', {day})).join(', ');
  return t('stack.days.at', {days: named, time: fmt.clock(hours, minutes)});
}

export const chargingOvernight: StackRule = {
  key: 'car',
  run: ({car, power, now}, deps) => {
    const {t, fmt} = deps;
    if (!car?.plugged || car.home === false || !inHours(fmt.hourNow(now), NIGHT.from, NIGHT.chargeTo)) return [];
    const p = power.ev;
    const rows = [
      ...(p !== null && p > CHARGING_SHOWN_KW ? [{label: t('stack.power'), value: `${fmt.fixed(p, 1)} kW`}] : []),
      ...(car.range !== null ? [{label: t('stack.range'), value: `${fmt.integer(car.range)} km`}] : []),
      ...(car.limit ? [{label: t('stack.limit'), value: `${fmt.integer(car.limit)}%`}] : []),
    ];
    const departure = car.departureOn && car.schedule ? departureWords(car.schedule, deps) : null;
    return [
      card({
        key: 'car',
        icon: 'car',
        label: car.name || t('stack.car'),
        color: 'var(--c-ev)',
        right: t(car.charging ? 'stack.charge.charging' : 'stack.charge.plugged'),
        go: {sheet: 'car.detail'},
        body: [{kind: 'ring', percent: car.soc, limit: car.limit, color: 'var(--ok)', size: 124, rows}],
        foot: departure
          ? t('stack.charge.departure', {schedule: departure})
          : car.charging
            ? t('stack.charge.to', {n: car.limit || 100})
            : t('stack.charge.notNow'),
      }),
    ];
  },
};

export const energyToday: StackRule = {
  key: 'energy',
  run: ({history, now}, {t, fmt}) => {
    if (!history || !inHours(fmt.hourNow(now), ...ENERGY_HOURS)) return [];
    const today = history.flow.filter(row => fmt.isoDay(row[0]) === fmt.isoDay(now));
    const sumOf = (pick: (row: FlowRow) => number) => today.reduce((sum, row) => sum + (pick(row) || 0), 0);
    const parts = [
      sumOf(([, , , heat]) => heat),
      sumOf(([, , wh]) => wh),
      sumOf(([, ev]) => ev),
      sumOf(([, , , , rest]) => rest),
    ];
    const total = parts.reduce((a, b) => a + b, 0) || 1;
    const share = (v: number) => Math.round((v / total) * 100);
    return [
      card({
        key: 'energy',
        icon: 'bolt',
        label: t('stack.energy.label'),
        color: 'var(--m-orange)',
        right: t('stack.energy.soFar'),
        go: {sheet: 'energy.detail'},
        filler: true,
        body: [
          big(fmt.fixed(history.totals.today, 1), 'kWh'),
          ...(today.length
            ? [
                {
                  kind: 'bar' as const,
                  parts: parts.flatMap((v, i) => (v > 0 ? [{share: (v / total) * 100, color: ENERGY_COLORS[i]}] : [])),
                },
              ]
            : []),
        ],
        foot: today.length
          ? t('stack.energy.split', {heat: share(parts[0]), water: share(parts[1]), car: share(parts[2])})
          : '',
      }),
    ];
  },
};

/** The who's-home filler: someone's person entity says when they came or left, no came-or-left card shows, in the waking hours. */
export const whoFiller: StackRule = {
  key: 'whoFiller',
  run: (inputs, deps) =>
    movedPeople(inputs).length && !movedLately(inputs) && inHours(deps.fmt.hourNow(inputs.now), ...WHO_FILLER_HOURS)
      ? [whoCard(inputs, deps, true)]
      : [],
};

/** The chain, in the legacy stack's order: red first, then amber, the rest, and the two fillers last. */
export const RULES: readonly StackRule[] = [
  doorOpen,
  lightsUnreachable,
  weatherWarning,
  carLow,
  presenceFrozen,
  sunrise,
  reminders,
  peak,
  nowPlaying,
  cameOrLeft,
  agenda,
  awayMode,
  poorAir,
  tomorrow,
  chargingOvernight,
  energyToday,
  whoFiller,
];

/** Every card that applies at these inputs, in the chain's order; none when the stack is switched off, as the legacy pick was null. */
export function stackCards(inputs: StackInputs, deps: StackDeps): StackCard[] {
  if (!inputs.stack.on) return [];
  return RULES.flatMap(rule => rule.run(inputs, deps));
}
