// weatherModel: the inputs, the forecast and the clock in, the strings the Weather elements place out. The expected strings
// are literals: the full test house's are the values and the texts of the Weather baselines at the afternoon instant
// (weather-tablet-light-en and -fr, bare-weather-tablet-light-en), so this test is those pixels' textual twin.
import {existsSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {conditionName} from '../../../../src/core/i18n/condition-name.ts';
import {aqhiRisk, uvWord, weatherBrief, weatherCardName} from '../../../../src/features/weather/model.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {EMPTY_INPUTS, type WeatherInputs} from '../../../../src/providers/weather-source.ts';
import {REFERENCE_MS} from '../../../houses/clock.mjs';
import {fakeHass} from '../../fake-hass.ts';
import {bareHouse, fullHouse, inEnglish, inputsWith, modelFromInputs, modelOf, shown} from './support.ts';

describe('the full test house, in English', () => {
  const model = modelOf(fullHouse, 'en');

  test('the pane sub-line', () => {
    expect(model.summary).toBe('Mainly sunny · observed 1:30 pm · pressure rising · no alerts');
  });

  test('the detail panel: the big reading, the line under it and the eight tiles in the detail wording', () => {
    expect(model.now).toMatchObject({
      temperature: '4.2°',
      condition: 'Mainly sunny',
      icon: {condition: 'Mainly Sunny', day: true, label: 'Mainly sunny'},
      line: 'High 7° · Low -1°',
      summary: 'Sunny with cloudy periods.',
    });
    expect(shown(model.now.tiles)).toEqual([
      {key: 'wind', value: '14', unit: 'km/h', sub: 'SW · gusts 25'},
      {key: 'hum', value: '71', unit: '%', sub: 'dew point -0.5°'},
      {key: 'pres', value: '101.9', unit: 'kPa', sub: 'rising'},
      {key: 'pop', value: 'No reading', unit: '', sub: 'chance today'},
      {key: 'uv', value: '1', unit: '', sub: 'low'},
      {key: 'aqhi', value: '2', unit: '', sub: 'AQHI, low risk'},
      {key: 'feels', value: '4.2°', unit: '', sub: 'same as the air'},
      {key: 'normal', value: '6° / -2°', unit: '', sub: 'high / low for the date'},
    ]);
    expect(model.now.tiles.every(tile => tile.tone === null && tile.arrow === null)).toBe(true);
  });

  test('the sun block: the daylight, the arc, and the times with their first and last light', () => {
    expect(model.sun).toEqual({
      daylight: '10 h 0 min of daylight, 2 min 32 s shorter than yesterday',
      label: 'Sun position: 70 percent through the day',
      isUp: true,
      percent: 70,
      cx: 219.2,
      cy: 40.1,
      events: [
        {key: 'sunrise', label: 'Sunrise', time: '7:02 am', sub: 'first light 6:32 am'},
        {key: 'noon', label: 'Solar noon', time: '12:02 pm', sub: ''},
        {key: 'sunset', label: 'Sunset', time: '5:02 pm', sub: 'last light 5:33 pm'},
      ],
    });
  });

  test('no alerts, and no forecast until one arrives', () => {
    expect(model.alerts).toEqual([]);
    expect(model.hours).toEqual([]);
    expect(model.hourSeries).toEqual({temperature: [], pop: []});
    expect(model.days).toEqual([]);
  });
});

describe('the full test house, in French', () => {
  const model = modelOf(fullHouse, 'fr');

  test("the pane sub-line, with Environment Canada's phrase worded by the catalog as the -fr baseline reads it", () => {
    expect(model.summary).toBe('Généralement ensoleillé · observé à 13 h 30 · pression en hausse · aucune alerte');
  });

  test('the detail panel, as the French baseline shows it', () => {
    expect(model.now).toMatchObject({temperature: '4,2°', line: 'Max 7° · Min -1°'});
    expect(shown(model.now.tiles)).toEqual([
      {key: 'wind', value: '14', unit: 'km/h', sub: 'SO · gusts 25'},
      {key: 'hum', value: '71', unit: '%', sub: 'point de rosée -0,5°'},
      {key: 'pres', value: '101,9', unit: 'kPa', sub: 'en hausse'},
      {key: 'pop', value: 'Aucune mesure', unit: '', sub: "probabilité aujourd'hui"},
      {key: 'uv', value: '1', unit: '', sub: 'min'},
      {key: 'aqhi', value: '2', unit: '', sub: 'CAS, risque faible'},
      {key: 'feels', value: '4,2°', unit: '', sub: "comme l'air"},
      {key: 'normal', value: '6° / -2°', unit: '', sub: 'max / min pour la date'},
    ]);
  });

  test('the sun block', () => {
    expect(model.sun).toMatchObject({
      daylight: "10 h 0 min d'ensoleillement, 2 min 32 s de moins qu'hier",
      label: 'Position du soleil : 70 pour cent de la journée',
      events: [
        {label: 'Lever du soleil', time: '7 h 02', sub: 'aube 6 h 32'},
        {label: 'Midi solaire', time: '12 h 02', sub: ''},
        {label: 'Coucher du soleil', time: '17 h 02', sub: 'crépuscule 17 h 33'},
      ],
    });
  });
});

describe('the bare test house: only the weather entity', () => {
  test('shows the temperature and the condition of the baseline, and what the entity itself says', () => {
    const model = modelOf(bareHouse, 'en');
    expect(model.summary).toBe('Partly cloudy · no alerts');
    expect(model.now).toMatchObject({temperature: '4.2°', condition: 'Partly cloudy', line: '', summary: null});
    // the baseline shows dashes where the entity has a reading: the entity's humidity, pressure and wind are new to the pane
    expect(shown(model.now.tiles).slice(0, 3)).toEqual([
      {key: 'wind', value: '14', unit: 'km/h', sub: ''},
      {key: 'hum', value: '71', unit: '%', sub: ''},
      {key: 'pres', value: '101.9', unit: 'kPa', sub: ''},
    ]);
    expect(shown(model.now.tiles).slice(3)).toEqual([
      {key: 'pop', value: 'No reading', unit: '', sub: 'chance today'},
      {key: 'uv', value: 'No reading', unit: '', sub: ''},
      {key: 'aqhi', value: 'No reading', unit: '', sub: 'AQHI'},
      {key: 'feels', value: '4.2°', unit: '', sub: 'same as the air'},
      {key: 'normal', value: 'No reading', unit: '', sub: 'high / low for the date'},
    ]);
  });
});

describe('a house that knows nothing', () => {
  const model = modelFromInputs(EMPTY_INPUTS, 'en');

  test('says dashes, and nothing for what it cannot say', () => {
    expect(model.summary).toBe('no alerts');
    expect(shown(model.now.tiles).map(tile => [tile.value, tile.unit])).toEqual(Array(8).fill(['No reading', '']));
    expect(model.now).toMatchObject({
      temperature: 'No reading',
      temperatureMissing: true,
      condition: '',
      line: '',
      summary: null,
    });
  });
});

describe('the condition names', () => {
  const t = createMessages({language: 'en', tag: 'en-CA'}).t;

  test('Home Assistant words come from the catalog', () => {
    expect(conditionName('partlycloudy', t)).toBe('Partly cloudy');
    expect(conditionName('lightning-rainy', t)).toBe('Thunderstorms and rain');
    expect(conditionName('clear-night', t)).toBe('Clear');
  });

  test("an integration's own word is capitalised and lower-cased (the old COND fallback)", () => {
    expect(conditionName('Mainly Sunny', t)).toBe('Mainly sunny');
    expect(conditionName('LIGHT SNOW', t)).toBe('Light snow');
    expect(conditionName('drizzle', t)).toBe('Drizzle');
  });

  test('no condition has no name', () => {
    expect(conditionName(null, t)).toBe('');
    expect(conditionName('', t)).toBe('');
  });
});

describe('the pane sub-line', () => {
  test('names the station, or leaves the observation out', () => {
    const at = REFERENCE_MS - 1800e3;
    expect(inEnglish({condition: 'rainy', observation: {at, station: 'Springfield Airport'}}).summary).toBe(
      'Rain · observed 1:30 pm at Springfield Airport · no alerts',
    );
    expect(inEnglish({condition: 'rainy', observation: {at, station: null}}).summary).toBe(
      'Rain · observed 1:30 pm · no alerts',
    );
  });

  test('says a pressure tendency in the catalog words, and passes an unknown word as it is', () => {
    expect(inEnglish({pressure: {kpa: null, tendency: 'Falling'}}).summary).toBe('pressure falling · no alerts');
    expect(inEnglish({pressure: {kpa: null, tendency: 'Steady'}}).summary).toBe('pressure steady · no alerts');
    expect(inEnglish({pressure: {kpa: null, tendency: 'Variable'}}).summary).toBe('pressure variable · no alerts');
  });

  test('counts the alerts, with the plural', () => {
    const alert = {kind: 'warning', tone: 'crit', title: 'Frost warning', count: null, time: null} as const;
    expect(inEnglish({alerts: [alert]}).summary).toBe('1 alert in effect');
    expect(inEnglish({alerts: [alert, alert, alert]}).summary).toBe('3 alerts in effect');
  });
});

describe('alerts', () => {
  test('carry the tone, the kind word, the title and the time', () => {
    const model = inEnglish({
      alerts: [
        {kind: 'warning', tone: 'crit', title: 'Snowfall warning', count: null, time: 'Friday 9:00 pm'},
        {kind: 'statement', tone: 'ok', title: 'Special weather statement', count: null, time: null},
      ],
    });
    expect(model.alerts).toEqual([
      {tone: 'crit', kind: 'Warning', title: 'Snowfall warning', time: 'Friday 9:00 pm'},
      {tone: 'ok', kind: 'Statement', title: 'Special weather statement', time: null},
    ]);
  });

  // the wording is the legacy panel's own, misspellings included (watchs, advisorys): the rewrite layer translates them by that text
  test.each([
    ['warning', 'Warning', 1, '1 warning in effect', 'Avertissement', '1 avertissement en vigueur'],
    ['warning', 'Warning', 2, '2 warnings in effect', 'Avertissement', '2 avertissements en vigueur'],
    ['watch', 'Watch', 1, '1 watch in effect', 'Veille', '1 veille en vigueur'],
    ['watch', 'Watch', 2, '2 watchs in effect', 'Veille', '2 veilles en vigueur'],
    ['advisory', 'Advisory', 1, '1 advisory in effect', 'Avis', '1 avis en vigueur'],
    ['advisory', 'Advisory', 2, '2 advisorys in effect', 'Avis', '2 avis en vigueur'],
    ['statement', 'Statement', 1, '1 statement in effect', 'Bulletin', '1 bulletin en vigueur'],
    ['statement', 'Statement', 2, '2 statements in effect', 'Bulletin', '2 bulletins en vigueur'],
  ] as const)(
    'a %s sensor that only counts says %s of them, in both languages (%s, %s)',
    (kind, kindEn, count, wordsEn, kindFr, wordsFr) => {
      const counted = inputsWith({alerts: [{kind, tone: 'warn', title: null, count, time: null}]});
      expect(modelFromInputs(counted, 'en').alerts).toEqual([{tone: 'warn', kind: kindEn, title: wordsEn, time: null}]);
      expect(modelFromInputs(counted, 'fr').alerts).toEqual([{tone: 'warn', kind: kindFr, title: wordsFr, time: null}]);
    },
  );
});

describe('the lines under the temperature', () => {
  const line = (patch: Partial<WeatherInputs>) => inEnglish(patch).now.line;

  test('the line says the high and low, and does not say the normals', () => {
    expect(line({today: {hi: 14, lo: 6, pop: null}})).toBe('High 14° · Low 6°');
    expect(line({today: {hi: 14, lo: 6, pop: null}, normals: {hi: 9, lo: 1}, temperature: 10})).toBe(
      'High 14° · Low 6°',
    );
  });

  test('a set the French map has no sentence for is joined from its parts', () => {
    expect(line({today: {hi: null, lo: 6, pop: null}})).toBe('Low 6°');
    expect(line({today: {hi: 14, lo: null, pop: null}})).toBe('High 14°');
    expect(line({normals: {hi: 9, lo: 1}})).toBe('');
  });

  test('the detail line says Feels like first, when the feels-like differs from the air by a degree or more', () => {
    const base = {today: {hi: 14, lo: 6, pop: null}, temperature: 12.5};
    expect(inEnglish({...base, feelsLike: {value: 10, kind: 'windChill'}}).now.line).toBe(
      'Feels like 10.0° · High 14° · Low 6°',
    );
    expect(inEnglish({...base, feelsLike: {value: 12, kind: 'humidex'}}).now.line).toBe('High 14° · Low 6°');
    expect(inEnglish({today: base.today, feelsLike: {value: 3, kind: 'windChill'}}).now.line).toBe(
      'Feels like 3.0° · High 14° · Low 6°',
    );
  });

  test('rounds to the whole degree and never writes a negative zero', () => {
    expect(inEnglish({today: {hi: 0.4, lo: -0.4, pop: null}}).now.line).toBe('High 0° · Low 0°');
    expect(inEnglish({today: {hi: 14.5, lo: -1.5, pop: null}}).now.line).toBe('High 15° · Low -1°');
  });

  test('the temperature keeps its decimal, even a zero one, and says "No reading" without one', () => {
    expect(inEnglish({temperature: 5}).now.temperature).toBe('5.0°');
    expect(inEnglish({temperature: -3.04}).now.temperature).toBe('-3.0°');
    expect(inEnglish({temperature: null}).now).toMatchObject({temperature: 'No reading', temperatureMissing: true});
  });
});

describe('the tiles', () => {
  const tile = (patch: Partial<WeatherInputs>, key: string) => inEnglish(patch).now.tiles.find(t => t.key === key)!;

  test('wind: the direction, the gust, and a bearing arrow drawn after the compass point', () => {
    const wind = {speed: 14.4, gust: 25.5, direction: 'NW', bearing: 315};
    expect(tile({wind}, 'wind')).toMatchObject({
      value: '14',
      unit: 'km/h',
      sub: 'NW · gusts 26',
      arrow: {bearing: 315, after: 2},
    });
    expect(tile({wind: {...wind, direction: null}}, 'wind').arrow).toEqual({bearing: 315, after: 0});
    expect(tile({wind: {speed: null, gust: null, direction: null, bearing: null}}, 'wind')).toMatchObject({
      value: 'No reading',
      unit: '',
      sub: '',
      missing: true,
    });
  });

  test('wind in a direction the catalog does not name is shown as it is', () => {
    expect(tile({wind: {speed: 3, gust: null, direction: 'VRB', bearing: null}}, 'wind').sub).toBe('VRB');
  });

  test('feels like: wind chill or humidex with its word, the air when there is none, and the visibility', () => {
    expect(tile({feelsLike: {value: -9.4, kind: 'windChill'}, temperature: -3}, 'feels')).toMatchObject({
      value: '-9.4°',
      sub: 'wind chill',
    });
    expect(tile({feelsLike: {value: 31, kind: 'humidex'}, temperature: 26}, 'feels')).toMatchObject({
      value: '31.0°',
      sub: 'humidex',
    });
    expect(tile({temperature: 4.2, visibility: 11.6}, 'feels')).toMatchObject({value: '4.2°', sub: 'visibility 12 km'});
    expect(tile({temperature: null}, 'feels')).toMatchObject({value: 'No reading', unit: '', sub: 'same as the air'});
  });

  test('UV: the index word at each threshold', () => {
    const detail = (uv: number) => tile({uv}, 'uv').sub;
    expect([0, 2.9, 3, 5, 6, 7.9, 8, 10, 11].map(detail)).toEqual([
      'low',
      'low',
      'moderate',
      'moderate',
      'high',
      'high',
      'very high',
      'very high',
      'extreme',
    ]);
    expect(tile({uv: 6}, 'uv').value).toBe('6');
    expect(tile({uv: null}, 'uv')).toMatchObject({value: 'No reading', sub: ''});
  });

  test('air quality: the risk at each threshold', () => {
    const detail = (aqhi: number) => tile({aqhi}, 'aqhi').sub;
    expect([2, 3, 4, 6, 7, 10, 11].map(detail)).toEqual([
      'AQHI, low risk',
      'AQHI, low risk',
      'AQHI, moderate risk',
      'AQHI, moderate risk',
      'AQHI, high risk',
      'AQHI, high risk',
      'AQHI, very high risk',
    ]);
    expect(tile({aqhi: 3}, 'aqhi').value).toBe('3');
    expect(tile({aqhi: null}, 'aqhi').value).toBe('No reading');
  });

  test('humidity, pressure, rain and snow: the detail keeps the reading', () => {
    const readings = {
      humidity: 71.4,
      dewPoint: -0.52,
      pressure: {kpa: 100, tendency: 'falling'},
      today: {hi: null, lo: null, pop: 40},
    };
    expect(tile(readings, 'hum')).toMatchObject({value: '71.4', unit: '%', sub: 'dew point -0.5°'});
    expect(tile(readings, 'pres')).toMatchObject({value: '100.0', unit: 'kPa', sub: 'falling'});
    expect(tile(readings, 'pop')).toMatchObject({value: '40', unit: '%', sub: 'chance today'});
    expect(tile({pressure: {kpa: null, tendency: 'some_odd_word'}}, 'pres').sub).toBe('some_odd_word');
  });

  test('normal: the high and the low, or the high alone when the low is not known', () => {
    expect(tile({normals: {hi: 6.4, lo: null}}, 'normal').value).toBe('6°');
    expect(tile({normals: {hi: 6.4, lo: 1}}, 'normal').value).toBe('6° / 1°');
  });

  test('the eight tiles come in the detail order', () => {
    const model = inEnglish({});
    expect(model.now.tiles.map(t => t.key)).toEqual(['wind', 'hum', 'pres', 'pop', 'uv', 'aqhi', 'feels', 'normal']);
  });
});

describe('the sun block', () => {
  const at = (iso: string) => Date.parse(iso);

  test('at night: below the horizon, no dot on the arc, and the arc at its start', () => {
    const night = modelFromInputs(EMPTY_INPUTS, 'en', {now: at('2026-11-07T23:30:00-05:00')}).sun!;
    expect(night).toMatchObject({isUp: false, percent: 100, label: 'Sun position: below the horizon'});
    const morning = modelFromInputs(EMPTY_INPUTS, 'en', {now: at('2026-11-07T05:00:00-05:00')}).sun!;
    expect(morning).toMatchObject({isUp: false, percent: 0, cx: 30, cy: 130});
  });

  test('the first light is said only when the house has a sensor for it', () => {
    const without = inEnglish({sun: {up: true, next: null, hasFirstLight: false}}).sun!;
    expect(without.events[0].sub).toBe('');
    expect(without.events[2].sub).toBe('last light 5:33 pm');
  });

  test('the days grow longer after the winter solstice', () => {
    const model = modelFromInputs(EMPTY_INPUTS, 'en', {now: at('2027-01-20T12:00:00-05:00')});
    expect(model.sun!.daylight).toMatch(/of daylight, \d+ min \d+ s longer than yesterday$/);
  });

  test('where the sun does not rise or set there is no block', () => {
    const polar = modelFromInputs(EMPTY_INPUTS, 'en', {where: {latitude: 78.22, longitude: 15.65}});
    expect(polar.sun).toBeNull();
  });

  test('the first day of the sun after the polar night is compared with itself, so its change is nothing', () => {
    const first = modelFromInputs(EMPTY_INPUTS, 'en', {
      now: at('2027-01-16T12:00:00Z'),
      where: {latitude: 69.65, longitude: 18.96},
    });
    expect(first.sun!.daylight).toMatch(/of daylight, 0 min 0 s longer than yesterday$/);
  });
});

// the owner records the real house with `npm run record:fixture` (#170); until `main.json` is in the repository this is skipped
const RECORDED = new URL('../../fixtures/houses/main.json', import.meta.url);

describe('the recorded house', () => {
  if (!existsSync(RECORDED)) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested from the made-up houses', () => {});
    return;
  }

  const strings = (value: unknown): string[] =>
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : [];

  test.each(['en', 'fr'] as const)('in %s every string is worded and the eight tiles are there', language => {
    const model = modelOf(fakeHass.fromFixture('main'), language);
    expect(model.now.tiles).toHaveLength(8);
    for (const text of strings(model)) expect(text).not.toMatch(/NaN|undefined|\[object/);
  });
});

describe('the word under Weather in More', () => {
  const deps = {
    fmt: createFormatters(englishLocale('America/Toronto')),
    t: createMessages({language: 'en', tag: 'en-CA'}).t,
  };

  test("is the temperature to a tenth and the condition, in the catalog's words", () => {
    expect(weatherBrief(inputsWith({temperature: 4.2, condition: 'partlycloudy'}), deps)).toBe('4.2° · Partly cloudy');
    expect(
      weatherBrief(
        inputsWith({temperature: -0.4, condition: 'Mainly Sunny', conditionWords: 'weather.cond.ec.mainlySunny'}),
        deps,
      ),
    ).toBe('-0.4° · Mainly sunny');
  });

  test('is empty when the house has no temperature', () => {
    expect(weatherBrief(inputsWith({condition: 'rainy'}), deps)).toBe('');
  });

  test("names the phone's Home card for a screen reader: the temperature, the condition and where a tap goes", () => {
    expect(
      weatherCardName(
        inputsWith({temperature: 4.2, condition: 'Mainly Sunny', conditionWords: 'weather.cond.ec.mainlySunny'}),
        deps,
      ),
    ).toBe('Weather: 4.2°, mainly sunny. Opens the forecast');
    expect(weatherCardName(inputsWith({condition: 'rainy'}), deps)).toBe('Weather. Opens the forecast');
  });
});

// the detail's words are read off the bands of the UV and air-quality tiles in TILES, past which the scale goes on
describe("the detail's UV and air-quality words", () => {
  test.each([
    [0, 'weather.uv.low'],
    [2.9, 'weather.uv.low'],
    [3, 'weather.uv.moderate'],
    [5.9, 'weather.uv.moderate'],
    [6, 'weather.uv.high'],
    [7.9, 'weather.uv.high'],
    [8, 'weather.uv.veryHigh'],
    [10.9, 'weather.uv.veryHigh'],
    [11, 'weather.uv.extreme'],
  ])('a UV index of %s is %s', (value, word) => {
    expect(uvWord(value)).toBe(word);
  });

  test.each([
    [1, 'low'],
    [3, 'low'],
    [3.5, 'moderate'],
    [6, 'moderate'],
    [6.5, 'high'],
    [10, 'high'],
    [10.5, 'veryHigh'],
  ])('an AQHI of %s is %s risk', (value, risk) => {
    expect(aqhiRisk(value)).toBe(risk);
  });
});
