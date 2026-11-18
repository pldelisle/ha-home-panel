// flowLayout: the live flow as geometry: the connectors' widths and dash durations at 0, 1 and 6 kW, every text of the drawing, and a house with no charger or no grid reading.
// The numbers are those the legacy panel's `flowSvg` wrote into its SVG; the words are read through the real catalog, in English and in French.
import {describe, expect, test} from 'vitest';
import {flowLayout, type FlowDeps, type FlowGeometry} from '../../../../src/features/energy/flow-layout.ts';
import type {PowerNow, RoomPower} from '../../../../src/providers/power.ts';
import {fullHouse, depsOf, type Language} from '../media/support.ts';

const room = (heating: boolean): RoomPower => ({
  key: 'den',
  configuredName: null,
  thermostatName: '',
  climate: 'climate.den',
  power: heating ? 1 : 0,
  temperature: 20,
  setpoint: 21,
  minTemp: 5,
  maxTemp: 30,
  heating,
  available: true,
});

const power = (over: Partial<PowerNow> = {}): PowerNow => ({
  grid: 0,
  waterHeater: 0,
  ev: 0,
  rooms: [room(false), room(false), room(false), room(false)],
  heat: 0,
  rest: 0,
  heatPump: null,
  ...over,
});

const layout = (
  now: Partial<PowerNow>,
  language: Language = 'en',
  extra: Partial<Pick<FlowDeps, 'waterTemperature' | 'chargerStatus'>> = {},
): FlowGeometry => {
  const {t, fmt} = depsOf(fullHouse, language);
  return flowLayout(power(now), {t, fmt, waterTemperature: 50, chargerStatus: 'Charging', ...extra});
};

const connector = (geometry: FlowGeometry, key: string) => geometry.connectors.find(c => c.key === key)!;
const node = (geometry: FlowGeometry, key: string) => geometry.nodes.find(n => n.key === key)!;
const words = (geometry: FlowGeometry) => geometry.labels.map(l => l.text);

describe('the connectors', () => {
  test('at 0\u00a0kW a line is off: three wide, no dash, no duration', () => {
    expect(layout({grid: 0, heat: 0, waterHeater: 0, ev: 0}).connectors).toEqual([
      {key: 'grid', x1: 112, y1: 160, x2: 164, y2: 160, color: 'var(--c-grid)', on: false, width: 3, duration: null},
      {key: 'heat', x1: 276, y1: 160, x2: 328, y2: 160, color: 'var(--c-heat)', on: false, width: 3, duration: null},
      {key: 'water', x1: 220, y1: 104, x2: 220, y2: 92, color: 'var(--c-wh)', on: false, width: 3, duration: null},
      {key: 'ev', x1: 220, y1: 216, x2: 220, y2: 236, color: 'var(--c-ev)', on: false, width: 3, duration: null},
    ]);
  });

  test('the threshold is 20\u00a0W: over it a line is on, at it not', () => {
    expect(connector(layout({grid: 0.02}), 'grid').on).toBe(false);
    expect(connector(layout({grid: 0.03}), 'grid')).toMatchObject({on: true, width: 3, duration: '2.39s'});
  });

  test('at 1\u00a0kW the line is 3.5 wide and the dashes take 2.00 s', () => {
    expect(connector(layout({grid: 1}), 'grid')).toMatchObject({on: true, width: 3.5, duration: '2.00s'});
  });

  test('at 6\u00a0kW the width stops at 5 and the dashes stop at 0.45 s', () => {
    expect(connector(layout({ev: 6}), 'ev')).toMatchObject({on: true, width: 5, duration: '0.45s'});
  });

  test('a duration is a stable string: 3\u00a0kW is 1.20 s, not 1.2000000000000002', () => {
    expect(connector(layout({heat: 3}), 'heat')).toMatchObject({width: 4.5, duration: '1.20s'});
  });

  test('a water heater or a charger that reads nothing is off, as the legacy flow read it as zero', () => {
    const geometry = layout({waterHeater: null, ev: null, grid: null});
    expect(geometry.connectors.map(c => c.on)).toEqual([false, false, false, false]);
  });
});

