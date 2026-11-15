// sankeyLayout: the Sankey as geometry: the grid, the uses and the rooms with their ribbons, the two scales, the small rooms gathered under 3 percent of the heating,
// and the figures and words of its labels. The numbers are those the legacy panel's `renderSankey` wrote into its SVG (deleted in #240), worked by hand here.
import {describe, expect, test} from 'vitest';
import {
  sankeyLayout,
  type SankeyData,
  type SankeyGeometry,
  type SankeyGroup,
  type SankeyLabel,
  type SankeyNode,
  type SankeyRibbon,
} from '../../../../src/features/energy/sankey-layout.ts';
import {depsOf, fullHouse, type Language} from '../media/support.ts';

const group = (key: SankeyGroup['key'], value: number): SankeyGroup => ({
  key,
  name: {heat: 'Room heating', wh: 'Water heating', ev: 'EV charging', rest: 'Rest of home'}[key],
  color: `var(--c-${key})`,
  value,
});
const data = (total: number, heat: number, wh: number, ev: number, rest: number): SankeyData => ({
  total,
  groups: [group('heat', heat), group('wh', wh), group('ev', ev), group('rest', rest)],
});
const layout = (sankey: SankeyData, rooms: {name: string; value: number}[] = [], language: Language = 'en') => {
  const {t} = depsOf(fullHouse, language);
  return sankeyLayout(sankey, rooms, {t, format: kwh => `${kwh.toFixed(1)} kWh`});
};

const nodes = (geometry: SankeyGeometry) => geometry.items.filter((i): i is SankeyNode => i.kind === 'node');
const ribbons = (geometry: SankeyGeometry) => geometry.items.filter((i): i is SankeyRibbon => i.kind === 'ribbon');
const labels = (geometry: SankeyGeometry) => geometry.items.filter((i): i is SankeyLabel => i.kind === 'label');
const node = (geometry: SankeyGeometry, key: string) => nodes(geometry).find(n => n.key === key)!;

// 10 kWh from the grid: heating 6, water 2, the car 0, the rest 2, and four rooms, two of them under 3 percent of the heating (0.18)
const ROOMS = [
  {name: 'Den', value: 3},
  {name: 'Bedroom', value: 2},
  {name: 'Hall', value: 0.1},
  {name: 'Closet', value: 0.1},
];

describe('the scales and the columns', () => {
  const geometry = layout(data(10, 6, 2, 0, 2), ROOMS);

  test('the drawing is 980 by 332, in three columns 400 apart, the car (nothing) left out', () => {
    expect([geometry.width, geometry.height]).toEqual([980, 332]);
    expect(nodes(geometry).map(n => [n.key, n.x])).toEqual([
      ['grid', 0],
      ['heat', 400],
      ['wh', 400],
      ['rest', 400],
      ['room:0', 800],
      ['room:1', 800],
      ['room:2', 800],
    ]);
  });

  test('the grid and the uses share one scale: 300 pixels less 12 between the three uses, over the total', () => {
    // k = (300 - 12 * 2) / 10 = 27.6; the grid is centred: 24 + (300 - 276) / 2
    expect(node(geometry, 'grid')).toMatchObject({y: 36, height: 276, color: 'var(--c-rest)'});
    expect(node(geometry, 'heat')).toMatchObject({y: 24, height: 165.6, color: 'var(--c-heat)'});
    expect(node(geometry, 'wh')).toMatchObject({y: 201.6, height: 55.2});
    expect(node(geometry, 'rest')).toMatchObject({y: 268.8, height: 55.2});
  });

  test('the rooms share a scale of their own, and the same one while their sum fits the heating', () => {
    // the two large rooms and the gathered two: 3 + 2 + 0.2 = 5.2 over the 6 of heating, kr = k = 27.6
    expect(
      nodes(geometry)
        .filter(n => n.key.startsWith('room'))
        .map(n => [n.y, n.height]),
    ).toEqual([
      [90.2, 82.8],
      [185.0, 55.2],
      [252.2, 5.5],
    ]);
  });

  test('a ribbon runs from the grid to each use, and from the heating to each room, ending where the next column’s node begins', () => {
    expect(ribbons(geometry).map(r => r.key)).toEqual([
      'ribbon:heat',
      'ribbon:wh',
      'ribbon:rest',
      'ribbon:room:0',
      'ribbon:room:1',
      'ribbon:room:2',
    ]);
    expect(ribbons(geometry)[0]).toMatchObject({
      d: 'M20,36.0 C210,36.0 210,24.0 400,24.0 L400,189.6 C210,189.6 210,201.6 20,201.6 Z',
      color: 'var(--c-heat)',
      opacity: 0.45,
    });
    // the first room leaves the heating's top (24) and arrives at its own node (90.2)
    expect(ribbons(geometry)[3].d).toBe(
      'M420,24.0 C610,24.0 610,90.2 800,90.2 L800,173.0 C610,173.0 610,106.8 420,106.8 Z',
    );
    expect(ribbons(geometry)[3].color).toBe('var(--c-heat)');
  });

  test('when the rooms add up to more than the heating they are squeezed: kr is 276 over their sum', () => {
    const squeezed = layout(data(10, 6, 2, 0, 2), [
      {name: 'Den', value: 12},
      {name: 'Bedroom', value: 8},
    ]);
    // kr = (300 - 12) / max(6, 20) = 14.4: the node's height is the room's share at kr, the ribbon leaves the heating at k
    expect(node(squeezed, 'room:0').height).toBe(172.8);
    expect(node(squeezed, 'room:1').height).toBe(115.2);
  });

  test('a total above the sum of the uses scales to the total, and one below it to the sum', () => {
    expect(node(layout(data(20, 6, 2, 0, 2), ROOMS), 'heat').height).toBe(82.8); // k = 13.8
    const below = layout(data(5, 6, 2, 0, 2), ROOMS); // the uses add up to 10
    expect(node(below, 'heat').height).toBe(165.6);
    expect(labels(below)[0].value).toBe('5.0 kWh'); // the grid's own figure is what the grid supplied
  });
});

