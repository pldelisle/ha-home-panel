// A room as the panel lists it: its area and name, and the glyph its chip, row and header wear, guessed from the name.
// Pattern: a value type and a pure function over `guessIcon`, the table-driven guess (McConnell, Code Complete); a module of its own so the Home pane and
// the More sheet can draw a room without importing `rooms.ts`, which imports the registry, which imports the Home pane (a cycle).
// Must not: read the DOM, an entity or a locale, or draw: it returns a name.
import {guessIcon, type RoomIcon} from '../core/room-icons.ts';

/** One room of the sidebar: an area of Home Assistant with its display name. */
export interface Room {
  areaId: string;
  name: string;
}

/**
 * A room's icon: `guessIcon` of its name, except that a name it has no word for is the house, not the thermometer it falls back to
 * (that is Climate's icon, and `guessIcon` stays as Climate's baselines have it).
 */
export const roomIcon = (name: string): RoomIcon => {
  const icon = guessIcon(name);
  return icon === 'therm' ? 'house' : icon;
};
