// The departure schedule's draft: where it starts, a day toggled, the time rounded to five minutes, what is missing before it can be saved, and its
// line in words in both languages (the legacy `depDesc`), with the time as the household writes it: `8:30 am`, `8 h 30`.
import {describe, expect, test} from 'vitest';
import {
  describe as describeDraft,
  draftFromSchedule,
  roundToFive,
  scheduleKey,
  scheduleWords,
  toggleDay,
  validate,
  withFiveMinutes,
  type ScheduleDraft,
} from '../../../../src/features/car/schedule.ts';
import {depsOf, fullHouse} from '../media/support.ts';

const en = depsOf(fullHouse, 'en');
const fr = depsOf(fullHouse, 'fr');
const draft = (days: string[], time = '08:30', temp: ScheduleDraft['temp'] = null): ScheduleDraft => ({
  days,
  time,
  temp,
});
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

describe('draftFromSchedule', () => {
  test("starts from Ford's saved days and time, with no cabin setting (Ford does not report it)", () => {
    expect(draftFromSchedule({days: ['friday', 'monday'], hours: 7, minutes: 5})).toEqual({
      days: ['friday', 'monday'],
      time: '07:05',
      temp: null,
    });
  });

  test('is 08:00 with no days when Ford saved nothing, and does not share its days with the schedule', () => {
    expect(draftFromSchedule(null)).toEqual({days: [], time: '08:00', temp: null});
    const schedule = {days: ['monday'], hours: 8, minutes: 0};
    draftFromSchedule(schedule).days.push('friday');
    expect(schedule.days).toEqual(['monday']);
  });
});

describe('toggleDay', () => {
  test('adds a day at the end and takes it out again, and leaves the draft it was given alone', () => {
    const start = draft(['monday']);
    const added = toggleDay(start, 'friday');
    expect(added.days).toEqual(['monday', 'friday']);
    expect(toggleDay(added, 'monday').days).toEqual(['friday']);
    expect(start.days).toEqual(['monday']);
  });

  test('keeps the time and the cabin setting', () => {
    expect(toggleDay(draft([], '06:15', 'high'), 'monday')).toEqual({days: ['monday'], time: '06:15', temp: 'high'});
  });
});

describe('roundToFive', () => {
  test.each([
    ['08:00', 8, 0, '08:00'],
    ['08:02', 8, 0, '08:00'],
    ['08:03', 8, 5, '08:05'],
    ['08:58', 9, 0, '09:00'],
    ['23:58', 0, 0, '00:00'],
    ['23:52', 23, 50, '23:50'],
    ['23:57', 23, 55, '23:55'],
    ['00:00', 0, 0, '00:00'],
  ])('%s is %i h %i', (time, hour, minute, text) => {
    expect(roundToFive(time)).toEqual({hour, minute, time: text});
  });

  test('is null for a field that is cleared or holds no time (the legacy panel sent NaN)', () => {
    expect([roundToFive(''), roundToFive('soon'), roundToFive('08')]).toEqual([null, null, null]);
  });
});

describe('validate', () => {
  test('asks for a cabin setting first, then a day, then a time, then lets it go', () => {
    expect(validate(draft([], '08:00', null))).toBe('car.pickTemperature');
    expect(validate(draft(['monday'], '08:00', null))).toBe('car.pickTemperature');
    expect(validate(draft([], '08:00', 'off'))).toBe('car.pickDay');
    expect(validate(draft(['monday'], '08:00', 'off'))).toBeNull();
    expect(validate(draft([], '', 'off'))).toBe('car.pickDay');
  });

  test('refuses a cleared time field: the legacy panel sent `NaN` for it', () => {
    expect(validate(draft(['monday'], '', 'off'))).toBe('car.pickTime');
    expect(validate(draft(['monday'], 'not a time', 'off'))).toBe('car.pickTime');
  });
});

describe('withFiveMinutes', () => {
  test('puts the time in five-minute steps, which is what a save sends and the field then shows', () => {
    expect(withFiveMinutes(draft(['monday'], '08:03', 'off'))).toEqual(draft(['monday'], '08:05', 'off'));
    expect(withFiveMinutes(draft(['monday'], '23:58', 'off')).time).toBe('00:00');
  });

  test('leaves a draft with no time as it is, and hands back the draft it was given', () => {
    const cleared = draft(['monday'], '', 'off');
    expect(withFiveMinutes(cleared)).toBe(cleared);
  });
});

