// sceneTiles: the Home scenes row, from the house's scenes and the config's modes, each with its icon and the line under it.
// Pattern: a pure view-model function (a humble object's other half); the held values come in through `overlay`, the words
// through `deps.t`, the time through `deps.fmt.ago` at an instant it is given. `sceneIcon` and the order rule copy the legacy
// panel's `sceneIcon` and `sceneTiles`, which the Media move of #220 deletes.
// Must not: send a command, read `hass` or the clock, hold text for the household, or import the DOM, the kit or the shell.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Messages} from '../../core/i18n/messages.ts';
import type {Names} from '../../core/i18n/names.ts';
import {isHidden} from '../../core/registry.ts';
import {isAvailable} from '../../core/states.ts';
import {K, type Overlay} from './commands.ts';

export interface SceneTilesDeps {
  t: Messages['t'];
  fmt: Formatters;
  names: Names;
  /** The instant the lines are read at, in milliseconds: passed in, never read. */
  now: number;
}

/** The names of the icons a scene or a routine can take, as the legacy panel's `ico` has them. */
export type SceneIcon = 'moon' | 'tv' | 'dinner' | 'exit' | 'house';

export interface SceneTileView {
  id: string;
  kind: 'scene' | 'mode';
  name: string;
  icon: SceneIcon;
  /** "Tap to run", "Last 2 h ago" and "Done" for a scene; "On" or "Off" for a mode. */
  subLine: string;
  /** A scene that was just run, or a mode that is on. */
  active: boolean;
  /** A mode that is unavailable; a scene can always be tapped. */
  disabled: boolean;
}

/** The icon a scene or a mode takes from its id (English and French words); the legacy `sceneIcon`. */
export const sceneIcon = (id: string): SceneIcon =>
  /night|nuit|sleep|bedtime|dodo/.test(id) && !/movie/.test(id)
    ? 'moon'
    : /movie|film|tv/.test(id)
      ? 'tv'
      : /dinner|souper|meal/.test(id)
        ? 'dinner'
        : /away|leav|depart/.test(id)
          ? 'exit'
          : 'house';

/** Where a scene sits in the config's order; the ones it does not list come after, alphabetically. */
const rankIn = (order: readonly string[], id: string): number => order.indexOf(id) + 1 || 99;

/** The visible scenes in the config's order, then the config's modes that exist. */
export function sceneTiles(
  states: HassEntities,
  registries: Registries,
  config: Pick<ResolvedConfig, 'scenes' | 'modes'>,
  overlay: Overlay,
  {t, fmt, names, now}: SceneTilesDeps,
): SceneTileView[] {
  const scenes = Object.keys(states)
    .filter(id => id.startsWith('scene.') && !isHidden(id, registries))
    .sort((a, b) => rankIn(config.scenes, a) - rankIn(config.scenes, b) || a.localeCompare(b))
    .map((id): SceneTileView => {
      const ran = overlay<boolean>(K.ran(id), false);
      const state = states[id].state;
      const date = Date.parse(state);
      const ago = isAvailable(states[id]) && !isNaN(date) ? fmt.ago(date, now) : null;
      return {
        id,
        kind: 'scene',
        name: names.name(id),
        icon: sceneIcon(id),
        subLine: ran ? t('media.done') : ago === null ? t('media.tapToRun') : t('media.last', ago),
        active: ran,
        disabled: false,
      };
    });
  const modes = config.modes
    .filter(id => states[id] !== undefined)
    .map((id): SceneTileView => {
      const on = overlay(K.on(id), states[id].state === 'on') === true;
      return {
        id,
        kind: 'mode',
        name: names.name(id),
        icon: sceneIcon(id),
        subLine: t(on ? 'media.on' : 'media.modeIsOff'),
        active: on,
        disabled: !isAvailable(states[id]),
      };
    });
  return [...scenes, ...modes];
}
