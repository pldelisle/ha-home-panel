// clockModel: the idle clock's words at an instant: the time with its day period, the long date, the temperatures, the condition's
// icon, and the next sunrise or sunset.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store, and
// words every message through `deps.t` and `deps.fmt`. The wording is the legacy `renderIdle`'s, deleted by #276.
// Must not: import the DOM, the kit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import {conditionName} from '../../core/i18n/condition-name.ts';
import {temperatureFigure, type Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import {conditionWordsOf} from '../../providers/environment-canada.ts';
import type {ClockInputs} from './inputs.ts';

export interface ClockViewModel {
  /** "4:07" and "pm" in English (the time split on its space); French has the 24-hour time and no period. */
  time: {main: string; suffix: string};
  /** "Saturday, November 7"; French writes "samedi 7 novembre". */
  date: string;
  /** "20.8° inside · 3.1° outside", each part left out when it has no number; null when neither has. */
  temps: string | null;
  /** The condition's icon, by day or night, with its name for a screen reader; null with no condition. */
  icon: {condition: string; day: boolean; label: string} | null;
  /** "Sunrise 7:02 am": the next of today's sunrise, today's sunset and tomorrow's sunrise; null when that one never comes. */
  nextSun: string | null;
}

export interface ClockDeps {
  t: Translate;
  fmt: Pick<Formatters, 'time' | 'time24' | 'dateLong' | 'fixed'>;
  isFrench: boolean;
}

export function clockModel(inputs: ClockInputs, {t, fmt, isFrench}: ClockDeps): ClockViewModel {
  const {now, inside, outside, condition} = inputs;
  const [main, suffix = ''] = isFrench ? [fmt.time24(now)] : fmt.time(now).split(' ');
  const temps = [
    inside === null ? '' : t('clock.inside', {n: temperatureFigure(fmt, inside)}),
    outside === null ? '' : t('clock.outside', {n: temperatureFigure(fmt, outside)}),
  ]
    .filter(Boolean)
    .join(' · ');
  const next = nextSunEvent(inputs);
  // Environment Canada's words have a message of their own; Home Assistant's are the catalog's, any other word is capitalised
  const words = conditionWordsOf(condition);
  return {
    time: {main, suffix},
    date: fmt.dateLong(now),
    temps: temps || null,
    icon: condition ? {condition, day: inputs.sunUp, label: words ? t(words) : conditionName(condition, t)} : null,
    nextSun: next && t(next.key, {time: fmt.time(next.at)}),
  };
}

/** Before sunrise the sunrise, before sunset the sunset, then tomorrow's sunrise. */
function nextSunEvent({now, sunrise, sunset, tomorrowSunrise}: ClockInputs) {
  const [key, at] =
    sunrise !== null && now < sunrise
      ? (['clock.sunrise', sunrise] as const)
      : sunset !== null && now < sunset
        ? (['clock.sunset', sunset] as const)
        : (['clock.sunrise', tomorrowSunrise] as const);
  return at === null ? null : {key, at};
}
