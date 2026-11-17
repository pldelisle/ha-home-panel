// The house's automations as Home Assistant states them, and today's runs still to come from their time and sun triggers.
// Pattern: an adapter below the features (ADR 0025), the rules of the legacy `auAutos()` and `auUpcoming()`; the legacy
// Automations tab (`src/auto.js`) reads both until the Automations pane does (#273), and a later composition (the Home
// pane's "Coming up", spec 24) may read the second.
// Must not: word anything a person reads (a name is the resolver's, a time is a number), or read the clock or the DOM.
import type {AutomationConfig} from '../core/ha.ts';
import type {HassEntities} from '../core/hass.ts';
import type {Formatters} from '../core/i18n/format.ts';
import type {Names} from '../core/i18n/names.ts';
import {isAvailable} from '../core/states.ts';

export interface Automation {
  entity: string;
  /** The config's `id` as text, which the traces are kept under; undefined for an automation written with none. */
  item: string | undefined;
  /** The display name, through the resolver. */
  name: string;
  on: boolean;
  /** `last_triggered`, as Home Assistant gives it; null when it never ran. */
  last: string | null;
  /** How many runs are going now. */
  current: number;
}

/** Every `automation.*` entity of `states`, in the order Home Assistant gives them. */
export function automationsOf(states: HassEntities, names: Names): Automation[] {
  return Object.values(states)
    .filter(s => s.entity_id.startsWith('automation.'))
    .map(s => ({
      entity: s.entity_id,
      item:
        typeof s.attributes.id === 'string' || typeof s.attributes.id === 'number'
          ? String(s.attributes.id)
          : undefined,
      name: names.name(s.entity_id),
      on: s.state === 'on',
      last: typeof s.attributes.last_triggered === 'string' ? s.attributes.last_triggered : null,
      current: Number(s.attributes.current) || 0,
    }));
}

/** A value that may be one item or a list of them, as a list: Home Assistant's configs allow both. */
export const asList = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** The local minutes since midnight of an instant, in the formatters' zone: `16:07` is 967. */
export function minutesOfDay(t: number | string, fmt: Formatters): number {
  const [h, m] = fmt.time24(new Date(t)).split(':').map(Number);
  return h * 60 + m;
}

/** The sun's next rising and setting, from `sun.sun`'s attributes or, failing those, the two sun sensors. */
export interface SunNext {
  nextRising: string | null;
  nextSetting: string | null;
}

/** The entities `sunNext` reads: a reader of it listens to these. */
export const SUN_IDS = ['sun.sun', 'sensor.sun_next_rising', 'sensor.sun_next_setting'] as const;

export function sunNext(states: HassEntities): SunNext {
  const read = (attribute: string, sensor: string): string | null => {
    const v: unknown = states['sun.sun']?.attributes[attribute];
    if (typeof v === 'string' && v) return v;
    const s = states[sensor];
    return isAvailable(s) ? s.state : null;
  };
  return {
    nextRising: read('next_rising', 'sensor.sun_next_rising'),
    nextSetting: read('next_setting', 'sensor.sun_next_setting'),
  };
}

export interface Upcoming {
  item: string;
  name: string;
  /** The instant it runs, in milliseconds. */
  t: number;
  /** Its local minutes since midnight. */
  mins: number;
}

/** A trigger's kind: `trigger` since Home Assistant 2024.10, `platform` before. */
export const triggerKind = (t: Record<string, unknown>): unknown => t.trigger ?? t.platform;

/**
 * The runs still to come today of the enabled automations whose config is known: each `time` trigger's clock times after
 * `now`, and each `sun` trigger whose next event falls later today; sorted by time. `configs` is keyed by item id.
 */
export function upcomingRuns(
  configs: Record<string, AutomationConfig | null | undefined>,
  automations: Automation[],
  now: number,
  sun: SunNext,
  fmt: Formatters,
): Upcoming[] {
  const today = fmt.isoDay(now),
    nowM = minutesOfDay(now, fmt),
    out: Upcoming[] = [];
  for (const a of automations) {
    const config = a.item ? configs[a.item] : null;
    if (!a.item || !config || !a.on) continue;
    for (const t of asList(config.triggers ?? config.trigger) as Record<string, unknown>[]) {
      const kind = triggerKind(t);
      if (kind === 'time')
        for (const at of asList(t.at)) {
          const m = /^(\d{1,2}):(\d{2})/.exec(String(at));
          if (!m) continue;
          const mins = Number(m[1]) * 60 + Number(m[2]);
          if (mins > nowM) out.push({item: a.item, name: a.name, t: now + (mins - nowM) * 60000, mins});
        }
      if (kind === 'sun') {
        const v = t.event === 'sunrise' ? sun.nextRising : sun.nextSetting;
        if (v && fmt.isoDay(Date.parse(v)) === today && Date.parse(v) > now)
          out.push({item: a.item, name: a.name, t: Date.parse(v), mins: minutesOfDay(v, fmt)});
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
