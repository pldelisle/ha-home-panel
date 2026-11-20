// The sensor catalog: the sensors a question may be about, as the names and kinds the model is told and the map the panel keeps back.
// Pattern: an anti-corruption layer (Evans, DDD) between the house and a model, built from the providers' reads and never from a
// feature (ADR 0025); a handle (`temp.office`, `power.grid`) is a stable key, so a hallucinated sensor is a parse error by construction
// (ADR 0040, "The model plans, the panel computes"). Spec 29, "The sensor catalog". This slice fills the `measure` entries.
// Must not: send or hold an entity id in an entry, a reading or a state value, word a name but through `t` and the name resolver, or read the clock.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities} from '../../core/hass.ts';
import {roomName, type RoomNameDeps} from '../../core/i18n/room-name.ts';
import {textAttributeOf} from '../../core/states.ts';
import type {PowerNow} from '../../providers/power.ts';

/** More sensors than this are not offered to a model: the first ones, in provider order, are kept. */
export const ASK_CATALOG_CAP = 60;

/** `binary` is open or closed, on or off, home or away; `measure` a reading that goes up and down; `meter` an energy total that only grows. */
export type SensorKind = 'binary' | 'measure' | 'meter';

/** A short stable handle, `temp.office`: not an entity id, and it does not change when a display name does. */
export type CatalogKey = string;

/** What a model is told about one sensor. */
export interface CatalogEntry {
  key: CatalogKey;
  /** The display name in the panel's language. */
  name: string;
  kind: SensorKind;
  /** What a reading is measured in: `°`, `W`, `kW`. */
  unit: string;
}

export interface Catalog {
  entries: CatalogEntry[];
  /** The map from a handle to the entity whose history answers it: it stays on the panel's side and is never sent. */
  entityOf: ReadonlyMap<CatalogKey, string>;
  /** How many sensors the cap left out; the config check warns when it is not zero. */
  omitted: number;
}

/** What the catalog reads of the house: the live flow the Power provider gives, and the states for each entity's own unit. */
export interface AskReads {
  power: PowerNow;
  states: HassEntities;
}

/** A name or id made into a handle's second half: lower case, letters and digits, one underscore between runs of anything else. */
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * The catalog of a house: the rooms' temperatures, then the live power readings, minus what `ask.exclude` lists, cut at the cap.
 * `names` is what a room's name needs (the resolver, `t` and the language); the sensors the live flow reads are named here.
 */
export function askCatalog(
  reads: AskReads,
  names: RoomNameDeps,
  config: Pick<ResolvedConfig, 'ask' | 'entities' | 'rooms'>,
): Catalog {
  const found: [CatalogEntry, string][] = [];
  const add = (key: CatalogKey, name: string, unit: string, entity: string) => {
    if (!found.some(([entry]) => entry.key === key)) found.push([{key, name, kind: 'measure', unit}, entity]);
  };
  const {entities} = config;
  for (const room of reads.power.rooms) {
    const spec = config.rooms.find(candidate => candidate.climate === room.climate);
    if (spec && (room.present || room.temperature !== null))
      add(`temp.${slug(room.key)}`, roomName(room, names), '°', spec.temp);
  }
  const unitOf = (id: string) => textAttributeOf(reads.states, id, 'unit_of_measurement') ?? 'kW';
  const flow: [string, number | null, string | null, 'grid' | 'waterHeater' | 'ev'][] = [
    ['power.grid', reads.power.grid, entities.gridLive ?? entities.grid, 'grid'],
    ['power.water_heater', reads.power.waterHeater, entities.whP, 'waterHeater'],
    ['power.ev', reads.power.ev, entities.evP, 'ev'],
  ];
  for (const [key, reading, entity, role] of flow)
    if (reading !== null && entity) add(key, names.t(`ask.sensor.${role}`), unitOf(entity), entity);
  const excluded = new Set(config.ask?.exclude);
  const kept = found.filter(([, entity]) => !excluded.has(entity));
  const cut = kept.slice(0, ASK_CATALOG_CAP);
  return {
    entries: cut.map(([entry]) => entry),
    entityOf: new Map(cut.map(([entry, entity]) => [entry.key, entity])),
    omitted: kept.length - cut.length,
  };
}
