// The TV sources in the order they are tried, and `findTv`, which asks them.
// Pattern: strategy (Gamma et al., Design Patterns), one port (`TvSource`, in `tv-port.ts`) and two adapters that both exist,
// Samsung's platform and any player that says it is a television; a source is added by one file and one line in `TV_SOURCES`.
// Must not: import a feature or the DOM, match on an integration (an adapter does), or read the clock.
import type {HassEntities, Registries} from '../core/hass.ts';
import {samsungTvSource} from './samsung-tv.ts';
import type {TvInputs, TvNaming, TvSource} from './tv-port.ts';
import {tvEntitySource} from './tv-entity.ts';

export type {TvInputs, TvNaming, TvSource} from './tv-port.ts';

/** The sources in the order they are tried: Samsung's platform first, as the legacy panel did, then any television. */
export const TV_SOURCES: readonly TvSource[] = [samsungTvSource, tvEntitySource];

/** The television of the house: what the first source that has a candidate reads of its first candidate, or null. */
export function findTv(
  states: HassEntities,
  registries: Registries,
  naming: TvNaming,
  sources: readonly TvSource[] = TV_SOURCES,
): TvInputs | null {
  for (const source of sources) {
    const [id] = source.candidates(states, registries);
    if (id !== undefined) return source.read(id, states, registries, naming);
  }
  return null;
}
