// readCarFeature: the FordPass car and the Wallbox of the house, read into the inputs the model takes.
// Pattern: a composition of readers (ADR 0025): the car from the FordPass provider and the charger from the Wallbox's, so the feature knows no integration's naming;
// a house with no FordPass car reads `car: null`, and the Car tab is hidden for it.
// Must not: word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {findCar, readCar, type CarInputs, type CarRef} from '../../providers/fordpass.ts';
import {wallbox, type WallboxInputs} from '../../providers/wallbox.ts';

export interface CarFeatureInputs {
  /** The car's entities, which the commands name; null when the house has no FordPass car. */
  ref: CarRef | null;
  car: CarInputs | null;
  charger: WallboxInputs;
}

/** The inputs of the house at these states. */
export function readCarFeature(states: HassEntities, config: ResolvedConfig, names: Names): CarFeatureInputs {
  const ref = findCar(states);
  return {
    ref,
    car: ref ? readCar(states, config, names, ref) : null,
    charger: wallbox(states, config),
  };
}
