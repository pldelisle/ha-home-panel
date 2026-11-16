// The name a room is shown under, from the inputs a provider gives (its key, the config's name, its thermostat's own name).
// Pattern: a pure function at the language seam (ADR 0013), the rule of the legacy `roomName()` and `roomNameEn()`: the config's name, else
// "<Name>'s bedroom" for a Hilo "Chambre de <Name>", else the thermostat's name; in French, the thermostat's own name first, since Hilo names
// its thermostats in French. The resolver then reads the name it picked. The legacy `roomName()` calls it until #256; `roomNameEn()` went in #241.
// Must not: read the states or the registry, take a language from anywhere but the caller, or word anything but through `t`.
import type {Names} from './names.ts';
import type {Translate} from './messages.ts';

/** What the rule reads of a room: the provider's `RoomPower` has these. */
export interface RoomNameInputs {
  /** The room's key. */
  key: string;
  /** The config's `name` for the room; null when the thermostat names it. */
  configuredName: string | null;
  /** The thermostat's `friendly_name`; `''` when it has none. */
  thermostatName: string;
}

export interface RoomNameDeps {
  names: Names;
  t: Translate;
  /** The profile's language (`fr`, `fr-CA`), as the store carries it. */
  language: string;
}

export function roomName(room: RoomNameInputs, {names, t, language}: RoomNameDeps): string {
  const own = room.thermostatName.replace(/^Thermostat\s*/i, '');
  if (/^fr\b/i.test(language) && own) return names.name(own);
  if (room.configuredName) return names.name(room.configuredName);
  const bedroom = room.thermostatName.match(/Chambre de (.+)$/i);
  return names.name(bedroom ? t('room.bedroomOf', {name: bedroom[1]}) : own || room.key);
}
