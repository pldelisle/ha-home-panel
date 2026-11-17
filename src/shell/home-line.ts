// The date line the header's greeting and the Home pane's heading share: today's date, then the average inside and the outside temperature,
// then (the pane's) how many Status checks need attention, as the legacy `renderHeader` and `renderPaneSubs` wrote them (deleted in #269).
// Pattern: a pure model with its reading beside it (Fowler, Presentation Model): `readHomeTemperatures` reads the store's states, `homeLine` words.
// Must not: draw, read the clock (`now` is given), or read an entity `homeTemperatureIds` does not list.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import type {Formatters} from '../core/i18n/format.ts';
import type {Translate} from '../core/i18n/messages.ts';
import {numberAttributeOf, numberOf} from '../core/states.ts';
import {powerNow} from '../providers/power.ts';

export interface HomeTemperatures {
  /** The rooms' average temperature, null when no room reads one. */
  inside: number | null;
  /** The weather entity's temperature, else the outdoor sensor's; null when neither reads. */
  outside: number | null;
}

/** What `readHomeTemperatures` reads: each room's thermostat and temperature sensor, the weather entity and the outdoor sensor. */
export function homeTemperatureIds(config: ResolvedConfig): string[] {
  const {weather, outT} = config.entities;
  return [...config.rooms.flatMap(room => [room.climate, room.temp]), weather, outT].filter((id): id is string => !!id);
}

export function readHomeTemperatures(states: HassEntities, config: ResolvedConfig): HomeTemperatures {
  const temps = powerNow(states, config)
    .rooms.map(room => room.temperature)
    .filter((t): t is number => t !== null);
  const {weather, outT} = config.entities;
  return {
    inside: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    outside: numberAttributeOf(states, weather, 'temperature') ?? numberOf(states, outT),
  };
}

export interface HomeLineInputs extends Partial<HomeTemperatures> {
  now: number;
  /** How many Status checks need attention; none is said when 0 or absent. */
  attention?: number;
}

/** "Saturday, November 7 · 20.6° inside · 4.2° outside · 1 item needs attention", each part left out when it has nothing to say. */
export function homeLine(
  {now, inside = null, outside = null, attention = 0}: HomeLineInputs,
  {t, fmt}: {t: Translate; fmt: Pick<Formatters, 'dateLong' | 'fixed'>},
): string {
  const date = fmt.dateLong(now);
  // French writes the weekday lower case; the line starts with it, upper case, as the rewrite layer wrote it
  return [
    date.charAt(0).toUpperCase() + date.slice(1),
    inside === null ? '' : t('home.inside', {n: fmt.fixed(inside, 1)}),
    outside === null ? '' : t('home.outside', {n: fmt.fixed(outside, 1)}),
    attention ? t('home.attention', {n: attention}) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The greeting's key by the hour of the house's day: night before 5, morning before noon, afternoon before 6 pm, then evening. */
export function greetingKey(
  hour: number,
): 'home.greeting.night' | 'home.greeting.morning' | 'home.greeting.afternoon' | 'home.greeting.evening' {
  return hour < 5
    ? 'home.greeting.night'
    : hour < 12
      ? 'home.greeting.morning'
      : hour < 18
        ? 'home.greeting.afternoon'
        : 'home.greeting.evening';
}

/** The first word of the user's name, each part after a hyphen upper case ("jean-luc tremblay" is "Jean-Luc"); empty without a name. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0].replace(/(^|-)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}
