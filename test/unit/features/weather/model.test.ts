// weatherModel: the inputs, the forecast and the clock in, the strings the Weather elements place out. The expected strings
// are literals: the full test house's are the values and the texts of the Weather baselines at the afternoon instant
// (weather-tablet-light-en and -fr, bare-weather-tablet-light-en), so this test is those pixels' textual twin.
import {existsSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {conditionName} from '../../../../src/features/weather/model.ts';
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

  test('the pane tiles, as the phone draws them', () => {
    expect(shown(model.tiles)).toEqual([
      {key: 'wind', value: '14', unit: ' km/h', sub: 'SW · gusts 25 km/h'},
      {key: 'hum', value: '71', unit: '%', sub: 'Dew point -0.5°'},
      {key: 'feels', value: '4°', unit: '', sub: 'Same as the air'},
      {key: 'pres', value: '101.9', unit: ' kPa', sub: 'Rising'},
      {key: 'uv', value: '1', unit: '', sub: 'Low'},
      {key: 'aqhi', value: '2', unit: '', sub: 'Low risk'},
      {key: 'pop', value: '–', unit: '', sub: 'Chance today'},
      {key: 'normal', value: '6°', unit: ' / -2°', sub: 'For the date'},
    ]);
    expect(model.tiles.every(tile => tile.tone === 'blue')).toBe(true);
    expect(model.tiles.map(tile => [tile.label, tile.icon])).toEqual([
      ['Wind', 'wind'],
      ['Humidity', 'hum'],
      ['Feels like', 'therm'],
      ['Pressure', 'clock'],
      ['UV index', 'wx'],
      ['Air quality', 'aq'],
      ['Rain or snow', 'drop'],
      ['Normal', 'wx'],
    ]);
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
      {key: 'pop', value: '–', unit: '%', sub: 'chance today'},
      {key: 'uv', value: '1', unit: '', sub: 'low'},
      {key: 'aqhi', value: '2', unit: '', sub: 'AQHI, low risk'},
      {key: 'feels', value: '4.2°', unit: '', sub: 'same as the air'},
      {key: 'normal', value: '6° / -2°', unit: '', sub: 'high / low for the date'},
    ]);
    expect(model.now.tiles.every(tile => tile.tone === null && tile.arrow === null)).toBe(true);
  });

  test("the phone's card", () => {
    expect(model.card).toEqual({
      sunLabel: 'Sunset',
      sunTime: '4:45 pm',
      temperature: '4.2°',
      condition: 'Mainly sunny',
      range: 'High 7° · Low -1° · normal 6° / -2°',
      facts: [
        {label: 'Wind', value: '14 km/h SW'},
        {label: 'Humidity', value: '71%'},
        {label: 'UV', value: '1'},
        {label: 'Air quality', value: '2'},
      ],
      days: [],
    });
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

  test('the pane sub-line (Environment Canada’s own wording, Mainly sunny, is not in the catalog: the layer translates it today)', () => {
    expect(model.summary).toBe('Mainly sunny · observé à 13 h 30 · pression en hausse · aucune alerte');
  });

  test('the pane tiles', () => {
    expect(shown(model.tiles)).toEqual([
      {key: 'wind', value: '14', unit: ' km/h', sub: 'SO · rafales 25 km/h'},
      {key: 'hum', value: '71', unit: '%', sub: 'Point de rosée -0,5°'},
      {key: 'feels', value: '4°', unit: '', sub: "Comme l'air"},
      {key: 'pres', value: '101,9', unit: ' kPa', sub: 'En hausse'},
      {key: 'uv', value: '1', unit: '', sub: 'Bas'},
      {key: 'aqhi', value: '2', unit: '', sub: 'Risque faible'},
      {key: 'pop', value: '–', unit: '', sub: "Probabilité aujourd'hui"},
      {key: 'normal', value: '6°', unit: ' / -2°', sub: 'Pour la date'},
    ]);
    expect(model.tiles.map(tile => tile.label)).toEqual([
      'Vent',
      'Humidité',
      'Ressenti',
      'Pression',
      'Indice UV',
      "Qualité de l'air",
      'Pluie ou neige',
      'Normal',
    ]);
  });

  test('the detail panel, as the French baseline shows it', () => {
    expect(model.now).toMatchObject({temperature: '4,2°', line: 'Max 7° · Min -1°'});
    expect(shown(model.now.tiles)).toEqual([
      {key: 'wind', value: '14', unit: 'km/h', sub: 'SO · gusts 25'},
      {key: 'hum', value: '71', unit: '%', sub: 'point de rosée -0,5°'},
      {key: 'pres', value: '101,9', unit: 'kPa', sub: 'en hausse'},
      {key: 'pop', value: '–', unit: '%', sub: "probabilité aujourd'hui"},
      {key: 'uv', value: '1', unit: '', sub: 'min'},
      {key: 'aqhi', value: '2', unit: '', sub: 'CAS, risque faible'},
      {key: 'feels', value: '4,2°', unit: '', sub: "comme l'air"},
      {key: 'normal', value: '6° / -2°', unit: '', sub: 'max / min pour la date'},
    ]);
  });

  test("the phone's card and the sun block", () => {
    expect(model.card).toMatchObject({
      sunLabel: 'Coucher du soleil',
      sunTime: '16 h 45',
      temperature: '4,2°',
      range: 'Max 7° · Min -1° · normale 6° / -2°',
      facts: [
        {label: 'Vent', value: '14 km/h SO'},
        {label: 'Humidité', value: '71 %'},
        {label: 'UV', value: '1'},
        {label: "Qualité de l'air", value: '2'},
      ],
    });
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
      {key: 'pop', value: '–', unit: '%', sub: 'chance today'},
      {key: 'uv', value: '–', unit: '', sub: ''},
      {key: 'aqhi', value: '–', unit: '', sub: 'AQHI'},
      {key: 'feels', value: '4.2°', unit: '', sub: 'same as the air'},
      {key: 'normal', value: '–', unit: '', sub: 'high / low for the date'},
    ]);
  });
});

