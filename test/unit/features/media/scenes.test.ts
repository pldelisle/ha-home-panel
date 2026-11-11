// sceneTiles: the Home scenes row, from the test house and from literal scenes; the expected lines are literals, in both languages.
import {describe, expect, test} from 'vitest';
import {K, SCENE_RAN_MS} from '../../../../src/features/media/commands.ts';
import {sceneIcon, sceneTiles} from '../../../../src/features/media/scenes.ts';
import {OverlayStore} from '../../../../src/ui/overlay-store.ts';
import {entity, type FakeHass} from '../../fake-hass.ts';
import {NOW, depsOf, fullHouse, houseOf, readingOf, type Language} from './support.ts';

const nothingHeld = <T>(_key: string, current: T): T => current;
/** An overlay that holds these values, as the panel's store does until Home Assistant agrees. */
const holding =
  (held: Record<string, unknown>) =>
  <T>(key: string, current: T): T =>
    (key in held ? held[key] : current) as T;

const tilesOf = (
  house: FakeHass,
  language: Language,
  config: {scenes?: string[]; modes?: string[]} = {},
  overlay: <T>(key: string, current: T) => T = nothingHeld,
) => {
  const {states, registries} = readingOf(house);
  return sceneTiles(states, registries, {scenes: [], modes: [], ...config}, overlay, {
    ...depsOf(house, language),
    now: NOW,
  });
};

const MODES = ['input_boolean.kids_bedtime'];

describe('the test house', () => {
  test('the scenes in the config order, then the modes, in English', () => {
    expect(tilesOf(fullHouse, 'en', {scenes: ['scene.movie_night', 'scene.dinner'], modes: MODES})).toEqual([
      {
        id: 'scene.movie_night',
        kind: 'scene',
        name: 'Movie night',
        icon: 'tv',
        subLine: 'Tap to run',
        active: false,
        pressed: undefined,
        disabled: false,
      },
      {
        id: 'scene.dinner',
        kind: 'scene',
        name: 'Dinner',
        icon: 'dinner',
        subLine: 'Last 2 h ago',
        active: false,
        pressed: undefined,
        disabled: false,
      },
      {
        id: 'input_boolean.kids_bedtime',
        kind: 'mode',
        name: 'Kids bedtime',
        icon: 'moon',
        subLine: 'Off',
        active: false,
        pressed: 'false',
        disabled: false,
      },
    ]);
  });

  test('the same in French, as the rewrite layer worded each line', () => {
    const lines = tilesOf(fullHouse, 'fr', {scenes: ['scene.movie_night'], modes: MODES}).map(({id, subLine}) => [
      id,
      subLine,
    ]);
    expect(lines).toEqual([
      ['scene.movie_night', 'Lancer'],
      ['scene.dinner', 'Il y a 2 h'],
      ['input_boolean.kids_bedtime', 'Désactivé'],
    ]);
  });

  test('scenes the config does not list follow alphabetically', () => {
    expect(tilesOf(fullHouse, 'en').map(tile => tile.id)).toEqual(['scene.dinner', 'scene.movie_night']);
  });

  test('a mode that is not in the house is not drawn', () => {
    expect(tilesOf(fullHouse, 'en', {modes: ['input_boolean.nobody']}).map(tile => tile.kind)).toEqual([
      'scene',
      'scene',
    ]);
  });
});

