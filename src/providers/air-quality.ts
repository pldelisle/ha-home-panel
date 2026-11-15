// The air-quality scales and how a room is rated against them: pollutant bands, the US AQI bands and the room's level.
// Pattern: pure functions over plain data (Bernhardt, functional core), in a provider because the smart stack reads the
// rating too and a feature cannot be imported by it (ADR 0025); the rules are the legacy `AQ`, `aqLevel`, `outLevel` and
// `roomAir`, deleted by #234. Bands: PM2.5 US EPA daily, CO2 ventilation guidance, VOC UBA, CO WHO 8-hour.
// Must not: word anything a person reads (the model does), read the clock, or know an integration (`mila.ts` does).
import type {AirRoomInputs} from './mila.ts';

/** -1: no reading. 0 good, 1 moderate, 2 poor. */
export type Level = -1 | 0 | 1 | 2;
export type Pollutant = 'pm2_5' | 'co2' | 'voc' | 'co';

/** Up to the first is good, up to the second moderate, above poor: µg/m³ for PM2.5 and VOC, ppm for CO2 and CO. */
export const AQ_BANDS: Record<Pollutant, readonly [number, number]> = {
  pm2_5: [12, 35],
  co2: [800, 1200],
  voc: [300, 3000],
  co: [9, 35],
};

/** The pollutants the bands rate, in the order the panel lists them. */
const POLLUTANTS = Object.keys(AQ_BANDS) as Pollutant[];

export interface Rated {
  k: Pollutant;
  /** Null when the sensor reports nothing. */
  v: number | null;
  level: Level;
}

export interface RoomRating {
  level: Level;
  /** Mila's own index on the US AQI scale; it decides the level when present. */
  milaIndex: number | null;
  /** The pollutants at the highest level above good; empty when every reading is good. */
  why: (Rated & {v: number})[];
  /** All four, with their readings, whatever their level. */
  pollutants: Rated[];
}

/** A pollutant's level against its bands, or -1 with no reading. */
export const aqLevel = (k: Pollutant, v: number | null): Level =>
  v === null ? -1 : v <= AQ_BANDS[k][0] ? 0 : v <= AQ_BANDS[k][1] ? 1 : 2;

/** The US AQI's bands: up to the first good, up to the second moderate, above poor; the outdoor chart shades the same two. */
export const OUTDOOR_BANDS: readonly [number, number] = [50, 100];

/** The outdoor index on the US scale against `OUTDOOR_BANDS`; no reading counts as good, as the legacy panel did. */
export const outdoorLevel = (aqi: number | null): 0 | 1 | 2 =>
  aqi === null || aqi <= OUTDOOR_BANDS[0] ? 0 : aqi <= OUTDOOR_BANDS[1] ? 1 : 2;

/**
 * A room's rating: Mila's own index when it has one (so the panel matches the Mila app), else the worst of the four
 * pollutants, and -1 when none reports. A missing reading is -1, never better than good.
 */
export function rateRoom({readings}: AirRoomInputs): RoomRating {
  const pollutants = POLLUTANTS.map((k): Rated => ({k, v: readings[k], level: aqLevel(k, readings[k])}));
  const worst = Math.max(-1, ...pollutants.map(p => p.level)) as Level;
  return {
    level: readings.airQuality === null ? worst : outdoorLevel(readings.airQuality),
    milaIndex: readings.airQuality,
    why: worst > 0 ? pollutants.filter((p): p is Rated & {v: number} => p.level === worst) : [],
    pollutants,
  };
}