describe('a house that knows nothing', () => {
  const model = modelFromInputs(EMPTY_INPUTS, 'en');

  test('says dashes, and nothing for what it cannot say', () => {
    expect(model.summary).toBe('no alerts');
    expect(model.card).toMatchObject({
      sunLabel: 'Sunrise',
      sunTime: '–',
      temperature: '–°',
      condition: '',
      range: '',
    });
    expect(model.card.facts.map(fact => fact.value)).toEqual(['–', '–%', '–', '–']);
    expect(shown(model.tiles).map(tile => [tile.value, tile.unit])).toEqual(Array(8).fill(['–', '']));
    expect(model.now).toMatchObject({temperature: '–°', condition: '', line: '', summary: null});
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

  test('a sensor that only counts is worded here, with the count, in both languages', () => {
    const counted = inputsWith({alerts: [{kind: 'watch', tone: 'warn', title: null, count: 2, time: null}]});
    expect(modelFromInputs(counted, 'en').alerts).toEqual([
      {tone: 'warn', kind: 'Watch', title: '2 alerts in effect', time: null},
    ]);
    expect(modelFromInputs(counted, 'fr').alerts).toEqual([
      {tone: 'warn', kind: 'Veille', title: '2 alertes en vigueur', time: null},
    ]);
  });
});

describe('the lines under the temperature', () => {
  const lines = (patch: Partial<WeatherInputs>) => {
    const model = inEnglish(patch);
    return [model.card.range, model.now.line];
  };

  test('the card says the high and low, with the normals when it has them', () => {
    expect(lines({today: {hi: 14, lo: 6, pop: null}})).toEqual(['High 14° · Low 6°', 'High 14° · Low 6°']);
    expect(lines({today: {hi: 14, lo: 6, pop: null}, normals: {hi: 9, lo: 1}, temperature: 10})).toEqual([
      'High 14° · Low 6° · normal 9° / 1°',
      'High 14° · Low 6°',
    ]);
  });

  test('a set the French map has no sentence for is joined from its parts', () => {
    expect(lines({today: {hi: null, lo: 6, pop: null}, normals: {hi: 9, lo: 1}})).toEqual([
      'Low 6° · normal 9° / 1°',
      'Low 6°',
    ]);
    expect(lines({today: {hi: 14, lo: null, pop: null}, normals: {hi: 9, lo: null}})).toEqual(['High 14°', 'High 14°']);
    expect(lines({normals: {hi: 9, lo: 1}})).toEqual(['normal 9° / 1°', '']);
  });

  test('the detail line says Feels like first, when the feels-like differs from the air by a degree or more', () => {
    const base = {today: {hi: 14, lo: 6, pop: null}, temperature: 12.5};
    expect(inEnglish({...base, feelsLike: {value: 10, kind: 'windChill'}}).now.line).toBe(
      'Feels like 10° · High 14° · Low 6°',
    );
    expect(inEnglish({...base, feelsLike: {value: 12, kind: 'humidex'}}).now.line).toBe('High 14° · Low 6°');
    expect(inEnglish({today: base.today, feelsLike: {value: 3, kind: 'windChill'}}).now.line).toBe(
      'Feels like 3° · High 14° · Low 6°',
    );
  });

  test('rounds to the whole degree and never writes a negative zero', () => {
    expect(inEnglish({today: {hi: 0.4, lo: -0.4, pop: null}}).now.line).toBe('High 0° · Low 0°');
    expect(inEnglish({today: {hi: 14.5, lo: -1.5, pop: null}}).now.line).toBe('High 15° · Low -1°');
  });

  test('the temperature keeps its decimal, even a zero one, and its dash', () => {
    expect(inEnglish({temperature: 5}).now.temperature).toBe('5.0°');
    expect(inEnglish({temperature: -3.04}).now.temperature).toBe('-3.0°');
    expect(inEnglish({temperature: null}).now.temperature).toBe('–°');
  });
});

describe('the tiles', () => {
  const tile = (patch: Partial<WeatherInputs>, key: string, where: 'tiles' | 'now' = 'now') => {
    const model = inEnglish(patch);
    const tiles = where === 'now' ? model.now.tiles : model.tiles;
    return tiles.find(t => t.key === key)!;
  };

  test('wind: the direction, the gust, and a bearing arrow drawn after the compass point', () => {
    const wind = {speed: 14.4, gust: 25.5, direction: 'NW', bearing: 315};
    expect(tile({wind}, 'wind')).toMatchObject({
      value: '14',
      unit: 'km/h',
      sub: 'NW · gusts 26',
      arrow: {bearing: 315, after: 2},
    });
    expect(tile({wind}, 'wind', 'tiles')).toMatchObject({
      value: '14',
      unit: ' km/h',
      sub: 'NW · gusts 26 km/h',
      arrow: null,
    });
    expect(tile({wind: {...wind, direction: null}}, 'wind').arrow).toEqual({bearing: 315, after: 0});
    expect(tile({wind: {speed: null, gust: null, direction: null, bearing: null}}, 'wind', 'tiles')).toMatchObject({
      value: '–',
      unit: '',
      sub: '',
    });
  });

  test('wind in a direction the catalog does not name is shown as it is', () => {
    expect(tile({wind: {speed: 3, gust: null, direction: 'VRB', bearing: null}}, 'wind').sub).toBe('VRB');
  });

  test('feels like: wind chill or humidex with its word, the air when there is none, and the visibility', () => {
    expect(tile({feelsLike: {value: -9.4, kind: 'windChill'}, temperature: -3}, 'feels')).toMatchObject({
      value: '-9°',
      sub: 'wind chill',
    });
    expect(tile({feelsLike: {value: 31, kind: 'humidex'}, temperature: 26}, 'feels', 'tiles')).toMatchObject({
      value: '31°',
      sub: 'Humidex',
    });
    expect(tile({feelsLike: {value: -9, kind: 'windChill'}}, 'feels', 'tiles').sub).toBe('Wind chill');
    expect(tile({temperature: 4.2}, 'feels', 'tiles')).toMatchObject({value: '4°', sub: 'Same as the air'});
    expect(tile({temperature: null}, 'feels', 'tiles')).toMatchObject({value: '–', sub: 'Same as the air'});
    expect(tile({temperature: 4.2, visibility: 11.6}, 'feels')).toMatchObject({value: '4.2°', sub: 'visibility 12 km'});
    expect(tile({temperature: null}, 'feels')).toMatchObject({value: '–°', sub: 'same as the air'});
  });

  test('UV: the band word in the pane, and the index word in the detail, at each threshold', () => {
    const pane = (uv: number) => tile({uv}, 'uv', 'tiles').sub;
    expect([0, 2, 3, 5, 6, 7].map(pane)).toEqual(['Low', 'Low', 'Moderate', 'Moderate', 'High', 'High']);
    expect([8, 11].map(pane)).toEqual(['Very high', 'Very high']);
    expect(pane(2.5)).toBe('');
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
    expect(tile({uv: 6}, 'uv', 'tiles').value).toBe('6');
    expect(tile({uv: null}, 'uv')).toMatchObject({value: '–', sub: ''});
  });

  test('air quality: the band in the pane, the risk in the detail, at each threshold', () => {
    const pane = (aqhi: number) => tile({aqhi}, 'aqhi', 'tiles').sub;
    expect([1, 3, 4, 6, 7, 10, 0, 11].map(pane)).toEqual([
      'Low risk',
      'Low risk',
      'Moderate',
      'Moderate',
      'High risk',
      'High risk',
      '',
      '',
    ]);
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
    expect(tile({aqhi: null}, 'aqhi', 'tiles').value).toBe('–');
  });

  test('humidity, pressure, rain and snow: the pane rounds, the detail keeps the reading', () => {
    const readings = {
      humidity: 71.4,
      dewPoint: -0.52,
      pressure: {kpa: 100, tendency: 'falling'},
      today: {hi: null, lo: null, pop: 40},
    };
    expect(tile(readings, 'hum', 'tiles')).toMatchObject({value: '71', unit: '%', sub: 'Dew point -0.5°'});
    expect(tile(readings, 'hum')).toMatchObject({value: '71.4', unit: '%', sub: 'dew point -0.5°'});
    expect(tile(readings, 'pres', 'tiles')).toMatchObject({value: '100.0', unit: ' kPa', sub: 'Falling'});
    expect(tile(readings, 'pres')).toMatchObject({value: '100.0', unit: 'kPa', sub: 'falling'});
    expect(tile(readings, 'pop', 'tiles')).toMatchObject({value: '40', unit: '%', sub: 'Chance today'});
    expect(tile(readings, 'pop')).toMatchObject({value: '40', unit: '%', sub: 'chance today'});
    expect(tile({pressure: {kpa: null, tendency: 'some_odd_word'}}, 'pres', 'tiles').sub).toBe('Some_odd_word');
  });

  test('normal: the high and the low, or the high alone when the low is not known', () => {
    expect(tile({normals: {hi: 6.4, lo: -2.5}}, 'normal', 'tiles')).toMatchObject({value: '6°', unit: ' / -2°'});
    expect(tile({normals: {hi: 6.4, lo: null}}, 'normal', 'tiles')).toMatchObject({value: '6°', unit: ''});
    expect(tile({normals: {hi: 6.4, lo: null}}, 'normal').value).toBe('6° / –');
    expect(tile({normals: {hi: 6.4, lo: 1}}, 'normal').value).toBe('6° / 1°');
  });

  test('the eight tiles come in the pane order and the detail order', () => {
    const model = inEnglish({});
    expect(model.tiles.map(t => t.key)).toEqual(['wind', 'hum', 'feels', 'pres', 'uv', 'aqhi', 'pop', 'normal']);
    expect(model.now.tiles.map(t => t.key)).toEqual(['wind', 'hum', 'pres', 'pop', 'uv', 'aqhi', 'feels', 'normal']);
  });
});

describe('the card facts', () => {
  test('the wind speed with its direction, the humidity with its percent sign, UV and air quality', () => {
    const model = inEnglish({
      wind: {speed: 14.6, gust: null, direction: 'SW', bearing: null},
      humidity: 71.5,
      uv: 3,
      aqhi: 4,
    });
    expect(model.card.facts).toEqual([
      {label: 'Wind', value: '15 km/h SW'},
      {label: 'Humidity', value: '71.5%'},
      {label: 'UV', value: '3'},
      {label: 'Air quality', value: '4'},
    ]);
    expect(inEnglish({wind: {speed: null, gust: null, direction: 'SW', bearing: null}}).card.facts[0].value).toBe(
      '– SW',
    );
  });

  test('the sun label follows the sun: Sunset while it is up, Sunrise after, with the time of the next event', () => {
    const up = inEnglish({sun: {up: true, next: {kind: 'set', at: REFERENCE_MS + 3 * 36e5}, hasFirstLight: true}});
    expect([up.card.sunLabel, up.card.sunTime]).toEqual(['Sunset', '5:00 pm']);
    const down = inEnglish({
      sun: {up: false, next: {kind: 'rise', at: REFERENCE_MS + 17 * 36e5}, hasFirstLight: false},
    });
    expect([down.card.sunLabel, down.card.sunTime]).toEqual(['Sunrise', '7:00 am']);
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
    expect(model.tiles).toHaveLength(8);
    expect(model.now.tiles).toHaveLength(8);
    for (const text of strings(model)) expect(text).not.toMatch(/NaN|undefined|\[object/);
  });
});
