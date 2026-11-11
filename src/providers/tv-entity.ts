// Any visible media player that says it is a television (`device_class` `tv`), as a TV source: the generic one, tried last.
// Pattern: an adapter behind the TvSource strategy (Gamma et al.); it is the fallback when no Samsung set exists, and it
// names the set through the resolver, leaving the placeholder `TV` to the catalog (anti-corruption layer, Evans).
// Must not: know an integration, call the catalog (the model translates `defaultName`) or hold a string the household reads.
import {readSet, visibleTvs, type TvSource} from './tv-source.ts';

export const tvEntitySource: TvSource = {
  name: 'tv-entity',

  candidates: visibleTvs,

  read: (id, states, registries, names) => ({
    // an empty placeholder means "no name", where the legacy panel wrote `name(id, 'TV')`
    ...readSet(id, states, registries, names, () => names.name(id, '') || null),
    defaultName: 'media.tv',
  }),
};
