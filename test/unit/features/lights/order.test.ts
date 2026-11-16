// The Lights tab's arrangement as pure facts: the pairs in force, a pair drawn side by side, and the order an admin saved.
import {describe, expect, test} from 'vitest';
import {applyLinks, applyOrder, linkPairs} from '../../../../src/features/lights/order.ts';
import {entity} from '../../fake-hass.ts';

const tile = (key: string, units: string[] = [], ids: string[] = []) => ({key, units, ids});
const keys = (tiles: {key: string}[]) => tiles.map(t => t.key);

describe('linkPairs', () => {
  const config = [
    {keys: ['kitchen', 'office'], sw: 'input_boolean.linked'},
    {keys: ['den', 'attic'], sw: null},
    {keys: ['lonely'], sw: null},
  ];
  const states = (state: string) => ({'input_boolean.linked': entity('input_boolean.linked', state)});

  test('the system data wins once someone has picked, every pair of two as strings', () => {
    expect(linkPairs({light_links: [['a', 'b'], ['c'], 'x', [1, 2]]}, config, states('on'))).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(linkPairs({light_links: []}, config, states('on'))).toEqual([]);
  });

  test('else the config’s pairs: one with a switch counts while it is on, one without always', () => {
    expect(linkPairs(null, config, states('on'))).toEqual([
      ['kitchen', 'office'],
      ['den', 'attic'],
    ]);
    expect(linkPairs({light_order: ['x']}, config, states('off'))).toEqual([['den', 'attic']]);
  });
});

describe('applyLinks', () => {
  const tiles = [tile('attic'), tile('den', ['light.den_group'], ['light.den_1']), tile('kitchen'), tile('office')];

  test('the second of a pair moves beside the first, and both are marked', () => {
    const out = applyLinks(tiles, [['attic', 'office']]);
    expect(keys(out)).toEqual(['attic', 'office', 'den', 'kitchen']);
    expect(out.map(t => t.link)).toEqual([{other: 'office', first: true}, {other: 'attic', first: false}, null, null]);
    expect(tiles[0]).not.toHaveProperty('link'); // the input is not touched
  });

  test('a key may be a tile’s unit or light; a room in two pairs keeps the first', () => {
    const out = applyLinks(tiles, [
      ['kitchen', 'light.den_1'],
      ['office', 'light.den_group'],
    ]);
    expect(keys(out)).toEqual(['attic', 'kitchen', 'den', 'office']);
    expect(out[3].link).toBeNull();
  });

  test('a pair naming a missing tile, or one tile twice, is skipped', () => {
    expect(
      applyLinks(tiles, [
        ['attic', 'garage'],
        ['den', 'light.den_1'],
      ]).every(t => t.link === null),
    ).toBe(true);
  });
});

describe('applyOrder', () => {
  const linked = applyLinks([tile('attic'), tile('den'), tile('kitchen'), tile('office')], [['attic', 'kitchen']]);

  test('a pair moves as one unit under its first tile’s key, unknown tiles go last in their own order', () => {
    expect(keys(applyOrder(linked, ['office', 'attic']))).toEqual(['office', 'attic', 'kitchen', 'den']);
    // naming the pair's second tile does not move it apart from its first
    expect(keys(applyOrder(linked, ['kitchen', 'den']))).toEqual(['den', 'attic', 'kitchen', 'office']);
  });

  test('no order, an empty one or one that is not a list leaves the tiles as they are', () => {
    for (const order of [null, undefined, [], 'attic'])
      expect(keys(applyOrder(linked, order))).toEqual(['attic', 'kitchen', 'den', 'office']);
  });
});