describe('the nodes and their figures', () => {
  const busy = layout({grid: 3.24, heat: 2.4, waterHeater: 0.85, ev: 7.1, rest: 0});

  test('a power of a kilowatt or more is two significant figures over the unit, under it watts', () => {
    expect(node(busy, 'grid')).toMatchObject({
      cx: 70,
      cy: 160,
      r: 42,
      on: true,
      strokeWidth: 3,
      color: 'var(--c-grid)',
    });
    expect(node(busy, 'grid').texts).toEqual([
      {x: 70, y: 158, text: '3.2', anchor: 'middle', kind: 'big', size: 20},
      {x: 70, y: 176, text: 'kW', anchor: 'middle', kind: 'st'},
    ]);
    expect(node(busy, 'heat').texts[0]).toMatchObject({x: 370, y: 158, text: '2.4', size: 20});
    expect(node(busy, 'ev')).toMatchObject({cx: 220, cy: 276, r: 40, on: true});
    expect(node(busy, 'ev').texts[0]).toMatchObject({text: '7.1', size: 18});
  });

  test('the water heater under a kilowatt writes its watts, and its tank temperature under them', () => {
    expect(node(busy, 'water')).toMatchObject({cx: 220, cy: 50, r: 40, on: true});
    expect(node(busy, 'water').texts).toEqual([
      {x: 220, y: 56, text: '850\u00a0W', anchor: 'middle', kind: 'big', size: 18},
      {x: 220, y: 71, text: '50.0°', anchor: 'middle', kind: 'st'},
    ]);
  });

  test('an idle load is a lit-off ring with its figure and no unit, and no tank reading leaves no line under it', () => {
    const idle = layout({waterHeater: 0, ev: null}, 'en', {waterTemperature: null});
    expect(node(idle, 'ev')).toMatchObject({on: false});
    expect(node(idle, 'ev').texts).toEqual([
      {x: 220, y: 282, text: '0\u00a0W', anchor: 'middle', kind: 'big', size: 18},
    ]);
    expect(node(idle, 'water').texts).toHaveLength(1);
  });

  test('the home is always lit, its figure the grid’s with its unit, even under a kilowatt', () => {
    const home = node(layout({grid: 0.85}), 'home');
    expect(home).toMatchObject({cx: 220, cy: 160, r: 56, strokeWidth: 4, color: 'var(--c-home)', on: true});
    expect(home.texts).toEqual([
      {x: 220, y: 158, text: '850', anchor: 'middle', kind: 'big', size: 28, unit: 'W'},
      {x: 220, y: 178, text: 'kW · Home', anchor: 'middle', kind: 'st'},
    ]);
  });

  test('a grid that reads nothing is a dash, in the node, the home and the rest', () => {
    const none = layout({grid: null, rest: null});
    expect(node(none, 'grid').texts).toEqual([{x: 70, y: 166, text: '–', anchor: 'middle', kind: 'big', size: 20}]);
    expect(node(none, 'home').texts[0].text).toBe('–');
    expect(words(none)).toContain('–');
    expect(none.label).toContain('Grid supplies – to the home');
  });
});

