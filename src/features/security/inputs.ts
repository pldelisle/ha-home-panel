// readSecurity: the cameras and the door and motion sensors of the house, read into the inputs the model takes.
// Pattern: a composition of strategies (Gamma et al.): the cameras from every camera source in list order, the sensors from
// the shared provider (ADR 0025); the adapter list sits in `providers/cameras.ts`, where a new source is one line.
// Must not: know an integration (that is a source), word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import type {CameraInputs, CameraSource} from '../../providers/camera-source.ts';
import {CAMERA_SOURCES} from '../../providers/cameras.ts';
import {doorMotionSensors, type SensorInputs} from '../../providers/door-motion.ts';

export interface SecurityInputs {
  /** What the sources read, in list order; within a source, by name. */
  cameras: CameraInputs[];
  /** Doors first, then motion, each by name. */
  sensors: SensorInputs[];
}

/** The inputs of the house at these states. */
export function readSecurity(
  states: HassEntities,
  registries: Registries,
  names: Names,
  sources: readonly CameraSource[] = CAMERA_SOURCES,
): SecurityInputs {
  return {
    cameras: sources.flatMap(source => source(states, registries, names)),
    sensors: doorMotionSensors(states, registries, names),
  };
}
