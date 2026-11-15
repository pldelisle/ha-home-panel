// The camera port: what a camera source answers (`CameraSource`) and the generic inputs it fills (`CameraInputs`).
// Pattern: strategy (Gamma et al.), the port the adapters import so none imports another (the list of them is `cameras.ts`);
// each adapter is an anti-corruption layer (Evans) that turns an integration's camera entities into these inputs.
// Must not: import an adapter, a feature, the shell or the DOM, or hold a string the household reads.
import type {HassEntities, Registries} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';

export interface CameraInputs {
  /** `camera.*`. */
  id: string;
  /** The device the camera belongs to; null when the registry has none. */
  deviceId: string | null;
  /** The device's name through the resolver, else the entity's, without Protect's channel suffix. */
  name: string;
  /** False when the camera is `unavailable` or `unknown`. */
  available: boolean;
  /** `entity_picture`, unstamped: the model adds the ten-second stamp. */
  picture: string | null;
  /** The camera's motion sensor and since when it has said so; null when it has none or says nothing (unavailable, no state). */
  motion: {on: boolean; since: number} | null;
  /** That sensor's id, whatever it says now, so the store tells a reader when it changes. */
  motionId: string | null;
  /** Home Assistant's state: `idle`, `recording`, `streaming`, `unavailable`. */
  state: string;
}

export type CameraSource = (states: HassEntities, registries: Registries, names: Names) => CameraInputs[];
