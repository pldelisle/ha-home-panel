// todaysEvents: the calendars' events that start today and have not ended, by start. Literal calendars at a known instant. Home
// Assistant writes a calendar's times without a zone and the browser reads them in its own, so the test's day is the process's own
// local day too: the run passes in any zone.
import {expect, test} from 'vitest';
import {todaysEvents} from '../../../src/providers/calendar.ts';
import {registriesOf} from '../../../src/core/registry.ts';
import {entity} from '../fake-hass.ts';
import {houseOf} from '../features/media/support.ts';

const local = (text: string) => Date.parse(text.replace(' ', 'T'));
const NOW = local('2026-11-16 10:00:00');
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = {
  isoDay: (at: number | Date) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
};
const calendar = (id: string, start: string | null, end: string | null, extra: Record<string, unknown> = {}) =>
  entity(`calendar.${id}`, 'off', {start_time: start, end_time: end, ...extra});

test('keeps today’s events that have not ended, all-day ones included, by start; drops ended, tomorrow’s, hidden and unavailable ones', () => {
  const hass = houseOf(
    [['calendar.hidden', 'off', {start_time: '2026-11-16 11:00:00', end_time: '2026-11-16 12:00:00'}, {hidden: true}]],
    [
      calendar('dentist', '2026-11-16 14:30:00', '2026-11-16 15:00:00', {message: 'Dentist'}),
      calendar('holiday', '2026-11-16 00:00:00', '2026-11-17 00:00:00', {message: 'Holiday', all_day: true}),
      calendar('done', '2026-11-16 08:00:00', '2026-11-16 09:00:00', {message: 'Done'}),
      calendar('tomorrow', '2026-11-17 09:00:00', '2026-11-17 10:00:00', {message: 'Tomorrow'}),
      calendar('untitled', '2026-11-16 10:30:00', null),
      calendar('nothing', null, null),
      entity('calendar.down', 'unavailable', {start_time: '2026-11-16 11:00:00'}),
    ],
  );
  expect(todaysEvents(hass.states, registriesOf(hass), NOW, fmt)).toEqual([
    {
      id: 'calendar.holiday',
      message: 'Holiday',
      start: local('2026-11-16 00:00:00'),
      end: local('2026-11-17 00:00:00'),
      allDay: true,
    },
    // no end: its start is its end, still to come
    {
      id: 'calendar.untitled',
      message: null,
      start: local('2026-11-16 10:30:00'),
      end: local('2026-11-16 10:30:00'),
      allDay: false,
    },
    {
      id: 'calendar.dentist',
      message: 'Dentist',
      start: local('2026-11-16 14:30:00'),
      end: local('2026-11-16 15:00:00'),
      allDay: false,
    },
  ]);
});
