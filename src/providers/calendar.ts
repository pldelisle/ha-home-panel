// Today's calendar events: the visible calendars' next event when it starts today and has not ended.
// Pattern: an adapter below the features (ADR 0025): the smart stack's morning agenda card reads it; the rule copies the legacy
// stack's agenda reading, which #265 and #266 move and delete. A calendar entity holds only its next event, so one per calendar.
// Must not: word anything a person reads, read the DOM or `hass` itself, or guess a day in any time zone but the formatters' own.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Formatters} from '../core/i18n/format.ts';
import {isHidden} from '../core/registry.ts';
import {attributeOf, isAvailable, textAttributeOf} from '../core/states.ts';

export interface CalendarEvent {
  /** `calendar.*`. */
  id: string;
  /** The event's title (`message`); null when the calendar gives none, and the reader names the calendar instead. */
  message: string | null;
  /** Its start, in epoch milliseconds. */
  start: number;
  /** Its end, in epoch milliseconds (its start when the calendar gives no end). */
  end: number;
  allDay: boolean;
}

/** Home Assistant writes a calendar's times as `2026-11-16 09:00:00`, local; `Date.parse` wants the `T`. */
const instant = (text: string): number => Date.parse(text.replace(' ', 'T'));

/** The events that start on `now`'s day (in the formatters' time zone) and end after `now`, by start. */
export function todaysEvents(
  states: HassEntities,
  registries: Registries,
  now: number,
  fmt: Pick<Formatters, 'isoDay'>,
): CalendarEvent[] {
  const today = fmt.isoDay(now);
  return Object.keys(states)
    .filter(id => id.startsWith('calendar.') && !isHidden(id, registries) && isAvailable(states[id]))
    .flatMap(id => {
      const start = textAttributeOf(states, id, 'start_time');
      if (!start) return [];
      const end = textAttributeOf(states, id, 'end_time') ?? start;
      return [
        {
          id,
          message: textAttributeOf(states, id, 'message'),
          start,
          end,
          allDay: attributeOf(states, id, 'all_day') === true,
        },
      ];
    })
    .filter(event => fmt.isoDay(instant(event.start)) === today && instant(event.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(event => ({...event, start: instant(event.start), end: instant(event.end)}));
}
