// lightAreas and shortNames: how the house's lights become the Lights tab's tiles. The test house's kitchen is checks 22 and 24 as unit facts;
// literal houses give the rules it does not exercise (a device's area, the hidden and diagnostic lights, the Other tile).
import {describe, expect, test} from 'vitest';
import {lightAreas, shortNames} from '../../../src/providers/light-areas.ts';
import {fullHouse, houseOf, readingOf, type Player} from '../features/media/support.ts';

type House = ReturnType<typeof houseOf>;
const tilesOf = (house: House, splitLightAreas: string[] = []) => {
  const {states, registries, names} = readingOf(house);
  return lightAreas(states, registries, names, {splitLightAreas});
};
const light = (id: string, row: Player[3] = {}, device?: Player[4], attributes: object = {}): Player => [
  `light.${id}`,
  'on',
  attributes,
  {platform: 'hue', ...row},
  device,
];
const group = (id: string, members: string[], name: string, row: Player[3] = {}): Player => [
  `light.${id}`,
  'on',
  {entity_id: members.map(m => `light.${m}`), friendly_name: name},
  {platform: 'group', ...row},
];

describe('the test house', () => {
  test('without split_light_areas an area is one tile, and the kitchen’s groups are its buttons (check 24)', () => {
    const tiles = tilesOf(fullHouse);
    expect(tiles.map(t => t.name)).toEqual(['Kitchen', 'Living room', 'Office']);
    expect(tiles[0]).toEqual({
      key: 'kitchen',
      areaId: 'kitchen',
      area: 'Kitchen',
      other: false,
      name: 'Kitchen',
      ids: ['light.kitchen_island_1', 'light.kitchen_island_2', 'light.kitchen_sink_1'],
      areaLights: ['light.kitchen_island_1', 'light.kitchen_island_2', 'light.kitchen_sink_1'],
      units: ['light.kitchen_island', 'light.kitchen_sink'],
      labels: ['Island', 'Sink'],
    });
  });

  test('a split kitchen is one tile per group, kept where the kitchen sorts, and the Sink tile holds only its own bulb (check 22)', () => {
    const tiles = tilesOf(fullHouse, ['kitchen']);
    expect(tiles.map(t => [t.key, t.name, t.ids])).toEqual([
      ['light.kitchen_island', 'Island', ['light.kitchen_island_1', 'light.kitchen_island_2']],
      ['light.kitchen_sink', 'Sink', ['light.kitchen_sink_1']],
      ['living_room', 'Living room', ['light.living_room_1']],
      ['office', 'Office', ['light.office_1']],
    ]);
    // the split tiles keep the whole area's lights for the Adaptive Lighting match
    expect(tiles[1].areaLights).toHaveLength(3);
    expect(tiles[1]).toMatchObject({areaId: 'kitchen', area: 'Kitchen', units: ['light.kitchen_sink']});
  });
});

describe('literal houses', () => {
  const areas = {den: 'Den', attic: 'Attic'};

  test('a light with no area of its own takes its device’s; one with neither goes to the Other tile, last', () => {
    const house = houseOf(
      [
        light('lamp', {device_id: 'd1'}, {id: 'd1', area_id: 'den'}),
        light('stray'),
        light('attic_1', {area_id: 'attic'}),
      ],
      [],
      areas,
    );
    expect(tilesOf(house).map(t => [t.key, t.areaId, t.area, t.other, t.ids])).toEqual([
      ['attic', 'attic', 'Attic', false, ['light.attic_1']],
      ['den', 'den', 'Den', false, ['light.lamp']],
      ['#other', null, '', true, ['light.stray']],
    ]);
  });

  test('a diagnostic or config light is left out, and a hidden one only when no group owns it', () => {
    const house = houseOf(
      [
        light('kept', {area_id: 'den'}),
        light('diagnostic', {area_id: 'den', entity_category: 'diagnostic'}),
        light('config', {area_id: 'den', entity_category: 'config'}),
        light('hidden', {area_id: 'den', hidden: true}),
        light('member', {hidden: true}),
        group('den_group', ['member'], 'Den group', {area_id: 'den'}),
      ],
      [],
      areas,
    );
    const [den] = tilesOf(house);
    expect(den.ids).toEqual(['light.kept', 'light.member']);
    expect(den.units).toEqual(['light.den_group', 'light.kept']);
  });

  test('a group with no area takes its first member’s; its members follow it, and a light in two groups belongs to the first', () => {
    const house = houseOf(
      [
        light('a', {area_id: 'attic'}),
        light('b', {area_id: 'den'}),
        group('first', ['b', 'a'], 'First'),
        group('second', ['a'], 'Second', {area_id: 'den'}),
      ],
      [],
      areas,
    );
    const tiles = tilesOf(house);
    expect(tiles.map(t => [t.key, t.ids, t.units])).toEqual([
      ['den', ['light.a', 'light.b'], ['light.first', 'light.second']],
    ]);
  });

  test('a group whose members have no area either sits on the Other tile; an area left with no light has no tile', () => {
    const house = houseOf(
      [light('m'), group('g', ['m'], 'Lonely'), group('empty', [], 'Empty', {area_id: 'den'})],
      [],
      areas,
    );
    expect(tilesOf(house).map(t => [t.key, t.ids])).toEqual([['#other', ['light.m']]]);
  });

  test('a split area with one button stays one tile, and a split unit with no light of its own gets no tile', () => {
    const one = houseOf([light('a', {area_id: 'den'})], [], areas);
    expect(tilesOf(one, ['den']).map(t => t.key)).toEqual(['den']);
    // `a` belongs to the attic's group, the first to list it, so the den's group has no light of its own
    const house = houseOf(
      [
        light('a', {area_id: 'den'}),
        light('b', {area_id: 'den'}, undefined, {friendly_name: 'Den desk'}),
        light('c', {area_id: 'den'}, undefined, {friendly_name: 'Den floor'}),
        group('attic_group', ['a'], 'Attic group', {area_id: 'attic'}),
        group('den_group', ['a'], 'Den group', {area_id: 'den'}),
      ],
      [],
      areas,
    );
    expect(tilesOf(house, ['den']).map(t => [t.key, t.name])).toEqual([
      ['attic', 'Attic'],
      ['light.b', 'desk'],
      ['light.c', 'floor'],
    ]);
  });
});

describe('shortNames', () => {
  test('drops the leading words every name shares, folded, and never empties a name', () => {
    expect(shortNames(['Lumière Dessus Piano', 'Lumiere dessus Porte'])).toEqual(['Piano', 'Porte']);
    expect(shortNames(['Kitchen', 'Kitchen Island'])).toEqual(['Kitchen', 'Kitchen Island']);
    expect(shortNames(['Desk lamp', 'Floor lamp'])).toEqual(['Desk lamp', 'Floor lamp']);
  });

  test('keeps fewer than two names as they are', () => {
    expect(shortNames(['Kitchen Island'])).toEqual(['Kitchen Island']);
    expect(shortNames([])).toEqual([]);
  });
});