describe('scheduleKey', () => {
  test('is one value for a saved schedule, the same for the same days and time, and none for no schedule', () => {
    const saved = {days: ['monday', 'friday'], hours: 8, minutes: 30};
    expect(scheduleKey(saved)).toBe(scheduleKey({...saved, days: [...saved.days]}));
    expect(scheduleKey(saved)).not.toBe(scheduleKey({...saved, minutes: 35}));
    expect(scheduleKey(saved)).not.toBe(scheduleKey({...saved, days: ['monday']}));
    expect(scheduleKey(null)).toBe('');
    expect(scheduleKey(null)).not.toBe(scheduleKey(saved));
  });
});

describe('describe, in English', () => {
  const line = (d: ScheduleDraft, on = false) => describeDraft(d, on, en.fmt, en.t);

  test('every day, weekdays, a list, and no days', () => {
    expect(line(draft(WEEK))).toBe('Off · every day at 8:30 am saved');
    expect(line(draft(WEEK.slice(0, 5)))).toBe('Off · weekdays at 8:30 am saved');
    expect(line(draft(['friday', 'monday', 'sunday']))).toBe('Off · Fri, Mon, Sun at 8:30 am saved');
    expect(line(draft([]))).toBe('Off · no days at 8:30 am saved');
  });

  test('weekdays are Monday to Friday and no other five days; six days are a list', () => {
    expect(line(draft(['monday', 'tuesday', 'wednesday', 'thursday', 'saturday']))).toBe(
      'Off · Mon, Tue, Wed, Thu, Sat at 8:30 am saved',
    );
    expect(line(draft(['friday', 'thursday', 'wednesday', 'tuesday', 'monday']))).toBe(
      'Off · weekdays at 8:30 am saved',
    );
    expect(line(draft(WEEK.slice(0, 6)))).toBe('Off · Mon, Tue, Wed, Thu, Fri, Sat at 8:30 am saved');
  });

  test('a cleared time names no time, and a time that is not one does not throw', () => {
    expect(line(draft([], ''))).toBe('Off · no days saved');
    expect(line(draft(['monday'], ''))).toBe('Off · Mon saved');
    expect(line(draft(['monday'], 'soon'))).toBe('Off · Mon saved');
  });

  test('a switch that is on says On and has nothing saved to say', () => {
    expect(line(draft(WEEK.slice(0, 5)), true)).toBe('On · weekdays at 8:30 am');
  });

  test('the time is the field’s, in 12 hours', () => {
    expect(line(draft(['monday'], '00:05'))).toBe('Off · Mon at 12:05 am saved');
    expect(line(draft(['monday'], '13:45'))).toBe('Off · Mon at 1:45 pm saved');
  });

  test('a day Ford names that the panel does not know is said as it came', () => {
    expect(line(draft(['someday']))).toBe('Off · someday at 8:30 am saved');
  });
});

describe('describe, in French', () => {
  const line = (d: ScheduleDraft, on = false) => describeDraft(d, on, fr.fmt, fr.t);

  test('says 8 h 30, tous les jours, en semaine and the days in short form', () => {
    expect(line(draft(WEEK))).toBe('Désactivé · tous les jours à 8 h 30 enregistré');
    expect(line(draft(WEEK.slice(0, 5)), true)).toBe('Activé · en semaine à 8 h 30');
    expect(line(draft(['monday', 'sunday']))).toBe('Désactivé · lun., dim. à 8 h 30 enregistré');
    expect(line(draft([], ''))).toBe('Désactivé · aucun jour enregistré');
  });
});

describe('scheduleWords', () => {
  test('is the line’s days and time without the switch, for the toast that says it was saved', () => {
    expect(scheduleWords(draft(['monday', 'tuesday'], '06:00'), en.fmt, en.t)).toBe('Mon, Tue at 6:00 am');
    expect(scheduleWords(draft(['monday', 'tuesday'], '06:00'), fr.fmt, fr.t)).toBe('lun., mar. à 6 h');
  });
});
