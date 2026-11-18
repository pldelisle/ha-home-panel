// climateModel: the summary, the list, the phone's tiles and the detail's head, tiles, note and controls from the test house, from the
// recorded house when the owner has one, and from literal houses for each shape the test house does not show (the heat pump in each of
// its states, an unavailable room); in English and in French, where the numbers are French's own; a held value through a fake overlay.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {readClimate} from '../../../../src/features/climate/inputs.ts';
import {K} from '../../../../src/features/climate/keys.ts';
import type {ClimateHistoryData} from '../../../../src/features/climate/history.ts';
import {
  climateModel,
  type ClimateModelDeps,
  type ClimateSelection,
  type ControlsView,
} from '../../../../src/features/climate/model.ts';
import type {Range} from '../../../../src/ui/ranges.ts';
import {depsOf, fullHouse, houseOf, recorded, storeOf, type Language, type Player} from '../media/support.ts';
import {entity, fakeHass, type FakeHass} from '../../fake-hass.ts';

const unheld = <T>(_key: string, current: T): T => current;
const holding =
  (held: Record<string, unknown>) =>
  <T>(key: string, current: T): T =>
    (key in held ? held[key] : current) as T;

/** The model of a house for a selection, as the panel gives it: the store's catalog and names, in a language, on the tablet unless `compact`. */
function modelOf(
  hass: FakeHass,
  sel: ClimateSelection,
  extra: Partial<ClimateModelDeps> & {language?: Language; config?: object; history?: ClimateHistoryData} = {},
) {
  const {language = 'en', config = {}, history = null, ...rest} = extra;
  const store = storeOf(hass, config);
  const inputs = readClimate(hass.states, registriesOf(hass), store.config);
  return climateModel(inputs, history, sel, {
    ...depsOf(hass, language),
    language,
    overlay: unheld,
    compact: false,
    ...rest,
  });
}

const AT = Date.UTC(2026, 10, 10, 17);
const DAY = 864e5;
/** A range's history as the loader derives it, with only what a test says: no rows, no heating, a window of the range's own days. */
const loaded = (over: Partial<ClimateHistoryData> = {}, range: Range = 'day'): ClimateHistoryData => ({
  range,
  at: AT,
  start: AT - DAY,
  rooms: {},
  sp: {},
  kwh: {},
  out: [],
  hp: [],
  hpSp: [],
  hpFrom: null,
  ...over,
});
const points = (...values: number[]): [number, number, null, null][] =>
  values.map((value, index) => [AT - (values.length - index) * 36e5, value, null, null]);

const thermostat = (id: string, state = 'heat', attributes: Record<string, unknown> = {}) =>
  entity(`climate.${id}`, state, {friendly_name: `Thermostat ${id}`, ...attributes});
const ROOMS = {rooms: [{climate: 'climate.den', key: 'den', name: 'Den'}]};
const PUMP = {...ROOMS, entities: {heat_pump: 'climate.pump'}};
const pump = (state: string, attributes: Record<string, unknown> = {}, device = {manufacturer: 'Daikin'}): Player => [
  'climate.pump',
  state,
  attributes,
  {platform: 'climate', device_id: 'd'},
  {id: 'd', ...device},
];
/** The heat pump's detail, in a house of one room and the pump. */
const pumpOf = (player: Player, extra: Parameters<typeof modelOf>[2] = {}) =>
  modelOf(houseOf([player], [thermostat('den')]), 'hp', {config: PUMP, ...extra});
const roomOf = (states: ReturnType<typeof entity>[], extra: Parameters<typeof modelOf>[2] = {}) =>
  modelOf(houseOf([], states), 'den', {config: ROOMS, ...extra});

const room = (controls: ControlsView) => {
  if (controls.kind !== 'room' || controls.offline) throw new Error('not a room with a thermostat');
  return controls;
};
const house = (controls: ControlsView) => {
  if (controls.kind !== 'house') throw new Error('not the house');
  return controls;
};
const hp = (controls: ControlsView) => {
  if (controls.kind !== 'hp' || controls.offline) throw new Error('not a heat pump that is up');
  return controls;
};

