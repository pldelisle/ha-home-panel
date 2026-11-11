// The `samsungtv` platform as a TV source: preferred when both it and a generic set exist, named by the catalog when the
// household did not name the device, and the finder of the wake-on-LAN button that turns the set on when it will not answer.
// Pattern: an adapter behind the TvSource strategy (Gamma et al.), first in the list; the integration's naming stays here (Evans).
// Must not: pick the television (`findTv` does), press the button (a command does) or read `friendly_name` for any rule but the button's.
import type {HassEntities} from '../core/hass.ts';
import {textAttributeOf} from '../core/states.ts';
import {readSet, visibleTvs} from './tv-port.ts';
import type {TvSource} from './tv-port.ts';

/** The first `button.wake_on_lan_*` whose name mentions a TV. */
const wakeButtonOf = (states: HassEntities): string | null =>
  Object.keys(states).find(
    id => id.startsWith('button.wake_on_lan_') && /tv/i.test(textAttributeOf(states, id, 'friendly_name') ?? ''),
  ) ?? null;

export const samsungTvSource: TvSource = {
  name: 'samsung-tv',

  candidates: (states, registries) =>
    visibleTvs(states, registries).filter(id => registries.entities?.[id]?.platform === 'samsungtv'),

  read: (id, states, registries, naming) => ({
    ...readSet(id, states, registries, naming, () => naming.t('media.samsungTv')),
    wakeButton: wakeButtonOf(states),
  }),
};
