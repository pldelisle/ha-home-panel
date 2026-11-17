// The departure schedule's draft: the days, the time and the cabin temperature a person edits before anything is sent, and the rules around it.
// Pattern: edit locally, validate, send once (a form draft; Fowler's Unit of Work in miniature): plain data, replaced by new values, so the element that holds it, `<hp-car-comfort>`, owns the one copy.
// The rules are the legacy `depState`, `depDesc` and the save branch of `carControl` (deleted in #253) and `clockTime` (deleted in #269); the words are catalog messages, the time of day is `fmt.clock`'s.
// Must not: send a command, read the store or the clock, or write a time of day or a day's name by hand.
import type {Formatters} from '../../core/i18n/format.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Schedule} from '../../providers/fordpass.ts';

/** The week as Ford names its days, in the order the day buttons run. */
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/** Ford's four cabin settings for a departure. */
export type CabinTemperature = 'low' | 'medium' | 'high' | 'off';

export interface ScheduleDraft {
  /** The days as Ford names them, in the order they were chosen (the description lists them so). */
  days: string[];
  /** `HH:MM` as a time field holds it; `''` once the field is cleared. */
  time: string;
  /** Ford does not report the cabin setting of a saved schedule, so a draft starts with none and cannot be saved until one is picked. */
  temp: CabinTemperature | null;
}

/** The time a draft starts at when Ford has no schedule. */
const DEFAULT_TIME = '08:00';
const WEEKDAYS = DAYS.slice(0, 5);
const MINUTES_PER_DAY = 24 * 60;

const twoDigits = (n: number) => String(n).padStart(2, '0');

/** What a saved schedule is, as one value: the draft starts over when it changes, and not before. */
export function scheduleKey(schedule: Schedule | null): string {
  return schedule ? `${schedule.days.join(',')}@${schedule.hours}:${schedule.minutes}` : '';
}

/** The draft that starts from what Ford saved: its days and time, no cabin setting; `08:00` and no days when it saved nothing. */
export function draftFromSchedule(schedule: Schedule | null): ScheduleDraft {
  if (!schedule) return {days: [], time: DEFAULT_TIME, temp: null};
  return {days: [...schedule.days], time: `${twoDigits(schedule.hours)}:${twoDigits(schedule.minutes)}`, temp: null};
}

/**
 * The draft after Ford's saved schedule changed: the days and the time are Ford's again, and the cabin setting is what the person picked, since Ford does not report it
 * (a save followed by Ford's own update must not blank the choice that was just sent); none for a draft that was never begun.
 */
export function redraft(previous: ScheduleDraft | null, saved: Schedule | null): ScheduleDraft {
  return {...draftFromSchedule(saved), temp: previous?.temp ?? null};
}

/** The draft with `day` chosen if it was not, and left out if it was. */
export function toggleDay(draft: ScheduleDraft, day: string): ScheduleDraft {
  return {...draft, days: draft.days.includes(day) ? draft.days.filter(d => d !== day) : [...draft.days, day]};
}

/** A time of day as a field holds it: `HH:MM`, read into its two numbers; null for a field that is cleared or holds no time. */
function parseTime(time: string): {hours: number; minutes: number} | null {
  const [hours, minutes] = time.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? {hours, minutes} : null;
}

/** A time of day rounded to Ford's five-minute steps: `23:58` is `00:00`. */
export interface RoundedTime {
  hour: number;
  minute: number;
  /** `HH:MM`, for the field to show. */
  time: string;
}

/** `time` rounded to the nearest five minutes; null for a field that is cleared or holds no time (the legacy panel sent `NaN` for it), which `validate` refuses. */
export function roundToFive(time: string): RoundedTime | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  const total = (Math.round((parsed.hours * 60 + parsed.minutes) / 5) * 5) % MINUTES_PER_DAY;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return {hour, minute, time: `${twoDigits(hour)}:${twoDigits(minute)}`};
}

/** The draft with its time as Ford takes it, in five-minute steps, which is what a save sends and what the field then shows; a time that is not one is left as it is. */
export function withFiveMinutes(draft: ScheduleDraft): ScheduleDraft {
  const rounded = roundToFive(draft.time);
  return rounded ? {...draft, time: rounded.time} : draft;
}

/**
 * The key of the toast that says what is missing before the draft can be saved; null when it can. The cabin setting is asked for first, then the days, then the time: a cleared
 * time field has no hour to send (the legacy panel sent `NaN`).
 */
export function validate(draft: ScheduleDraft): MessageKey | null {
  if (!draft.temp) return 'car.pickTemperature';
  if (!draft.days.length) return 'car.pickDay';
  if (!roundToFive(draft.time)) return 'car.pickTime';
  return null;
}

/** The days in words: every day, weekdays (Monday to Friday and no others), no days, or the chosen days' abbreviations. */
const daysWords = (days: readonly string[], t: Translate): string => {
  if (days.length === 7) return t('car.everyDay');
  if (days.length === WEEKDAYS.length && WEEKDAYS.every(day => days.includes(day))) return t('car.weekdays');
  return days.map(day => t('car.dayShort', {day})).join(', ') || t('car.noDays');
};

/**
 * What the draft says it will do, `weekdays at 8:30 am`: the days, and the time the way the household's language writes it
 * (`8 h 30`); a cleared time field names no time, only the days. Read by `describe` and by the toast that says a schedule was saved.
 */
export function scheduleWords(draft: ScheduleDraft, fmt: Pick<Formatters, 'clock'>, t: Translate): string {
  const days = daysWords(draft.days, t);
  const parsed = parseTime(draft.time);
  return parsed ? t('car.at', {days, time: fmt.clock(parsed.hours, parsed.minutes)}) : days;
}

/** The departure switch's line: `On · weekdays at 8:30 am` while it is on, `Off · weekdays at 8:30 am saved` while it is off. */
export function describe(draft: ScheduleDraft, on: boolean, fmt: Pick<Formatters, 'clock'>, t: Translate): string {
  return t(on ? 'car.departureOn' : 'car.departureOff', {when: scheduleWords(draft, fmt, t)});
}
