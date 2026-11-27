// readLive: what the header's Status checks and live activities read of the house, composed from the providers.
// Pattern: a composition of readers at one place (ADR 0025): powerNow, hiloRates, hiloChallenge, hiloGateway, hydroQuebec, heatPump,
// warningCount, findCar and readCar, wallbox, doorMotionSensors, waterHeaterNow, infraAlerts and securityDigest;
// this is the one file that knows which providers the header reads.
// Must not: import a feature, word anything a person reads, read the clock (`now` is passed in), or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {doorMotionSensors, type SensorInputs} from '../../providers/door-motion.ts';
import {warningCount} from '../../providers/environment-canada.ts';
import {findCar, readCar, type CarInputs} from '../../providers/fordpass.ts';
import {heatPump, type HeatPumpInputs} from '../../providers/heat-pump.ts';
import {
  hiloChallenge,
  hiloGateway,
  hiloRates,
  type HiloChallenge,
  type HiloGateway,
  type HiloRates,
} from '../../providers/hilo.ts';
import {hydroQuebec, type HydroQuebecInputs} from '../../providers/hydro-quebec.ts';
import {
  infraAlerts,
  securityDigest,
  type InfraAlertsInputs,
  type SecurityDigestInputs,
} from '../../providers/infra-monitoring.ts';
import {powerNow, waterHeaterNow, type PowerNow, type WaterHeaterNow} from '../../providers/power.ts';
import {wallbox, type WallboxInputs} from '../../providers/wallbox.ts';

export interface LiveInputs {
  /** The instant the rules are read at, in milliseconds. */
  now: number;
  /** The live flow: each room's thermostat (present, available, its name's inputs) and, for #255, the loads. */
  power: PowerNow;
  hilo: {rates: HiloRates; challenge: HiloChallenge | null; gateway: HiloGateway | null};
  /** Null where the house has no Hydro-Québec integration. */
  hydroQuebec: HydroQuebecInputs | null;
  /** Null where the config names no heat pump. */
  heatPump: HeatPumpInputs | null;
  /** Environment Canada's warnings count; null where the sensor is unset or reads no number. */
  weatherWarnings: number | null;
  /** Null where the house has no FordPass car. */
  car: CarInputs | null;
  wallbox: WallboxInputs;
  /** The door and motion sensors: doors first, then motion, each by name. */
  sensors: SensorInputs[];
  /** The water heater's power in kW and its temperature; `powerChangedAt` is when its power sensor last changed (a cycle's start when no history says better). */
  waterHeater: WaterHeaterNow;
  /** The car's battery capacity in kWh from the config, for the time to full when Ford gives none; null when unset. */
  carBatteryKwh: number | null;
  /** The alerts Prometheus fires, through Home Assistant; null where the house has no alerts sensor. */
  infraAlerts: InfraAlertsInputs | null;
  /** The nightly security digest; null where the house has none. */
  securityDigest: SecurityDigestInputs | null;
}

/** The inputs of the house at these states, at `now`. */
export function readLive(
  states: HassEntities,
  registries: Registries,
  config: ResolvedConfig,
  names: Names,
  now: number,
): LiveInputs {
  const car = findCar(states);
  return {
    now,
    power: powerNow(states, config),
    hilo: {
      rates: hiloRates(states, config),
      challenge: hiloChallenge(states, config),
      gateway: hiloGateway(states, config),
    },
    hydroQuebec: hydroQuebec(states, config),
    heatPump: heatPump(states, registries, config),
    weatherWarnings: warningCount(states, config),
    car: car ? readCar(states, config, names, car) : null,
    wallbox: wallbox(states, config),
    sensors: doorMotionSensors(states, registries, names),
    waterHeater: waterHeaterNow(states, config),
    carBatteryKwh: config.car.battery_kwh || null,
    infraAlerts: infraAlerts(states, config),
    securityDigest: securityDigest(states, config),
  };
}
