// The line under the header's greeting, Home's one title (#426): today's date, then the average inside and the outside temperature, then how many
// Status checks need attention, as the legacy `renderHeader` and `renderPaneSubs` wrote them (deleted in #269).
// Pattern: a pure model (Fowler, Presentation Model) over the provider's `readHomeTemperatures` (src/providers/home-temperatures.ts, since #276).
// Must not: draw, read the clock (`now` is given), or read an entity.
import {temperatureFigure, type Formatters} from '../core/i18n/format.ts';
import type {Translate} from '../core/i18n/messages.ts';
import type {HomeTemperatures} from '../providers/home-temperatures.ts';

export interface HomeLineInputs extends Partial<HomeTemperatures> {
  /** Today, which the line opens with; absent, it says no date. */
  now?: number;
  /** How many Status checks need attention; none is said when 0 or absent. */
  attention?: number;
}

/** "Saturday, November 7 · 20.6° inside · 4.2° outside · 1 item needs attention", each part left out when it has nothing to say. */
export function homeLine(
  {now, inside = null, outside = null, attention = 0}: HomeLineInputs,
  {t, fmt}: {t: Translate; fmt: Pick<Formatters, 'dateLong' | 'fixed'>},
): string {
  const date = now === undefined ? '' : fmt.dateLong(now);
  // French writes the weekday lower case; the line starts with it, upper case, as the rewrite layer wrote it
  return [
    date.charAt(0).toUpperCase() + date.slice(1),
    inside === null ? '' : t('home.inside', {n: temperatureFigure(fmt, inside)}),
    outside === null ? '' : t('home.outside', {n: temperatureFigure(fmt, outside)}),
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