describe('a scene', () => {
  const house = houseOf(
    [],
    [
      entity('scene.a', '2026-11-07T18:59:30+00:00', {friendly_name: 'A'}),
      entity('scene.b', 'unavailable', {friendly_name: 'B'}),
      entity('scene.c', '2026-10-20T12:00:00+00:00', {friendly_name: 'C'}),
      entity('scene.d', 'not a date', {friendly_name: 'D'}),
      entity('scene.e', '2026-11-07T19:00:00+00:00', {friendly_name: 'E'}),
    ],
  );
  const line = (language: Language, id: string, overlay = nothingHeld) =>
    tilesOf(house, language, {}, overlay).find(tile => tile.id === id)?.subLine;

  test('says when it last ran, in minutes, in English and in French', () => {
    expect(line('en', 'scene.a')).toBe('Last 1 min ago');
    expect(line('fr', 'scene.a')).toBe('Il y a 1 min');
    expect(line('en', 'scene.e')).toBe('Last just now');
    expect(line('fr', 'scene.e')).toBe("À l'instant");
  });

  test('says the date of a run that is a day old or more', () => {
    expect(line('en', 'scene.c')).toBe('Last Oct 20');
    expect(line('fr', 'scene.c')).toBe('Lancée le 20 oct.');
  });

  test.each(['scene.b', 'scene.d'])('says to tap when its state is no date (%s)', id => {
    expect(line('en', id)).toBe('Tap to run');
    expect(line('fr', id)).toBe('Lancer');
  });

  test('says Done while the overlay holds that it ran, and shows it active', () => {
    const held = holding({[K.ran('scene.a')]: true});
    const tile = tilesOf(house, 'en', {}, held).find(t => t.id === 'scene.a');
    expect(tile).toMatchObject({subLine: 'Done', active: true});
    expect(line('fr', 'scene.a', held)).toBe('Fait');
    expect(tilesOf(house, 'en', {}, held).find(t => t.id === 'scene.c')).toMatchObject({active: false});
  });

  test('says Done for four seconds after a run, held in the real store, and then says when it last ran', () => {
    let clock = 0;
    const store = new OverlayStore({now: () => clock});
    const overlay = <T>(key: string, current: T): T => store.read(key, current);
    store.hold(K.ran('scene.a'), true, SCENE_RAN_MS);
    expect(tilesOf(house, 'en', {}, overlay).find(t => t.id === 'scene.a')).toMatchObject({
      subLine: 'Done',
      active: true,
    });
    clock = 3999;
    expect(line('en', 'scene.a', overlay)).toBe('Done');
    clock = 4000;
    expect(tilesOf(house, 'en', {}, overlay).find(t => t.id === 'scene.a')).toMatchObject({
      subLine: 'Last 1 min ago',
      active: false,
    });
  });

  test('a hidden scene is not drawn', () => {
    const hidden = houseOf([], [entity('scene.shown', 'unknown'), entity('scene.hidden', 'unknown')]);
    hidden.entities = {'scene.hidden': {entity_id: 'scene.hidden', hidden: true}};
    expect(tilesOf(hidden, 'en').map(tile => tile.id)).toEqual(['scene.shown']);
  });
});

describe('a mode', () => {
  const house = houseOf(
    [],
    [
      entity('input_boolean.on', 'on', {friendly_name: 'Away'}),
      entity('input_boolean.off', 'off', {friendly_name: 'Quiet'}),
      entity('input_boolean.gone', 'unavailable', {friendly_name: 'Gone'}),
    ],
  );
  const modes = ['input_boolean.on', 'input_boolean.off', 'input_boolean.gone'];

  test('says On or Off, in the order the config gives, and is disabled when it is unavailable', () => {
    expect(
      tilesOf(house, 'en', {modes}).map(({id, subLine, active, pressed, disabled}) => ({
        id,
        subLine,
        active,
        pressed,
        disabled,
      })),
    ).toEqual([
      {id: 'input_boolean.on', subLine: 'On', active: true, pressed: 'true', disabled: false},
      {id: 'input_boolean.off', subLine: 'Off', active: false, pressed: 'false', disabled: false},
      {id: 'input_boolean.gone', subLine: 'Off', active: false, pressed: 'false', disabled: true},
    ]);
  });

  test('says Activé and Désactivé in French, which the legacy panel wrote itself', () => {
    expect(tilesOf(house, 'fr', {modes}).map(tile => tile.subLine)).toEqual(['Activé', 'Désactivé', 'Désactivé']);
  });

  test('shows the value the overlay holds, until Home Assistant agrees', () => {
    const held = holding({[K.on('input_boolean.off')]: true});
    expect(tilesOf(house, 'en', {modes}, held)[1]).toMatchObject({subLine: 'On', active: true, pressed: 'true'});
  });
});

describe('sceneIcon', () => {
  test.each([
    ['scene.night_mode', 'moon'],
    ['scene.bedtime', 'moon'],
    ['scene.movie_night', 'tv'],
    ['scene.film', 'tv'],
    ['scene.dinner', 'dinner'],
    ['scene.souper', 'dinner'],
    ['scene.away', 'exit'],
    ['scene.leaving', 'exit'],
    ['scene.relax', 'house'],
  ])('%s is %s', (id, icon) => {
    expect(sceneIcon(id)).toBe(icon);
  });
});