describe('the captions', () => {
  test('a busy house: importing, heating and hot, the rooms on, the charger’s own status, the rest', () => {
    const geometry = layout({
      grid: 10.9,
      heat: 2.4,
      waterHeater: 0.85,
      ev: 7.1,
      rest: 0.5,
      rooms: [room(true), room(true), room(false), room(false)],
    });
    expect(geometry.labels).toEqual([
      {x: 70, y: 222, text: 'Grid', anchor: 'middle', kind: 'cap'},
      {x: 70, y: 238, text: 'Importing', anchor: 'middle', kind: 'st'},
      {x: 300, y: 44, text: 'Water heating', anchor: 'start', kind: 'cap'},
      {x: 300, y: 60, text: 'Heating, hot', anchor: 'start', kind: 'st'},
      {x: 370, y: 222, text: 'Room heating', anchor: 'middle', kind: 'cap'},
      {x: 370, y: 238, text: '2 of 4 rooms on', anchor: 'middle', kind: 'st'},
      {x: 300, y: 272, text: 'EV charging', anchor: 'start', kind: 'cap'},
      {x: 300, y: 288, text: 'Charging', anchor: 'start', kind: 'st'},
      {x: 120, y: 290, text: 'Rest of home', anchor: 'end', kind: 'st'},
      {x: 120, y: 306, text: '500\u00a0W', anchor: 'end', kind: 'big', size: 15},
    ]);
  });

  test('an idle tank under 48 degrees is idle; at 48 it is idle, hot; no charger status is unavailable', () => {
    expect(words(layout({waterHeater: 0}, 'en', {waterTemperature: 47.9}))).toContain('Idle');
    expect(words(layout({waterHeater: 0}, 'en', {waterTemperature: 48}))).toContain('Idle, hot');
    expect(words(layout({}, 'en', {chargerStatus: null}))).toContain('Unavailable');
  });

  test('the charger’s status is worded where the catalog knows it, as the integration says it in English, and shown as it is otherwise', () => {
    const status = (chargerStatus: string, language: Language = 'en') =>
      words(layout({}, language, {chargerStatus})).at(7);
    expect(status('Connected: waiting for car demand')).toBe('Connected: waiting for car demand');
    expect(status('Connected: waiting for car demand', 'fr')).toBe('Branchée : en attente de la voiture');
    expect(status('Charging', 'fr')).toBe('Recharge');
    expect(status('Calibrating', 'fr')).toBe('Calibrating');
  });

  test('an absent EV and no grid reading: zero watts for the charger, no pulse, and the grid idle', () => {
    const geometry = layout({ev: null, grid: null});
    expect(geometry.pulse).toBeNull();
    expect(words(geometry)).toContain('Idle');
    expect(geometry.label).toBe(
      'Grid supplies – to the home; room heating 0\u00a0W; water heating 0\u00a0W; EV charging 0\u00a0W',
    );
  });

  test('the charger pulses while it charges, in its colour, round its node', () => {
    expect(layout({ev: 7.1}).pulse).toEqual({cx: 220, cy: 276, r: 40, color: 'var(--c-ev)'});
  });

  test('the screen reader’s sentence says each figure the way the node does', () => {
    expect(layout({grid: 3.24, heat: 2.4, waterHeater: 0.85, ev: 7.1}).label).toBe(
      'Grid supplies 3.2\u00a0kW to the home; room heating 2.4\u00a0kW; water heating 850\u00a0W; EV charging 7.1\u00a0kW',
    );
  });

  test('the drawing’s own size', () => {
    expect(layout({})).toMatchObject({width: 440, height: 340});
  });
});

describe('in French', () => {
  test('the captions, the decimal comma and the sentence', () => {
    const geometry = layout({grid: 10.9, heat: 2.4, waterHeater: 0.85, ev: 7.1, rest: 0.5}, 'fr');
    expect(words(geometry)).toEqual([
      'Réseau',
      'Consomme',
      'Chauffe-eau',
      'Chauffe, chaud',
      'Chauffage',
      '0 sur 4 pièces en marche',
      'Recharge VÉ',
      'Recharge',
      'Reste de la maison',
      '500\u00a0W',
    ]);
    expect(node(geometry, 'grid').texts[0].text).toBe('11');
    expect(geometry.label).toBe(
      'Le réseau fournit 11\u00a0kW à la maison; chauffage 2,4\u00a0kW; chauffe-eau 850\u00a0W; recharge VÉ 7,1\u00a0kW',
    );
  });
});

describe('devices that report more than the meter', () => {
  const over = {grid: 3.24, heat: 2.4, waterHeater: 0, ev: 7.1, rest: 0};

  test('the flow says so once, on two lines from the card’s left edge, and draws no Rest of home, balanced at zero or otherwise', () => {
    const geometry = layout(over);
    const note = geometry.labels.slice(-2);
    expect(note.map(l => l.text)).toEqual(['Devices report more', 'than the meter']);
    expect(note.map(l => [l.x, l.y, l.anchor])).toEqual([
      [14, 290, 'start'],
      [14, 305, 'start'],
    ]);
    expect(words(geometry)).not.toContain('Rest of home');
    expect(geometry.labels.filter(l => l.kind === 'big')).toEqual([]);
  });

  test('in French, and a house whose devices fit the meter keeps its rest of home', () => {
    expect(words(layout(over, 'fr'))).toEqual(
      expect.arrayContaining(['Les appareils déclarent', 'plus que le compteur']),
    );
    expect(words(layout({grid: 3.24, heat: 1, waterHeater: 0, ev: 1, rest: 1.24}))).toContain('Rest of home');
  });

  test('exactly 10 W over the meter is the figures’ own rounding and draws no note; 20 W over does', () => {
    const near = {grid: 1, heat: 1.01, waterHeater: 0, ev: 0, rest: 0};
    expect(words(layout(near))).not.toContain('Devices report more');
    expect(words(layout({...near, heat: 1.02}))).toContain('Devices report more');
  });
});
