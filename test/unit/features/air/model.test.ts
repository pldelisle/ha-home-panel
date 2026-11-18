// airModel: the Air card, the detail and the sub-line from the test house, from the recorded house when the owner has one, and from
// literal rooms for each shape the test house does not show; in English and in French, where the numbers are French's own.
import {describe, expect, test} from 'vitest';
import {readAir, type AirInputs} from '../../../../src/features/air/inputs.ts';
import {K} from '../../../../src/features/air/commands.ts';
import {airBrief, airModel, toneClass, type AirViewModel} from '../../../../src/features/air/model.ts';
import type {AirRoomInputs, OutsideAirInputs} from '../../../../src/providers/mila.ts';
import {fakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, readingOf, recorded, type Language} from '../media/support.ts';

const unheld = <T>(_key: string, current: T): T => current;
const holding =
  (held: Record<string, unknown>) =>
  <T>(key: string, current: T): T =>
    (key in held ? held[key] : current) as T;

const modelOf = (
  inputs: AirInputs,
  language: Language = 'en',
  extra: Partial<Parameters<typeof airModel>[1]> = {},
): AirViewModel => {
  const {t, fmt} = depsOf(fullHouse, language);
  return airModel(inputs, {now: 0, t, fmt, overlay: unheld, ...extra});
};

const NONE = {
  pm1: null,
  pm2_5: null,
  pm10: null,
  co: null,
  co2: null,
  voc: null,
  humidity: null,
  temperature: null,
  airQuality: null,
  airChanges: null,
};

/** A room that reads these numbers and nothing else, its fan on in Automagic at 40 percent. */
const room = (
  over: Partial<Omit<AirRoomInputs, 'readings'>> & {readings?: Partial<AirRoomInputs['readings']>} = {},
) => {
  const {readings, ...rest} = over;
  return {
    deviceId: 'd',
    fanId: 'fan.den',
    areaId: null,
    name: 'Den',
    sensors: {},
    readings: {...NONE, ...readings},
    fan: {on: true, available: true, percentage: 40, preset: 'Automagic'},
    ...rest,
  } satisfies AirRoomInputs;
};

const station = (over: Partial<OutsideAirInputs['readings']> = {}): OutsideAirInputs => ({
  aqi: 'sensor.out_aqi',
  pm: 'sensor.out_pm',
  distance: 'sensor.out_distance',
  pollen: [],
  readings: {
    aqi: 42,
    pm: 9,
    distance: 6,
    pollen: {trees: 'low', grass: 'none', weeds: null, mold: null},
    ...over,
  },
});

const inputsOf = (
  rooms: AirRoomInputs[],
  outside: OutsideAirInputs | null = null,
  aqhi: number | null = null,
  aqhiId: string | null = aqhi === null ? null : 'sensor.aqhi',
) => ({rooms, outside, aqhi, aqhiId});

