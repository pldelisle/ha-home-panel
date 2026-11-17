// stackIds: the entity ids the smart stack's rules read, so the store tells the stack only when one changes.
// Pattern: the union of what `readStack` reads (the config's sensors for the alerts, the peaks, the power and Away, each room's three,
// the car's entities, the door sensors, the lights, the speakers, the calendars, who's home and the trackers its people follow, the
// purifiers' sensors) with no id twice, after the store's per-element subscription (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the providers and the house do).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {attributeOf} from '../../core/states.ts';
import {doorMotionSensors} from '../../providers/door-motion.ts';
import {carEntityIds, findCar} from '../../providers/fordpass.ts';
import {milaIds} from '../../providers/mila.ts';
import {presenceIds} from '../../providers/people.ts';

/** The sensors the rules read by config key: the four alert feeds, the peaks, the flow and Away. */
const CONFIG_KEYS = [
  'warnings',
  'watches',
  'advisories',
  'statements',
  'hq',
  'hqPeak',
  'hqUpcoming',
  'defi',
  'grid',
  'whP',
  'evP',
  'away',
] as const;

/** The domains whose every entity a rule may read: the lights, the speakers and the calendars. */
const DOMAINS = ['light.', 'media_player.', 'calendar.'];

/** The ids the stack's rules read; none before Home Assistant's first states. */
export function stackIds({hass, config, names}: Pick<PanelStore, 'hass' | 'config' | 'names'>): string[] {
  if (!hass) return [];
  const registries = registriesOf(hass);
  const car = findCar(hass.states);
  const people = presenceIds(hass.states, registries, config.people);
  const ids = [
    ...CONFIG_KEYS.map(key => config.entities[key]),
    ...config.rooms.flatMap(room => [room.climate, room.power, room.temp]),
    ...(car ? carEntityIds(car) : []),
    ...doorMotionSensors(hass.states, registries, names).map(sensor => sensor.id),
    ...Object.keys(hass.states).filter(id => DOMAINS.some(domain => id.startsWith(domain))),
    ...people,
    // the trackers the person entities follow: the "presence not updating" card
    ...people.map(id => attributeOf(hass.states, id, 'source')).filter((id): id is string => typeof id === 'string'),
    ...milaIds(registries),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
