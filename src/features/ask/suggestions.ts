// The suggested questions: up to three, one about a door, one about a room's temperature and one about a meter, each with the plan it stands for.
// Pattern: a rule-based specification over the catalog (Evans, DDD: Specification), pure; a suggestion carries its plan, so a tap needs no model: the panel already knows the shape of the answer
// (ADR 0040, "The model plans, the panel computes"). Spec 29, "The elements". The house's display name leads the line, so a name needs no article, no gender and no elision, in either language.
// Must not: ask anything, read the house or the clock, send a suggestion's words to a model, or build a plan the loader cannot run (each names a sensor of the catalog it was given).
import type {Translate} from '../../core/i18n/messages.ts';
import type {Catalog, CatalogEntry} from './catalog.ts';
import type {AnswerablePlan} from './model.ts';

/** One suggested question: the words on its button, and the plan a tap asks at once. */
export interface Suggestion {
  text: string;
  plan: AnswerablePlan;
}

/** The first door: a binary sensor whose handle says door, which a motion sensor (`motion.`) and a person (`home.`) do not. */
const isDoor = (entry: CatalogEntry): boolean => entry.kind === 'binary' && entry.key.startsWith('door.');

/** The first room temperature: a measure whose handle says temp, which a power reading (`power.`) is not. */
const isRoom = (entry: CatalogEntry): boolean => entry.kind === 'measure' && entry.key.startsWith('temp.');

/** The first meter. */
const isMeter = (entry: CatalogEntry): boolean => entry.kind === 'meter';

/** What was built for a catalog, and for the `t` it was worded with: the sheet asks at every render, and a catalog is built once when the sheet opens. */
const built = new WeakMap<object, {t: Translate; suggestions: Suggestion[]}>();

/** The suggestions of a house, in this order: a door, a room, a meter; a kind the house lacks is left out, and a house with none of them has none. Built once for a catalog and a `t`. */
export function askSuggestions(catalog: Pick<Catalog, 'entries'>, t: Translate): Suggestion[] {
  const known = built.get(catalog);
  if (known?.t === t) return known.suggestions;
  const suggestions = suggestionsOf(catalog, t);
  built.set(catalog, {t, suggestions});
  return suggestions;
}

function suggestionsOf(catalog: Pick<Catalog, 'entries'>, t: Translate): Suggestion[] {
  const {entries} = catalog;
  const door = entries.find(isDoor);
  const room = entries.find(isRoom);
  const meter = entries.find(isMeter);
  const all: (Suggestion | undefined)[] = [
    door && {
      text: t('ask.suggest.door', {name: door.name}),
      plan: {form: 'moments', sensor: door.key, period: 'this_week', test: {on: true}, longerThanMin: null},
    },
    room && {
      text: t('ask.suggest.temp', {name: room.name}),
      plan: {form: 'series', sensor: room.key, period: 'yesterday'},
    },
    meter && {
      text: t('ask.suggest.meter', {name: meter.name}),
      plan: {form: 'total', sensor: meter.key, period: 'last_week'},
    },
  ];
  return all.filter((suggestion): suggestion is Suggestion => suggestion !== undefined);
}