describe('the test house', () => {
  const {states, registries, names, store} = readingOf(fullHouse);
  const inputs = readAir(states, registries, names, store.config);

  test('in English: a moderate office on Mila’s own index, the PM2.5 that is high, and a good outside', () => {
    const vm = modelOf(inputs);
    expect(vm.summary).toBe('1 purifier · Moderate · Office: PM2.5 20');
    expect(vm.card).toEqual({
      title: 'Air quality',
      empty: false,
      outside: {label: 'Outside AQI', aqi: '42', level: 'Good'},
      state: {tone: 1, text: 'Moderate', why: 'Office: PM2.5 20'},
      rooms: [
        {
          id: 'fan.office_purifier',
          name: 'Office',
          tone: 1,
          metrics: [
            {metric: 'pm2_5', label: 'PM2.5', value: '20', high: true},
            {metric: 'co2', label: 'CO₂', value: '640', high: false},
            {metric: 'voc', label: 'VOC', value: '180', high: false},
          ],
          line: 'Automagic · 40% · 38% RH',
        },
      ],
    });
  });

  test('in English: the detail’s room, its seven tiles and its control, and the outside block', () => {
    const {detail} = modelOf(inputs);
    expect(detail.sub).toBe('Moderate · Office: PM2.5 20');
    expect(detail.rooms[0]).toMatchObject({
      name: 'Office',
      state: 'Moderate',
      headline: 'PM2.5 moderate · 21.4°',
      control: {
        offline: false,
        modeLabel: 'Office mode',
        speed: null,
        hint: "Automagic sets the fan from the room's sensors, now 40%, 2.4 air changes an hour.",
      },
    });
    expect(detail.rooms[0].tiles.map(tile => `${tile.label} ${tile.value} ${tile.unit}`)).toEqual([
      'PM2.5 20 µg/m³',
      'CO₂ 640 ppm',
      'VOC 180 µg/m³',
      'CO 1.0 ppm',
      'PM1 6 µg/m³',
      'PM10 24 µg/m³',
      'Humidity 38 %',
    ]);
    expect(detail.outside).toMatchObject({
      state: 'Good',
      reading: {label: 'AQI', value: '42'},
      more: 'AQHI 2 · PM2.5 9.0 µg/m³ · station 6 km away',
      pollen: [
        {label: 'Trees pollen', value: 'Low'},
        {label: 'Grass pollen', value: 'None'},
        {label: 'Weeds pollen', value: 'None'},
        {label: 'Mold pollen', value: 'None'},
      ],
    });
    expect(detail.outdoorChart?.title).toBe('Outdoor air, last 24 hours');
  });

  test('in French: the words, and the numbers French writes (the comma, the space before the percent)', () => {
    const vm = modelOf(inputs, 'fr');
    expect(vm.summary).toBe('1 purificateur · Moyen · Office : PM2,5 20');
    expect(vm.card).toMatchObject({
      title: "Qualité de l'air",
      outside: {label: 'IQA extérieur', aqi: '42', level: 'Bon'},
      rooms: [{line: 'Automagic · 40 % · 38 % HR', metrics: [{label: 'PM2,5'}, {label: 'CO₂'}, {label: 'COV'}]}],
    });
    expect(vm.detail.rooms[0].tiles[3]).toMatchObject({label: 'CO', value: '1,0'});
    expect(vm.detail.rooms[0].headline).toBe('PM2,5 moyen · 21,4°');
    expect(vm.detail.outside?.more).toBe('CAS 2 · PM2,5 9,0 µg/m³ · station à 6 km');
    expect(vm.detail.outside?.pollen?.[0]).toEqual({label: 'Pollen des arbres', value: 'Bas', unit: ''});
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house', () => {});
    return;
  }

  test.each(['en', 'fr'] as const)('gives a model with one line and one detail per purifier, in %s', language => {
    const hass = fakeHass.fromFixture('main');
    const {states, registries, names, store} = readingOf(hass);
    const inputs = readAir(states, registries, names, store.config);
    const vm = modelOf(inputs, language);
    expect(vm.detail.rooms).toHaveLength(inputs.rooms.length);
    expect(vm.card.empty).toBe(inputs.rooms.length === 0);
    expect(vm.detail.outside === null).toBe(inputs.outside === null);
  });
});

describe('the summary and the card’s state', () => {
  test('no purifier: the one empty line, and a card that says only that', () => {
    const vm = modelOf(inputsOf([]));
    expect(vm.summary).toBe('No purifiers found');
    expect(vm.card).toEqual({title: 'Air quality', empty: true, message: 'No purifiers found'});
    expect(vm.detail.sub).toBe('No readings yet');
    expect(vm.detail.outside).toBeNull();
    expect(vm.detail.outdoorChart).toBeNull();
  });

  test('every room clean: the count says all of them, and the sub-line is the good level alone', () => {
    const vm = modelOf(
      inputsOf([room({readings: {co2: 500}}), room({fanId: 'fan.b', name: 'Bed', readings: {pm2_5: 4}})]),
    );
    expect(vm.summary).toBe('2 purifiers · Good');
    expect(vm.card).toMatchObject({state: {tone: 0, text: 'Good', why: 'All 2 rooms clean'}});
    expect(vm.detail.sub).toBe('Good in every room');
  });

  test('one room that reads nothing: no data, a dash, and nothing is clean', () => {
    const vm = modelOf(inputsOf([room()]));
    expect(vm.summary).toBe('1 purifier · no data');
    expect(vm.card).toMatchObject({state: {tone: 0, text: 'No data', why: '0 of 1 rooms clean'}});
    expect(vm.detail.sub).toBe('No readings yet');
    expect(vm.detail.rooms[0]).toMatchObject({state: '–', headline: 'No readings', tone: 0});
  });

  test('a clean room beside a room that reads nothing: how many are clean', () => {
    const vm = modelOf(inputsOf([room({readings: {co2: 500}}), room({fanId: 'fan.b', name: 'Bed'})]));
    expect(vm.card).toMatchObject({state: {why: '1 of 2 rooms clean'}});
  });

  test('the worst rooms only, each with what is high: the pollutants at the top level, else Mila’s index', () => {
    const vm = modelOf(
      inputsOf([
        room({name: 'Den', readings: {pm2_5: 40, co2: 1500, voc: 100, co: 12}}),
        room({fanId: 'fan.b', name: 'Bed', readings: {airQuality: 120}}),
        room({fanId: 'fan.c', name: 'Hall', readings: {pm2_5: 20}}),
      ]),
    );
    expect(vm.summary).toBe('3 purifiers · Poor · Den: PM2.5 40, CO₂ 1,500 · Bed: Mila index 120');
    expect(vm.card).toMatchObject({state: {tone: 2, text: 'Poor'}});
    expect(vm.detail.sub).toBe('Poor · Den: PM2.5 40, CO₂ 1,500 · Bed: Mila index 120');
  });

  test('the room’s headline: the pollutants and their level in lower case, Mila’s index, or clean air, with the temperature', () => {
    const headline = (readings: Partial<AirRoomInputs['readings']>) =>
      modelOf(inputsOf([room({readings})])).detail.rooms[0].headline;
    expect(headline({co2: 1500, voc: 100})).toBe('CO₂ poor');
    expect(headline({pm2_5: 20, co: 20})).toBe('PM2.5 moderate, CO moderate');
    expect(headline({airQuality: 80})).toBe('Mila index 80');
    expect(headline({co2: 500, temperature: 20})).toBe('Clean air · 20.0°');
  });
});

describe('the More sheet’s word', () => {
  const brief = (rooms: AirRoomInputs[], language: Language = 'en') => airBrief(rooms, depsOf(fullHouse, language).t);

  test('the worst room’s level alone, "No data" when none reads, "No purifiers" without one', () => {
    expect(brief([])).toBe('No purifiers');
    expect(brief([room()])).toBe('No data');
    expect(brief([room({readings: {co2: 500}}), room({fanId: 'fan.b', readings: {pm2_5: 20}})])).toBe('Moderate');
    expect(brief([room({readings: {pm2_5: 40}}), room({fanId: 'fan.b', readings: {co2: 500}})])).toBe('Poor');
  });

  test('is French in French', () => {
    expect(brief([], 'fr')).toBe('Aucun purificateur');
    expect(brief([room({readings: {co2: 500}})], 'fr')).toBe('Bon');
  });
});

describe('the card’s figures', () => {
  const metrics = (readings: Partial<AirRoomInputs['readings']>, language: Language = 'en') => {
    const vm = modelOf(inputsOf([room({readings})]), language);
    return vm.card.empty ? [] : vm.card.rooms[0].metrics.map(m => m.value);
  };

  test('a missing reading is a dash, whole numbers are whole, and thousands are written in k', () => {
    expect(metrics({pm2_5: 4.4, voc: 999})).toEqual(['4', '–', '999']);
    expect(metrics({co2: 1000, voc: 1550})).toEqual(['–', '1.0k', '1.6k']);
    expect(metrics({co2: 9999, voc: 12_500})).toEqual(['–', '10.0k', '13k']);
  });

  test('in French the decimal is a comma', () => {
    expect(metrics({co2: 1500}, 'fr')).toEqual(['–', '1,5k', '–']);
  });

  test('carbon monoxide has a decimal under ten and none from ten, on the detail’s tile', () => {
    const co = (value: number) => modelOf(inputsOf([room({readings: {co: value}})])).detail.rooms[0].tiles[3].value;
    expect([co(0.5), co(9.9), co(10)]).toEqual(['0.5', '9.9', '10']);
  });

  test('the particles and the humidity are whole numbers, "No reading" with no unit when missing; only rated pollutants run high', () => {
    const tiles = modelOf(inputsOf([room({readings: {pm1: 5.6, humidity: 38.4, pm2_5: 40}})])).detail.rooms[0].tiles;
    const none = {value: 'No reading', unit: '', missing: true};
    expect(tiles.map(({value, unit, missing}) => ({value, unit, ...(missing ? {missing} : {})}))).toEqual([
      expect.objectContaining({value: '40'}),
      none,
      none,
      none,
      expect.objectContaining({value: '6'}),
      none,
      expect.objectContaining({value: '38'}),
    ]);
    expect(tiles.map(tile => tile.high)).toEqual([true, false, false, false, false, false, false]);
  });
});

describe('the fan’s line and control', () => {
  const lineOf = (over: Parameters<typeof room>[0], extra = {}) => {
    const vm = modelOf(inputsOf([room(over)]), 'en', extra);
    return vm.card.empty ? '' : vm.card.rooms[0].line;
  };
  const controlOf = (over: Parameters<typeof room>[0], extra = {}) =>
    modelOf(inputsOf([room(over)]), 'en', extra).detail.rooms[0].control;

  test('Automagic, Manual, off and offline, each with the humidity when there is one', () => {
    const humid = {readings: {humidity: 45.4}};
    expect(lineOf(humid)).toBe('Automagic · 40% · 45% RH');
    expect(lineOf({...humid, fan: {on: true, available: true, percentage: 60, preset: 'Manual'}})).toBe(
      'Manual · 60% · 45% RH',
    );
    expect(lineOf({...humid, fan: {on: false, available: true, percentage: 40, preset: 'Automagic'}})).toBe(
      'Fan off · 45% RH',
    );
    expect(lineOf({fan: {on: true, available: false, percentage: 0, preset: null}})).toBe('Purifier offline');
  });

  test('a preset that is not Automagic reads as Manual, as the legacy panel read it', () => {
    expect(lineOf({fan: {on: true, available: true, percentage: 30, preset: 'Sleep'}})).toBe('Manual · 30%');
  });

  test('a held preset and speed show in the line and in the control from the one overlay', () => {
    const held = {overlay: holding({[K.mode('fan.den')]: 'Manual', [K.pct('fan.den')]: 70})};
    expect(lineOf({}, held)).toBe('Manual · 70%');
    expect(controlOf({}, held)).toMatchObject({
      modes: [
        {mode: 'Automagic', checked: false},
        {mode: 'Manual', checked: true},
      ],
      speed: {pct: 70, text: '70%', caption: 'Fan', label: 'Den fan speed'},
      hint: null,
    });
  });

  test('Automagic’s hint names the speed only when the fan is on and the air changes only when it reads them', () => {
    const hint = (over: Parameters<typeof room>[0]) => {
      const control = controlOf(over);
      return control.offline ? null : control.hint;
    };
    expect(hint({})).toBe("Automagic sets the fan from the room's sensors, now 40%.");
    expect(
      hint({fan: {on: false, available: true, percentage: 40, preset: 'Automagic'}, readings: {airChanges: 3}}),
    ).toBe("Automagic sets the fan from the room's sensors, 3.0 air changes an hour.");
  });

  test('an offline purifier cannot be adjusted', () => {
    expect(controlOf({fan: {on: false, available: false, percentage: 0, preset: null}})).toEqual({
      offline: true,
      message: "The purifier is offline, so it can't be adjusted right now.",
    });
  });
});

describe('the outside air', () => {
  const outside = (over: Parameters<typeof station>[0], aqhi: number | null = null) =>
    modelOf(inputsOf([room()], station(over), aqhi)).detail;

  test('no reading: no data, a dash, no level on the card; the facts that exist are joined', () => {
    const vm = modelOf(inputsOf([room()], station({aqi: null, pm: null, distance: 7.4})));
    expect(vm.card).toMatchObject({outside: null});
    expect(vm.detail.outside).toMatchObject({
      state: 'No data',
      reading: {value: 'No reading', unit: '', missing: true},
      more: 'station 7 km away',
      tone: 0,
    });
  });

  test('the level follows the US scale, and the AQHI prints as the legacy panel printed it: the number as it is', () => {
    const moderate = outside({aqi: 75}, 3.254).outside;
    expect(moderate).toMatchObject({state: 'Moderate', tone: 1});
    expect(moderate?.more).toContain('AQHI 3.254');
    expect(outside({aqi: 120}).outside).toMatchObject({state: 'Poor', tone: 2});
  });

  test('pollen: the statuses the catalog words, any other capitalised with its underscores read as spaces, "No reading" when one is missing; none reported is the hint', () => {
    const pollen = outside({pollen: {trees: 'very_high', grass: 'very_low', weeds: 'extreme', mold: null}}).outside
      ?.pollen;
    expect(pollen?.map(p => p.value)).toEqual(['Very high', 'Very low', 'Extreme', 'No reading']);
    const none = outside({pollen: {trees: null, grass: null, weeds: null, mold: null}}).outside;
    expect(none).toMatchObject({
      pollen: null,
      pollenHint: 'No pollen report from the station yet; it shows up here once Mila has one.',
    });
  });

  test('the outdoor chart is offered with a station’s index or an AQHI sensor that exists, and not without either', () => {
    expect(modelOf(inputsOf([room()], station())).detail.outdoorChart).toMatchObject({
      title: 'Outdoor air, last 24 hours',
    });
    expect(modelOf(inputsOf([room()], null, 3)).detail.outdoorChart).not.toBeNull();
    // the AQHI sensor exists but reads nothing now: the chart is still asked for, as the legacy sheet did
    expect(modelOf(inputsOf([room()], null, null, 'sensor.aqhi')).detail.outdoorChart).not.toBeNull();
    expect(modelOf(inputsOf([room()], {...station(), aqi: null})).detail.outdoorChart).toBeNull();
  });
});

describe('the detail’s outdoor chart follows the range', () => {
  test('the range words the outdoor chart’s title, and the detail carries no metric chart: the tiles open it', () => {
    const week = modelOf(inputsOf([room()], station()), 'en', {range: 'week'});
    expect(week.detail.outdoorChart?.title).toBe('Outdoor air, last 7 days');
    expect(modelOf(inputsOf([room()], station()), 'en', {range: 'month'}).detail.outdoorChart?.title).toBe(
      'Outdoor air, last 30 days',
    );
    expect(Object.keys(week.detail)).not.toContain('history');
  });

  test('each of the two charts is named and captioned for its own scale, in English and in French', () => {
    expect(modelOf(inputsOf([room()], station())).detail.outdoorChart).toMatchObject({
      aqi: {title: 'AQI (Mila station)', caption: 'US AQI from the station: good up to 50, moderate up to 100.'},
      aqhi: {title: 'AQHI (Environment Canada)', caption: 'The AQHI from Environment Canada, on its 1 to 10 scale.'},
    });
    expect(modelOf(inputsOf([room()], station()), 'fr').detail.outdoorChart).toMatchObject({
      aqi: {
        title: 'IQA (station Mila)',
        caption: 'IQA américain de la station\u202f: bon jusqu’à 50, modéré jusqu’à 100.',
      },
      aqhi: {
        title: 'CAS (Environnement Canada)',
        caption: 'La cote air santé d’Environnement Canada, sur son échelle de 1 à 10.',
      },
    });
  });
});

describe('a tile opens its history', () => {
  test('each of the seven tiles shows its reading, value and unit, and says what a tap does as a description', () => {
    const {states, registries, names, store} = readingOf(fullHouse);
    const {tiles} = modelOf(readAir(states, registries, names, store.config)).detail.rooms[0];
    expect(tiles.map(tile => `${tile.label} ${tile.value}${tile.unit}`)).toEqual([
      'PM2.5 20µg/m³',
      'CO₂ 640ppm',
      'VOC 180µg/m³',
      'CO 1.0ppm',
      'PM1 6µg/m³',
      'PM10 24µg/m³',
      'Humidity 38%',
    ]);
    expect(tiles.map(tile => tile.opens)).toEqual(Array(7).fill('Opens its history'));
  });

  test('in French, the description and the number are French’s own', () => {
    const fr = modelOf(inputsOf([room({readings: {co: 1}})]), 'fr').detail.rooms[0].tiles;
    expect(fr[3].opens).toBe('Ouvre l’historique');
    expect(fr[3].value).toBe('1,0');
  });

  test('a reading with no value says "No reading" and still says what a tap does', () => {
    const {tiles} = modelOf(inputsOf([room()])).detail.rooms[0];
    expect(tiles[0]).toMatchObject({value: 'No reading', unit: '', missing: true});
    expect(tiles[0].opens).toBe('Opens its history');
  });
});

describe('toneClass: the kit’s dotted text for an Air level', () => {
  test('good is ok, moderate is warn, poor is bad', () => {
    expect(([0, 1, 2] as const).map(toneClass)).toEqual(['ok', 'warn', 'bad']);
  });
});