describe('the rooms gathered', () => {
  test('two rooms under 3 percent of the heating are one "Other rooms", after the larger ones, with the sum', () => {
    const geometry = layout(data(10, 6, 2, 0, 2), ROOMS);
    expect(
      labels(geometry)
        .filter(l => l.key.startsWith('room'))
        .map(l => [l.name, l.value]),
    ).toEqual([
      ['Den', '3.0 kWh'],
      ['Bedroom', '2.0 kWh'],
      ['Other rooms', '0.2 kWh'],
    ]);
  });

  test('a single small room keeps its own name, and a room at exactly 3 percent is not small', () => {
    const one = layout(data(10, 6, 2, 0, 2), [
      {name: 'Den', value: 3},
      {name: 'Hall', value: 0.1},
    ]);
    expect(
      labels(one)
        .filter(l => l.key.startsWith('room'))
        .map(l => l.name),
    ).toEqual(['Den', 'Hall']);
    const edge = layout(data(10, 6, 2, 0, 2), [
      {name: 'Den', value: 3},
      {name: 'Hall', value: 0.18},
      {name: 'Closet', value: 0.17},
    ]);
    expect(
      labels(edge)
        .filter(l => l.key.startsWith('room'))
        .map(l => l.name),
    ).toEqual(['Den', 'Hall', 'Closet']);
  });

  test('rooms with nothing are left out, the biggest comes first, and "Other rooms" is in French', () => {
    const geometry = layout(
      data(10, 6, 2, 0, 2),
      [
        {name: 'Hall', value: 0.1},
        {name: 'Off', value: 0},
        {name: 'Bedroom', value: 2},
        {name: 'Closet', value: 0.1},
        {name: 'Den', value: 3},
      ],
      'fr',
    );
    expect(
      labels(geometry)
        .filter(l => l.key.startsWith('room'))
        .map(l => l.name),
    ).toEqual(['Den', 'Bedroom', 'Autres pièces']);
  });

  test('with no heating drawn there are no rooms to split it into', () => {
    const geometry = layout(data(10, 0, 2, 0, 8), ROOMS);
    expect(nodes(geometry).map(n => n.key)).toEqual(['grid', 'wh', 'rest']);
  });
});

describe('the labels', () => {
  test('each node says its name and its figure, the grid’s at the top and each use’s at the middle of its bar', () => {
    const geometry = layout(data(10, 6, 2, 0, 2), ROOMS);
    const [grid, heat] = labels(geometry);
    expect(grid).toMatchObject({key: 'grid', x: 28, y: 25, valueY: 41, name: 'Grid', value: '10.0 kWh'});
    // the heating's middle is 24 + 82.8 = 106.8: the name sits 3 above it and the figure 13 under
    expect(heat).toMatchObject({key: 'heat', x: 428, y: 103.8, valueY: 119.8, name: 'Room heating', value: '6.0 kWh'});
  });

  test('a bar is never under 2 pixels high, so a sliver still shows', () => {
    const geometry = layout(data(1000, 600, 0.001, 0, 399.999), []);
    expect(node(geometry, 'wh').height).toBe(2);
  });

  test('the sentence for a screen reader and the grid’s name are the catalog’s, in French too', () => {
    expect(layout(data(10, 6, 2, 0, 2), []).label).toBe(
      'Power from the grid, split into room heating, water heating, EV charging and the rest of the home',
    );
    const fr = layout(data(10, 6, 2, 0, 2), [], 'fr');
    expect(fr.label).toMatch(/^Électricité du réseau/);
    expect(labels(fr)[0].name).toBe('Réseau');
  });
});
