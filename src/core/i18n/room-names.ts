// The built-in room dictionary: common room and zone words in English and French, as data.
// Pattern: names are domain data, not code strings (Evans, Domain-Driven Design, on ubiquitous language), so the list
// ships as a table that grows by pull request; the resolver in names.ts matches it on the whole name, never on a part.
// Must not: hold logic, list a compound name (`Lampe du salon` needs a `names:` override) or read a locale.

/** One row per room word: the English reading, then the French one (equal when the word is the same in both). */
export const ROOM_NAMES: ReadonlyArray<readonly [en: string, fr: string]> = [
  ['Living room', 'Salon'],
  ['Kitchen', 'Cuisine'],
  ['Bedroom', 'Chambre'],
  ['Main bedroom', 'Chambre principale'],
  ['Office', 'Bureau'],
  ['Bathroom', 'Salle de bain'],
  ['Dining room', 'Salle à manger'],
  ['Laundry room', 'Salle de lavage'],
  ['Laundry', 'Buanderie'],
  ['Basement', 'Sous-sol'],
  ['Entrance', 'Entrée'],
  ['Hallway', 'Couloir'],
  ['Garage', 'Garage'],
  ['Outside', 'Extérieur'],
  ['Backyard', 'Cour'],
  ['Deck', 'Terrasse'],
  ['Vestibule', 'Vestibule'],
  ['Attic', 'Grenier'],
];
