// readEnergy: the live power, Hilo, Hydro-Québec, the Wallbox and the water heater of the house, read into the inputs the model takes.
// Pattern: a composition of readers (ADR 0025): the flow, the tier and the charger from the providers, the water heater from the config's two
// sensors, so the feature knows no integration's naming; the water heater's name is the resolver's, picked by the legacy `whName` rule.
// Must not: word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {hasState, kilowattsOf, numberOf, textAttributeOf} from '../../core/states.ts';
import {hiloChallenge, hiloPresent, hiloRates, hiloRewards, type HiloRates} from '../../providers/hilo.ts';
import {hydroQuebec, type HydroQuebecInputs} from '../../providers/hydro-quebec.ts';
import {powerNow, type PowerNow} from '../../providers/power.ts';
import {wallbox, type WallboxInputs} from '../../providers/wallbox.ts';

/** The water heater's own name is its sensor's, without the measurement ("Tank Temperature" is "Tank"): the legacy `whName`'s rule, deleted in #241. */
const MEASUREMENT = /\s*(water heater\s*)?(temperature|température|power|puissance)$/i;

export interface WaterInputs {
  /** The tank's temperature; null when its sensor is unset or reads nothing. */
  temperature: number | null;
  /** The heater's power in kW; null when its sensor is unset or reads nothing. */
  power: number | null;
  /** What the sensor is called without its measurement; empty when neither sensor has a name. */
  name: string;
  /** The house has a water heater: either sensor is in the states, whatever it reads. */
  present: boolean;
}

export interface EnergyInputs {
  power: PowerNow;
  hilo: HiloRates;
  /** The house has Hilo: its current-rate sensor is in the states. */
  hiloPresent: boolean;
  challenge: {state: string; active: boolean} | null;
  rewards: number | null;
  /** Read for the header and the live pill (spec 22, 24); the card words none of it. */
  hydroQuebec: HydroQuebecInputs | null;
  wallbox: WallboxInputs;
  water: WaterInputs;
}

/** The inputs of the house at these states. */
export function readEnergy(states: HassEntities, config: ResolvedConfig, names: Names): EnergyInputs {
  const {whT, whP} = config.entities;
  // the first of the two sensors that has a friendly name, resolved: a name in the `names:` block wins
  const named = [whT, whP].find((id): id is string => !!textAttributeOf(states, id, 'friendly_name'));
  return {
    power: powerNow(states, config),
    hilo: hiloRates(states, config),
    hiloPresent: hiloPresent(states, config),
    challenge: hiloChallenge(states, config),
    rewards: hiloRewards(states, config),
    hydroQuebec: hydroQuebec(states, config),
    wallbox: wallbox(states, config),
    water: {
      temperature: numberOf(states, whT),
      power: kilowattsOf(states, whP),
      name: named ? names.name(named).replace(MEASUREMENT, '').trim() : '',
      present: hasState(states, whT) || hasState(states, whP),
    },
  };
}