describe('the test house, on the tablet', () => {
  test('the summary, the list and the phone’s tiles, the house’s wide', () => {
    const vm = modelOf(fullHouse, 'house');
    expect(vm.summary).toBe('20.6° average inside · 4.2° outside · 2 rooms heating');
    expect(vm.items.map(i => i.id)).toEqual(['house', 'bedroom', 'garage', 'living_room', 'office']);
    expect(vm.tiles.map(i => [i.id, i.wide])).toEqual([
      ['house', true],
      ['bedroom', false],
      ['garage', false],
      ['living_room', false],
      ['office', false],
    ]);
    expect(vm.tiles[1]).toMatchObject({name: 'Bedroom', sub: 'Heating · 1.2\u00a0kW'});
  });

  test('the house: the average, its warmest and coolest rooms, the heating now, a dash for what history gives', () => {
    const {detail, selection} = modelOf(fullHouse, 'house');
    expect(selection).toBe('house');
    expect(detail).toMatchObject({
      title: 'Whole house',
      sub: 'Average of 4 rooms',
      pill: {text: '2 rooms heating', tone: 'on'},
      temperature: '20.6',
      outside: 'Outside 4.2°',
      dial: null,
      note: null,
      controls: {
        kind: 'house',
        rooms: ['climate.bedroom', 'climate.garage', 'climate.living_room', 'climate.office'],
      },
    });
    expect(detail.tiles).toEqual([
      {
        label: 'Warmest',
        value: '21.2',
        unit: '°',
        sub: 'Garage',
        range: false,
        select: 'garage',
        opens: 'Shows its chart',
      },
      {
        label: 'Coolest',
        value: '20.0',
        unit: '°',
        sub: 'Living room',
        range: false,
        select: 'living_room',
        opens: 'Shows its chart',
      },
      {label: 'Heating now', value: '2.4', unit: 'kW', sub: 'all thermostats', range: false},
      {label: 'Heating, 24 h', value: '–', unit: 'kWh', sub: 'all thermostats', range: false},
    ]);
  });

  test('the house’s Warmest and Coolest lead to their room, said in French too; no other tile leads anywhere', () => {
    const english = modelOf(fullHouse, 'house').detail.tiles;
    expect(english.map(tile => tile.select)).toEqual(['garage', 'living_room', undefined, undefined]);
    const french = modelOf(fullHouse, 'house', {language: 'fr'}).detail.tiles;
    expect(french[0]?.opens).toBe('Affiche son graphique');
    // a room's own tiles and the heat pump's have no target
    expect(modelOf(fullHouse, 'bedroom').detail.tiles.map(tile => tile.select)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('the loaded history fills the Range and Heating tiles of the selection, for the range it was loaded for and no other', () => {
    const week = loaded({rooms: {bedroom: points(18.5, 21, 23)}, kwh: {bedroom: 12.34}}, 'week');
    const tiles = (history: ClimateHistoryData, sel: string, range: Range = history.range, language: Language = 'en') =>
      modelOf(fullHouse, sel, {range, history, language}).detail.tiles.map(t => t.value);
    // a room: the span of its readings at one decimal, the kWh at one; the Drawing now tile is the state's
    expect(tiles(week, 'bedroom')).toEqual(['18.5–23.0', '1.2', '12.3']);
    expect(tiles(week, 'bedroom', 'week', 'fr')[0]).toBe('18,5–23,0');
    // the house has no Range tile: the mean of the rooms is the line the chart draws, and its Heating tile is the rooms' total, a whole number of kWh
    const everyRoom = {
      bedroom: points(19, 22),
      garage: points(19, 22),
      living_room: points(19, 22),
      office: points(19, 22),
    };
    const house = loaded({rooms: everyRoom, kwh: {bedroom: 100, garage: 39.6, living_room: 0, office: 0}});
    expect(tiles(house, 'house')).toEqual(['21.2', '20.0', '2.4', '140']);
    // a room the load has no rows for, or no power sensor for, stays a dash
    expect(tiles(week, 'garage')).toEqual(['–', '0', '–']);
    // a history of another range than the one shown is no history: dashes until the loader has the range
    expect(tiles(week, 'bedroom', 'day')).toEqual(['–', '1.2', '–']);
    // a selection that names nothing the house has is the house, and its figures are the house's
    expect(modelOf(fullHouse, 'nowhere', {history: house}).detail.tiles[3].value).toBe('140');
  });

  test('before the range is loaded the charts say so, and a failed load says that; the phone has the room’s chart only', () => {
    const waiting = modelOf(fullHouse, 'house').detail;
    expect(waiting.chart).toEqual({
      name: 'House average',
      rangeLabel: 'last 24 hours',
      legend: [
        {name: 'House average', color: 'var(--c-wh)', dashed: false},
        {name: 'Outside', color: 'var(--c-home)', dashed: false},
      ],
      notice: {kind: 'loading', text: 'Loading history…'},
    });
    expect(waiting.heatmap).toEqual({
      title: 'Every room, hour by hour',
      hint: 'Mean temperature per room, on a smooth scale from cool blue to warm red.',
      // the last room is the top row
      rooms: [
        {key: 'office', name: 'Office'},
        {key: 'living_room', name: 'Living room'},
        {key: 'garage', name: 'Garage'},
        {key: 'bedroom', name: 'Bedroom'},
      ],
      notice: {kind: 'loading', text: 'Loading history…'},
    });
    const failed = modelOf(fullHouse, 'house', {historyFailed: true}).detail;
    expect([failed.chart.notice, failed.heatmap?.notice]).toEqual(
      Array(2).fill({kind: 'failed', text: 'History is not available right now.'}),
    );
    // loaded: nothing stands in for a chart, and a week's words follow the range
    const everyRoom = {
      bedroom: points(18, 19, 20),
      garage: points(18, 19, 20),
      living_room: points(18),
      office: points(18),
    };
    const readings = {rooms: everyRoom};
    const ready = modelOf(fullHouse, 'house', {range: 'week', history: loaded(readings, 'week')}).detail;
    expect([ready.chart.notice, ready.heatmap?.notice]).toEqual([null, null]);
    expect(ready.heatmap?.title).toBe('Every room, every 6 hours');
    // the outside's temperature is the detail chart's line: the tablet has no outside chart of its own
    expect(ready).not.toHaveProperty('outsideChart');
    const phone = modelOf(fullHouse, 'bedroom', {compact: true}).detail;
    expect(phone.heatmap).toBeNull();
    expect(phone.chart.legend.map(item => [item.name, item.dashed])).toEqual([
      ['Bedroom', false],
      ['Setpoint', true],
      ['Outside', false],
    ]);
  });

  test('a loaded range with no reading at all says so once, in the kit’s sentence, where the chart and the heatmap would be', () => {
    const sentence = 'No history yet. It fills in as Home Assistant records the next hour.';
    const dry = modelOf(fullHouse, 'house', {history: loaded()}).detail;
    expect(dry.chart.notice).toEqual({kind: 'empty', text: sentence});
    expect(dry.heatmap?.notice).toEqual({kind: 'empty', text: sentence});
    // a room with readings keeps its chart even when another room has none
    const one = modelOf(fullHouse, 'bedroom', {history: loaded({rooms: {bedroom: points(18, 19)}})}).detail;
    expect([one.chart.notice, one.heatmap?.notice]).toEqual([null, null]);
    expect(
      modelOf(fullHouse, 'garage', {history: loaded({rooms: {bedroom: points(18, 19)}})}).detail.chart.notice,
    ).toEqual({kind: 'empty', text: sentence});
    expect(modelOf(fullHouse, 'house', {history: loaded(), language: 'fr'}).detail.chart.notice?.text).toBe(
      'Pas encore d’historique. Il se remplit à mesure que Home Assistant enregistre la prochaine heure.',
    );
  });

  test('a house with no thermostat has no heatmap to draw, once loaded; the words are French in French', () => {
    const heatPumpOnly = houseOf([pump('heat')]);
    const empty = modelOf(heatPumpOnly, 'hp', {config: {entities: {heat_pump: 'climate.pump'}}, history: loaded()});
    expect(empty.detail.heatmap?.notice).toEqual({kind: 'empty', text: 'No thermostats found.'});
    const french = modelOf(fullHouse, 'house', {language: 'fr'}).detail;
    expect(french.chart.name).toBe('Moyenne de la maison');
    expect(french.heatmap?.notice?.text).toBe('Chargement de l’historique…');
  });

  test('the house’s gauge has no setpoint mark and no caption, and its controls name every thermostat "set every room" asks', () => {
    const {detail} = modelOf(fullHouse, 'house');
    expect(detail.gauge).toMatchObject({
      geometry: {setpoint: null, caption: null},
      label: 'Temperature 20.6 degrees on a 14 to 30 degree scale',
      now: 'Now 20.6°',
      caption: '',
      lo: '14°',
      hi: '30°',
    });
    expect(detail.controls).toMatchObject({
      kind: 'house',
      rooms: ['climate.bedroom', 'climate.garage', 'climate.living_room', 'climate.office'],
    });
  });

  test('the house’s two buttons ask in a dialog: Set all names the value and the rooms, All off names the frost guard', () => {
    const {asks} = house(modelOf(fullHouse, 'house').detail.controls);
    expect(asks.set(21)).toEqual({
      title: 'Set every room to 21.0°?',
      line: 'All 4 rooms change to 21.0°.',
      confirm: 'Set all',
      cancel: 'Cancel',
    });
    expect(asks.set(21.5).title).toBe('Set every room to 21.5°?');
    expect(asks.off).toEqual({
      title: 'Turn every room off?',
      line: 'Each room drops to the 5° frost guard.',
      confirm: 'Turn off',
      cancel: 'Cancel',
    });
    const french = house(modelOf(fullHouse, 'house', {language: 'fr'}).detail.controls).asks;
    expect(french.set(21.5)).toEqual({
      title: 'Régler toutes les pièces à 21,5°\u202f?',
      line: 'Les 4 pièces passent à 21,5°.',
      confirm: 'Tout régler',
      cancel: 'Annuler',
    });
    expect(french.off.title).toBe('Éteindre toutes les pièces\u202f?');
  });

  test('a room heating: its pill, its setpoint on the gauge, its tiles and note, its setpoint and quick buttons', () => {
    const {detail, selection} = modelOf(fullHouse, 'bedroom', {range: 'week'});
    expect(selection).toBe('bedroom');
    expect(detail).toMatchObject({
      title: 'Bedroom',
      sub: 'Hilo thermostat',
      pill: {text: 'Heating to 21°', tone: 'on'},
      temperature: '20.8',
      note: 'The dashed line is the setpoint. Where it stops, the thermostat was off.',
    });
    expect(detail.gauge).toMatchObject({
      label: 'Temperature 20.8 degrees, setpoint 21 degrees on a 14 to 30 degree scale',
      caption: 'Bar marks the setpoint',
    });
    expect(detail.tiles.map(tile => [tile.label, tile.value, tile.unit, tile.range])).toEqual([
      ['Range, 7 days', '–', '°', true],
      ['Drawing now', '1.2', 'kW', false],
      ['Heating, 7 days', '–', 'kWh', false],
    ]);
    const {id, name, setpoint, quick} = room(detail.controls);
    expect([id, name], 'what the commands and their toasts name').toEqual(['climate.bedroom', 'Bedroom']);
    expect(setpoint).toEqual({value: 21, lo: 5, hi: 30, off: false});
    expect(quick.map(q => [q.value, q.label, q.pressed])).toEqual([
      ['off', 'Off', false],
      [19, '19°', false],
      [20, '20°', false],
      [21, '21°', true],
      [22, '22°', false],
    ]);
  });

  test('a room holding its setpoint says so, and one with a selection that names nothing is the house', () => {
    expect(modelOf(fullHouse, 'garage').detail.pill).toEqual({text: 'Holding 21°', tone: ''});
    expect(modelOf(fullHouse, 'nowhere')).toMatchObject({selection: 'house', detail: {title: 'Whole house'}});
    // no heat pump in this house: its selection falls back too
    expect(modelOf(fullHouse, 'hp')).toMatchObject({selection: 'house'});
  });
});

describe('the test house, on the phone', () => {
  test('the dial replaces the big number and the gauge: the setpoint, the dot at the reading, the caption with the outside', () => {
    const {detail} = modelOf(fullHouse, 'bedroom', {compact: true});
    expect(detail).toMatchObject({temperature: null, outside: null, gauge: null});
    expect(detail.dial).toMatchObject({
      editable: true,
      lo: 5,
      hi: 30,
      value: 21,
      big: '21.0°',
      caption: 'Now 20.8° · Outside 4.2°',
      label: 'Setpoint',
      valueText: '21 degrees',
      geometry: {off: false, knob: {cx: 195, cy: 46.2}},
      target: {kind: 'room', id: 'climate.bedroom', name: 'Bedroom'},
    });
  });

  test('the house’s dial shows the average, has no knob and is not a slider', () => {
    const {dial} = modelOf(fullHouse, 'house', {compact: true}).detail;
    expect(dial).toMatchObject({
      editable: false,
      value: null,
      big: '20.6°',
      label: 'Temperature',
      valueText: '',
      geometry: {knob: null},
      target: null,
    });
  });
});

describe('in French', () => {
  test('the words, the decimal comma and the rooms’ own names', () => {
    const vm = modelOf(fullHouse, 'house', {language: 'fr'});
    expect(vm.summary).toBe('20,6° en moyenne à l’intérieur · 4,2° dehors · 2 pièces chauffent'.replace('’', "'"));
    expect(vm.detail).toMatchObject({
      title: 'Toute la maison',
      sub: 'Moyenne de 4 pièces',
      temperature: '20,6',
      outside: 'Dehors 4,2°',
    });
    expect(vm.detail.tiles.map(tile => [tile.label, tile.value, tile.sub])).toEqual([
      ['Le plus chaud', '21,2', 'Garage'],
      // the French baselines keep the rooms' English names (KEEP_ENGLISH_NAMES), so the test house says `Living room` in both
      ['Le plus frais', '20,0', 'Living room'],
      ['Chauffe en ce moment', '2,4', 'tous les thermostats'],
      ['Chauffage, 24 h', '–', 'tous les thermostats'],
    ]);
    expect(vm.detail.gauge).toMatchObject({
      label: 'Température 20,6 degrés sur une échelle de 14 à 30 degrés',
      now: 'Maintenant 20,6°',
    });
  });

  test('a room, and its dial on the phone', () => {
    const {detail} = modelOf(fullHouse, 'bedroom', {language: 'fr'});
    expect(detail).toMatchObject({title: 'Bedroom', sub: 'Thermostat Hilo', pill: {text: 'Chauffe à 21°'}});
    expect(detail.tiles[1]).toMatchObject({label: 'Puissance actuelle', value: '1,2'});
    const dial = modelOf(fullHouse, 'bedroom', {language: 'fr', compact: true}).detail.dial;
    expect(dial).toMatchObject({
      label: 'Consigne',
      valueText: '21 degrés',
      caption: 'Maintenant 20,8° · Extérieur 4,2°',
    });
  });
});

describe('a held value', () => {
  test('a held setpoint is the dial’s, the stepper’s and the quick button’s, and not the pill’s or the gauge’s', () => {
    const overlay = holding({[K.sp('climate.bedroom')]: 22.5});
    const {detail} = modelOf(fullHouse, 'bedroom', {overlay, compact: true});
    expect(detail.dial).toMatchObject({value: 22.5, big: '22.5°', valueText: '22.5 degrees'});
    expect(detail.pill.text).toBe('Heating to 21°');
    const {setpoint, quick} = room(detail.controls);
    expect(setpoint).toMatchObject({value: 22.5, off: false});
    expect(quick.filter(q => q.pressed)).toEqual([]);
    expect(
      room(modelOf(fullHouse, 'bedroom', {overlay: holding({[K.sp('climate.bedroom')]: 22})}).detail.controls).quick[4],
    ).toMatchObject({pressed: true});
    expect(modelOf(fullHouse, 'bedroom', {overlay}).detail.gauge?.geometry.setpoint).toBeCloseTo(43.75);
  });

  test('held at the frost guard: the dial says Off, the stepper is off, and only the Off button is pressed', () => {
    const overlay = holding({[K.sp('climate.bedroom')]: 5});
    const {detail} = modelOf(fullHouse, 'bedroom', {overlay, compact: true});
    expect(detail.dial).toMatchObject({value: 5, big: 'Off', valueText: 'Off', geometry: {off: true, active: null}});
    const {setpoint, quick} = room(detail.controls);
    expect(setpoint).toMatchObject({value: 5, off: true});
    expect(quick.filter(q => q.pressed).map(q => q.value)).toEqual(['off']);
    // 5.5 is off too, but no button is for it
    const held = room(
      modelOf(fullHouse, 'bedroom', {overlay: holding({[K.sp('climate.bedroom')]: 5.5})}).detail.controls,
    );
    expect(held.setpoint.off).toBe(true);
    expect(held.quick.some(q => q.pressed)).toBe(false);
  });
});

describe('a room', () => {
  test('off at the frost guard or with no setpoint, and a heating one with no setpoint shows a dash', () => {
    expect(roomOf([thermostat('den', 'heat', {temperature: 5})]).detail.pill).toEqual({text: 'Off', tone: ''});
    expect(roomOf([thermostat('den', 'heat')]).detail.pill).toEqual({text: 'Off', tone: ''});
    expect(roomOf([thermostat('den', 'heat', {hvac_action: 'heating'})]).detail.pill).toEqual({
      text: 'Heating to –°',
      tone: 'on',
    });
    expect(roomOf([thermostat('den', 'heat', {temperature: 20.5})]).detail.pill.text).toBe('Holding 20.5°');
  });

  test('a thermostat with no setpoint reads off at the bottom of its own range', () => {
    const {setpoint} = room(roomOf([thermostat('den', 'heat', {min_temp: 7, max_temp: 28})]).detail.controls);
    expect(setpoint).toEqual({value: 7, lo: 7, hi: 28, off: false});
  });

  test('unavailable: the pill, no controls, a dial that is a picture, and a gauge with no mark', () => {
    const {detail} = roomOf([thermostat('den', 'unavailable')], {compact: true});
    expect(detail.pill).toEqual({text: 'Unavailable', tone: 'bad'});
    expect(detail.controls).toEqual({kind: 'room', offline: true});
    expect(detail.dial).toMatchObject({
      editable: false,
      target: null,
      big: 'Off',
      label: 'Temperature',
      geometry: {off: true},
    });
    expect(roomOf([thermostat('den', 'unavailable')]).detail).toMatchObject({
      temperature: '–',
      gauge: null,
      outside: 'Outside –°',
    });
  });

  test('a room with no reading and no setpoint is a dash, and with a setpoint under the scale the gauge says off', () => {
    const {detail} = roomOf([thermostat('den', 'heat', {current_temperature: 19, temperature: 5})]);
    expect(detail.gauge).toMatchObject({
      geometry: {setpoint: null, caption: 'off'},
      caption: 'Thermostat off (5° frost guard)',
    });
  });
});

describe('the heat pump', () => {
  test('the heat pump’s Range tile takes the span of its line, a gap in it skipped, and it has no heating figure', () => {
    const hp: ClimateHistoryData['hp'] = [
      [AT - 2e6, 17],
      [AT - 1e6, null],
      [AT, 24.5],
    ];
    const detail = pumpOf(pump('heat'), {history: loaded({hp, kwh: {den: 5}})}).detail;
    expect(detail.tiles[0]).toMatchObject({value: '17.0–24.5'});
    expect(detail.chart.legend.map(item => item.name)).toEqual(['Heat pump', 'Setpoint', 'Outside']);
  });

  test('the note says where the line starts when the history keeps less than the range, in both languages, and not otherwise', () => {
    // the window starts 30 days back, so a line that starts on Nov 7 starts late; one that starts within a day of the window does not
    const start = Date.UTC(2026, 9, 11, 17);
    const from = Date.UTC(2026, 10, 7, 12);
    const month = (hpFrom: number | null) =>
      loaded({start, hp: hpFrom === null ? [] : [[hpFrom, 19]], hpFrom}, 'month');
    const noteOf = (hpFrom: number | null, language: Language = 'en') =>
      pumpOf(pump('heat'), {range: 'month', history: month(hpFrom), language}).detail.note;
    const plain = noteOf(null);
    expect(plain).not.toContain('Home Assistant keeps');
    expect(noteOf(start + 36e5)).toBe(plain);
    expect(noteOf(from)).toBe(
      `${plain} Home Assistant keeps about 10 days of detailed history, so the heat pump line starts Nov 7.`,
    );
    expect(noteOf(from, 'fr')).toMatch(/ la courbe de la thermopompe commence donc le 7 nov\.$/);
    // a room's note says nothing of it, whatever its history
    expect(modelOf(fullHouse, 'bedroom', {range: 'month', history: month(from)}).detail.note).not.toContain('keeps');
  });

  const ATTRS = {
    hvac_action: 'heating',
    current_temperature: 19.2,
    temperature: 22,
    min_temp: 17,
    max_temp: 28,
    hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'fan_only', 'eco_boost'],
    fan_modes: ['quiet', 'auto', 'turbo_max'],
    preset_modes: ['none', 'comfort'],
    swing_modes: ['vertical', 'off', 'vertical_3', 'horizontal_2', 'sideways_wide'],
    fan_mode: 'auto',
    preset_mode: 'none',
    swing_mode: 'off',
  };

  test('heating to its target: named by its maker, its pill, its tiles and note, its gauge with the setpoint', () => {
    const {detail, selection} = pumpOf(pump('heat', ATTRS));
    expect(selection).toBe('hp');
    expect(detail).toMatchObject({
      title: 'Heat pump',
      sub: 'Daikin',
      pill: {text: 'Heating to 22°', tone: 'on'},
      temperature: '19.2',
      note: expect.stringContaining('The unit has no power sensor') as string,
    });
    expect(detail.gauge).toMatchObject({caption: 'Bar marks the setpoint'});
    expect(detail.tiles.map(tile => [tile.label, tile.range])).toEqual([
      ['Range, 24 h', true],
      ['Last update', false],
    ]);
    expect(detail.tiles[1]?.value).toMatch(/^\d{1,2}:\d{2} [ap]m$/);
  });

  test('its pill and its summary in each state', () => {
    const state = (player: Player) => {
      const vm = pumpOf(player);
      return [vm.detail.pill, vm.summary.split(' · ').at(-1)];
    };
    expect(state(pump('heat', {hvac_action: 'heating', temperature: 22}))).toEqual([
      {text: 'Heating to 22°', tone: 'on'},
      'heat pump heating to 22°',
    ]);
    expect(state(pump('heat', {hvac_action: 'idle'}))).toEqual([{text: 'Idle', tone: ''}, 'heat pump idle']);
    expect(state(pump('off', {temperature: 22}))).toEqual([{text: 'Off', tone: ''}, 'heat pump off']);
    expect(state(pump('unavailable'))).toEqual([{text: 'Offline', tone: 'bad'}, 'heat pump offline']);
    // a mode stands in for a missing action as the legacy pill wrote it, cap(hp.state): 'Fan only' and 'Heat cool' where the buttons say Fan and Auto;
    // an action the catalog does not word is capitalised, the underscore a space
    expect(state(pump('fan_only', {}))[0]).toEqual({text: 'Fan only', tone: ''});
    expect(state(pump('heat_cool', {}))[0]).toEqual({text: 'Heat cool', tone: ''});
    expect(state(pump('cool', {temperature: 22}))[0]).toEqual({text: 'Cool to 22°', tone: ''});
    expect(state(pump('heat', {hvac_action: 'defrost_mode'}))[0]).toEqual({text: 'Defrost mode', tone: ''});
    // cooling lights the pill as heating does
    expect(state(pump('cool', {hvac_action: 'cooling', temperature: 22}))[0]).toEqual({
      text: 'Cooling to 22°',
      tone: 'on',
    });
  });

  test('without the config’s heat pump the summary has no word of it, and with an entity Home Assistant does not know it is offline', () => {
    expect(modelOf(houseOf([pump('heat')], [thermostat('den')]), 'house', {config: ROOMS}).summary).toBe(
      'no rooms heating',
    );
    expect(modelOf(houseOf([], [thermostat('den')]), 'hp', {config: PUMP})).toMatchObject({
      summary: 'no rooms heating · heat pump offline',
      detail: {pill: {text: 'Offline', tone: 'bad'}, controls: {kind: 'hp', offline: true}},
    });
  });

  test('named Fujitsu through FGLair, else by its maker, else Heat pump; and the last update is a dash when it is offline', () => {
    expect(pumpOf(['climate.pump', 'heat', {}, {platform: 'fglair'}]).detail.sub).toBe(
      'Fujitsu, through the FGLair integration',
    );
    expect(pumpOf(pump('heat', {}, {manufacturer: ''})).detail.sub).toBe('Heat pump');
    expect(pumpOf(pump('unavailable')).detail.tiles[1]?.value).toBe('–');
  });

  test('its controls: the modes in words (heat_cool is Auto), the target, the fan, the preset (none is Normal) and the louvers', () => {
    const controls = hp(pumpOf(pump('heat', ATTRS)).detail.controls);
    expect(controls.id).toBe('climate.pump');
    expect(controls.mode).toBe('heat');
    expect(controls.modes.map(m => [m.value, m.label, m.checked])).toEqual([
      ['off', 'Off', false],
      ['heat', 'Heat', true],
      ['cool', 'Cool', false],
      ['heat_cool', 'Auto', false],
      ['fan_only', 'Fan', false],
      ['eco_boost', 'Eco boost', false],
    ]);
    expect(controls.target).toEqual({value: 22, lo: 17, hi: 28});
    expect(controls.fan?.map(o => [o.label, o.checked])).toEqual([
      ['Quiet', false],
      ['Auto', true],
      ['Turbo max', false],
    ]);
    expect(controls.preset?.map(o => [o.label, o.checked])).toEqual([
      ['Normal', true],
      ['Comfort', false],
    ]);
    expect(controls.swing?.map(o => [o.label, o.checked])).toEqual([
      ['Swing up and down', false],
      ['Fixed', true],
      ['Fixed, vertical position 3', false],
      ['Fixed, horizontal position 2', false],
      ['Sideways wide', false],
    ]);
  });

  test('a unit that lists no modes offers off and heat, and one with no fan, preset or louvers offers none', () => {
    const controls = hp(pumpOf(pump('heat', {temperature: 21})).detail.controls);
    expect(controls.modes.map(m => m.value)).toEqual(['off', 'heat']);
    expect(controls).toMatchObject({fan: null, preset: null, swing: null, target: {value: 21, lo: 16, hi: 30}});
  });

  test('off: nothing but the modes; fan only and dry: no target; no target to report: no stepper; offline: nothing to adjust', () => {
    expect(hp(pumpOf(pump('off', ATTRS)).detail.controls)).toMatchObject({
      target: null,
      fan: null,
      preset: null,
      swing: null,
    });
    for (const mode of ['fan_only', 'dry']) {
      const controls = hp(pumpOf(pump(mode, ATTRS)).detail.controls);
      expect(controls.target).toBeNull();
      expect(controls.fan).not.toBeNull();
    }
    // a unit that reports no target still has its stepper, which reads a dash
    expect(hp(pumpOf(pump('heat', {...ATTRS, temperature: undefined})).detail.controls).target).toEqual({
      value: null,
      lo: 17,
      hi: 28,
    });
    expect(pumpOf(pump('unavailable', ATTRS)).detail.controls).toEqual({kind: 'hp', offline: true});
  });

  test('held values: the mode, the target, the fan, the preset and the louvers are the controls’ and the dial’s, not the pill’s', () => {
    const overlay = holding({
      [K.hp.mode('climate.pump')]: 'off',
      [K.hp.sp('climate.pump')]: 24,
      [K.hp.fan('climate.pump')]: 'quiet',
      [K.hp.preset('climate.pump')]: 'comfort',
      [K.hp.swing('climate.pump')]: 'vertical',
    });
    const held = pumpOf(pump('heat', ATTRS), {overlay, compact: true});
    // held off: the pill, the gauge's mark and the dial agree on it while the tap is pending
    expect(held.detail.dial).toMatchObject({editable: false, target: null, big: 'Off'});
    expect(held.detail.pill.text).toBe('Off');
    expect(pumpOf(pump('heat', ATTRS), {overlay}).detail.gauge?.geometry.setpoint).toBeNull();
    expect(hp(held.detail.controls)).toMatchObject({mode: 'off', fan: null, preset: null, swing: null});

    const stillOn = holding({
      [K.hp.sp('climate.pump')]: 24,
      [K.hp.fan('climate.pump')]: 'quiet',
      [K.hp.preset('climate.pump')]: 'comfort',
      [K.hp.swing('climate.pump')]: 'vertical',
    });
    const vm = pumpOf(pump('heat', ATTRS), {overlay: stillOn, compact: true});
    expect(vm.detail.dial).toMatchObject({
      editable: true,
      target: {kind: 'hp', id: 'climate.pump'},
      value: 24,
      lo: 17,
      hi: 28,
      big: '24.0°',
    });
    const controls = hp(vm.detail.controls);
    expect(controls.target?.value).toBe(24);
    expect(controls.fan?.find(o => o.checked)?.value).toBe('quiet');
    expect(controls.preset?.find(o => o.checked)?.value).toBe('comfort');
    expect(controls.swing?.find(o => o.checked)?.value).toBe('vertical');
  });

  test('in French: the actions and modes the layer translated, and the louvers', () => {
    const vm = pumpOf(pump('heat', ATTRS), {language: 'fr'});
    expect(vm.detail).toMatchObject({title: 'Thermopompe', sub: 'Daikin', pill: {text: 'Chauffe à 22°'}});
    expect(vm.summary).toContain('thermopompe : chauffe à 22°'.replace(' :', ' :'));
    // a mode standing in for a missing action reads as the layer translated the legacy pill: 'Fan only' was Ventilation, 'Heat cool' was Auto
    expect(pumpOf(pump('cool', {}), {language: 'fr'}).detail.pill.text).toBe('Frais');
    expect(pumpOf(pump('fan_only', {}), {language: 'fr'}).detail.pill.text).toBe('Ventilation');
    expect(pumpOf(pump('heat_cool', {}), {language: 'fr'}).detail.pill.text).toBe('Auto');
    const controls = hp(vm.detail.controls);
    expect(controls.modes.map(m => m.label)).toEqual([
      'Éteint',
      'Chauffage',
      'Frais',
      'Auto',
      'Ventilateur',
      'Eco boost',
    ]);
    expect(controls.fan?.map(o => o.label)).toEqual(['Silencieux', 'Auto', 'Turbo max']);
    expect(controls.preset?.[0]?.label).toBe('Normal');
    expect(controls.swing?.map(o => o.label).slice(0, 4)).toEqual([
      'Balayage vertical',
      'Fixe',
      'Fixe, position verticale 3',
      'Fixe, position horizontale 2',
    ]);
    expect(vm.detail.tiles[1]?.value).toMatch(/^\d{1,2} h( \d{2})?$/);
  });
});

describe('a house with nothing to read', () => {
  test('dashes and no words of rooms heating that are not there', () => {
    const vm = modelOf(houseOf([], []), 'house', {config: ROOMS, compact: true});
    expect(vm.summary).toBe('no rooms heating');
    expect(vm.detail.tiles.map(tile => [tile.value, tile.sub])).toEqual([
      ['–', null],
      ['–', null],
      ['0', 'all thermostats'],
      ['–', 'all thermostats'],
    ]);
    expect(vm.detail.dial).toMatchObject({big: '–', caption: ''});
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house and literal houses', () => {});
    return;
  }

  test('every selection the list offers has a detail, in both languages, on both devices', () => {
    const hass = fakeHass.fromFixture('main');
    for (const language of ['en', 'fr'] as const) {
      for (const compact of [false, true]) {
        const {items} = modelOf(hass, 'house', {language, compact});
        for (const item of items) {
          const vm = modelOf(hass, item.id, {language, compact});
          expect(vm.selection).toBe(item.id);
          expect(vm.detail.title).toBeTruthy();
          expect(vm.detail.controls.kind).toBe(item.id === 'house' ? 'house' : item.id === 'hp' ? 'hp' : 'room');
        }
      }
    }
  });
});
