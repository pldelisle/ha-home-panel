// Any visible media player that says it is a television (`device_class` `tv`), as a TV source: the generic one, tried last.
// Pattern: an adapter behind the TvSource strategy (Gamma et al.); it is the fallback when no Samsung set exists, and it
// names the set through the resolver with `TV` as the placeholder (anti-corruption layer, Evans).
// Must not: know an integration, look for a wake button (Samsung's source finds it), or hold a string the household reads.
import {readSet, visibleTvs} from './tv-port.ts';
import type {TvSource} from './tv-port.ts';

export const tvEntitySource: TvSource = {
  name: 'tv-entity',

  candidates: visibleTvs,

  read: (id, states, registries, naming) => ({
    ...readSet(id, states, registries, naming, () => naming.names.name(id, 'TV')),
    wakeButton: null,
  }),
};
