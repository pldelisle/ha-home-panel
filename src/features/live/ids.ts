// liveIds: the entity ids the header's Status checks read, so the store tells the pill (#256) only when one changes; #255 adds the activities'.
// Pattern: the union of what `readLive` reads (the config's integration sensors, each room's three, the car's entities, each door and
// motion sensor and its battery) with no id twice, after the store's per-element subscription (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the providers and the house do).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {doorMotionSensors} from '../../providers/door-motion.ts';
import {carEntityIds, findCar} from '../../providers/fordpass.ts';

/** The sensors of the integrations the header reads, by config key: the flow, Hilo, Hydro-Québec, the heat pump, the warnings, the Wallbox. */
const CONFIG_KEYS = [
  'grid',
  'whP',
  'evP',
  'hp',
  'rate',
  'rateLow',
  'rateMed',
  'rateReward',
  'defi',
  'gateway',
  'hq',
  'hqPeak',
  'hqUpcoming',
  'warnings',
  'wbStatus',
  'wbAmps',
  'wbPause',
  'wbLock',
  'wbPrice',
] as const;

/** The ids the Status checks read; none before Home Assistant's first states. */
export function liveIds({hass, config, names}: Pick<PanelStore, 'hass' | 'config' | 'names'>): string[] {
  if (!hass) return [];
  const car = findCar(hass.states);
  const ids = [
    ...CONFIG_KEYS.map(key => config.entities[key]),
    ...config.rooms.flatMap(room => [room.climate, room.power, room.temp]),
    ...(car ? carEntityIds(car) : []),
    ...doorMotionSensors(hass.states, registriesOf(hass), names).flatMap(sensor => [sensor.id, sensor.batteryId]),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
