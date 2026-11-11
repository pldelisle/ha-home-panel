// The `samsungtv` platform as a TV source: preferred when both it and a generic set exist, and named `Samsung TV` by the
// catalog when the household did not name the device.
// Pattern: an adapter behind the TvSource strategy (Gamma et al.), first in the list; the integration's naming stays here (Evans).
// Its filters copy the legacy `tv()`, which #266 deletes with the legacy stack, its last reader.
// Must not: pick the television (`findTv` does), call the catalog (the model translates `defaultName`) or press a button.
import {readSet, visibleTvs, type TvSource} from './tv-source.ts';

export const samsungTvSource: TvSource = {
  name: 'samsung-tv',

  // the legacy filter: a Samsung player is a television only when it also says `device_class` `tv`
  candidates: (states, registries) =>
    visibleTvs(states, registries).filter(id => registries.entities?.[id]?.platform === 'samsungtv'),

  read: (id, states, registries, names) => ({
    ...readSet(id, states, registries, names, () => null),
    defaultName: 'media.samsungTv',
  }),
};
