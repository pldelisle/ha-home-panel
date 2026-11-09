// A room's icon: the names a config may pick from, and a guess from the room's name (English or French) when it picks
// none. The legacy class draws the glyph each name stands for.
// Pattern: table-driven matching (McConnell, Code Complete, "Table-Driven Methods"): a word list per icon, tried in
// order, over the name without its accents.
// Must not: read the DOM, hass or a locale, or draw: it returns a name.

/** The icons a room can have. */
export const ROOM_ICONS = ['sofa', 'door', 'desk', 'bed', 'bath', 'drop', 'car', 'house', 'therm'] as const;
/** The icons a room can have (ROOM_ICONS). */
export type RoomIcon = (typeof ROOM_ICONS)[number];

/**
 * A room's icon from its name, when the config doesn't give one.
 * @param s the room's name, or a value of another type: what discovery has always made of a value it did not choose (a
 *   friendly name can be anything) is String() of it, and a falsy value is no name
 */
export const guessIcon = (s: unknown): RoomIcon => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the old resolver's coercion, kept: discovery keeps every rule
  const n = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return /bed|chambre|nursery|kid/.test(n)
    ? 'bed'
    : /bath|salle de bain|toilet/.test(n)
      ? 'bath'
      : /office|bureau|study|desk/.test(n)
        ? 'desk'
        : /powder|salle d.?eau|laundry|lavage/.test(n)
          ? 'drop'
          : /living|sejour|salon|family|lounge/.test(n)
            ? 'sofa'
            : /entr|hall|foyer|vestibul/.test(n)
              ? 'door'
              : /garage/.test(n)
                ? 'car'
                : 'therm';
};
