// The room rules (src/shell/rooms.ts): which rooms the house has, in what order, and how the `tab` setting names a room or a section.
// Pure functions over literal inputs: a descriptor is a plain object, the names are a map.
import {describe, expect, test} from 'vitest';
import type {FeatureDescriptor, FeatureEnv} from '../../../src/ui/feature.ts';
import {parseView, roomColor, roomIcon, roomList, roomTab, subjectsOf, visibleView} from '../../../src/shell/rooms.ts';

const env = {room: null} as unknown as FeatureEnv;
const feature = (key: string, areas?: readonly string[], available?: boolean): FeatureDescriptor =>
  ({
    key,
    available: available === undefined ? undefined : () => available,
    room: areas && {areas: () => areas, part: () => ({}) as never},
  }) as unknown as FeatureDescriptor;
const named = (map: Record<string, string>) => ({name: (id: string) => map[id] ?? id});

describe('the room route', () => {
  test('roomTab writes the area id after the prefix, and parseView reads it back', () => {
    expect(roomTab('living_room')).toBe('room:living_room');
    expect(parseView('room:living_room')).toEqual({kind: 'room', areaId: 'living_room'});
  });

  test('anything else is a section, whatever it names', () => {
    expect(parseView('lights')).toEqual({kind: 'feature', key: 'lights'});
    expect(parseView('nothing')).toEqual({kind: 'feature', key: 'nothing'});
  });

  test('an area id may hold a colon, and an empty one is no room', () => {
    expect(parseView('room:a:b')).toEqual({kind: 'room', areaId: 'a:b'});
    expect(parseView('room:')).toEqual({kind: 'feature', key: 'room:'});
  });
});

describe('the rooms of the house', () => {
  const names = named({kitchen: 'Cuisine', office: 'Bureau', attic: 'Éclair', garage: 'Garage'});

  test('are the areas some subject lists, once each, with their display names', () => {
    const features = [feature('lights', ['kitchen', 'office']), feature('climate', ['office'])];
    expect(roomList(features, env, names, 'fr-CA')).toEqual([
      {areaId: 'office', name: 'Bureau'},
      {areaId: 'kitchen', name: 'Cuisine'},
    ]);
  });

  test("are sorted by the name with the locale's collation, accents and case included", () => {
    const rooms = roomList([feature('lights', ['garage', 'attic', 'kitchen', 'office'])], env, names, 'fr-CA');
    expect(rooms.map(r => r.name)).toEqual(['Bureau', 'Cuisine', 'Éclair', 'Garage']);
    // a plain code-unit sort would put the accented capital after every unaccented one
    expect(roomList([feature('lights', ['garage', 'attic'])], env, names, 'en').map(r => r.name)).toEqual([
      'Éclair',
      'Garage',
    ]);
  });

  test('leave out an area no subject lists, a subject with no room part and an empty id', () => {
    const rooms = roomList([feature('home'), feature('lights', ['', 'kitchen'])], env, names, 'en');
    expect(rooms).toEqual([{areaId: 'kitchen', name: 'Cuisine'}]);
    expect(roomList([feature('home')], env, names, 'en')).toEqual([]);
  });

  test('ignore a subject the house does not show', () => {
    expect(roomList([feature('lights', ['kitchen'], false)], env, names, 'en')).toEqual([]);
  });

  test('keep a stable order when two rooms share a name', () => {
    const twins = named({a: 'Den', b: 'Den'});
    expect(roomList([feature('lights', ['b', 'a'])], env, twins, 'en').map(r => r.areaId)).toEqual(['a', 'b']);
  });
});

describe('the view a tab names', () => {
  const rooms = [{areaId: 'kitchen', name: 'Kitchen'}];

  test('a room that has tiles shows', () => {
    expect(visibleView('room:kitchen', {}, rooms)).toEqual({kind: 'room', areaId: 'kitchen'});
  });

  test('a room that has no tiles any more, or an unknown area, shows Home', () => {
    expect(visibleView('room:attic', {}, rooms)).toEqual({kind: 'feature', key: 'home'});
    expect(visibleView('room:kitchen', {}, [])).toEqual({kind: 'feature', key: 'home'});
  });

  test('a section follows `visibleTab`: shown, hidden or unknown', () => {
    expect(visibleView('lights', {}, rooms)).toEqual({kind: 'feature', key: 'lights'});
    expect(visibleView('climate', {climate: false}, rooms)).toEqual({kind: 'feature', key: 'home'});
    expect(visibleView('nope', {}, rooms)).toEqual({kind: 'feature', key: 'home'});
  });
});

describe('the subjects of a room', () => {
  const features = [
    feature('home'),
    feature('lights', ['kitchen']),
    feature('climate', ['kitchen', 'office']),
    feature('car', ['kitchen'], false),
  ];

  test('are those that list the area, in registry order, without a hidden one or one with no room part', () => {
    expect(subjectsOf(features, env, 'kitchen').map(f => f.key)).toEqual(['lights', 'climate']);
    expect(subjectsOf(features, env, 'office').map(f => f.key)).toEqual(['climate']);
    expect(subjectsOf(features, env, 'attic')).toEqual([]);
  });
});

describe('the icon and colour of a room', () => {
  test('are guessIcon of the name, with the house where it would give the thermometer', () => {
    expect(roomIcon('Living room')).toBe('sofa');
    expect(roomIcon('Chambre des maîtres')).toBe('bed');
    expect(roomIcon('Kitchen')).toBe('house');
    expect(roomIcon('')).toBe('house');
  });

  test("the colour is Home's, and a fixed one when the registry has no Home", () => {
    const home = {key: 'home', color: 'var(--c-test)'} as unknown as FeatureDescriptor;
    expect(roomColor([feature('lights'), home])).toBe('var(--c-test)');
    expect(roomColor([feature('lights')])).toBe('var(--c-grid)');
  });
});
