// peopleModel: the configured people in, the strings and flags Who's home places out: the header's chips and the Home card.
// Pattern: a pure view-model function, a humble object's other half (Meszaros, Fowler): it reads no clock, no `hass` and no store,
// words every message through `deps.t`, and takes the provider's `presence` as the contract (ADR 0025). The wording is the legacy
// `whoHtml` and the Home card's hint, deleted in #266 and #268.
// Must not: import the DOM, the kit or the shell, read the clock, or hold text the household reads (a catalog key says it).
import type {Translate} from '../../core/i18n/messages.ts';
import type {Person} from '../../providers/people.ts';

/** One person's chip: the name as the config gives it, and the word for where they are. */
export interface PersonChip {
  name: string;
  home: boolean;
  /** "home" or "away", lower case as the chip shows it. */
  state: string;
}

export interface PeopleViewModel {
  /** "Who's home": the chips' accessible name and the Home card's label. */
  label: string;
  /** One chip per configured person the trackers know, in the config's order; empty when none. */
  chips: PersonChip[];
  /** The Home card's hint when no one is tracked; null when someone is. */
  hint: string | null;
}

export function peopleModel(people: Person[], deps: {t: Translate}): PeopleViewModel {
  const {t} = deps;
  return {
    label: t('people.whosHome'),
    chips: people.map(({name, home}) => ({name, home, state: t(home ? 'people.home' : 'people.away')})),
    hint: people.length ? null : t('people.noOneTracked'),
  };
}
