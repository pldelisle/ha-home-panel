// aqLevel, outdoorLevel and rateRoom: the bands at each edge, the index on the US scale, and a room's level, index and why.
// The rules are the legacy panel's (`roomAir`); a room here is a literal of readings, the test house gives today's answer.
import {describe, expect, test} from 'vitest';
import {AQ_BANDS, aqLevel, outdoorLevel, rateRoom, type Pollutant} from '../../../src/providers/air-quality.ts';
import {milaRooms, type AirRoomInputs} from '../../../src/providers/mila.ts';
import {fullHouse, readingOf} from '../features/media/support.ts';

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
/** A room that reads these numbers and nothing else. */
const room = (readings: Partial<AirRoomInputs['readings']>): AirRoomInputs => ({
  deviceId: 'd',
  fanId: 'fan.x',
  areaId: null,
  name: 'X',
  sensors: {},
  readings: {...NONE, ...readings},
  fan: {on: true, available: true, percentage: 40, preset: 'Automagic'},
});

describe('the bands', () => {
  test('are the legacy panel’s', () => {
    expect(AQ_BANDS).toEqual({pm2_5: [12, 35], co2: [800, 1200], voc: [300, 3000], co: [9, 35]});
  });

  test.each(Object.entries(AQ_BANDS) as [Pollutant, readonly [number, number]][])(
    '%s: good up to %j, moderate up to the second, poor above, and a hair over each edge crosses it',
    (k, [good, moderate]) => {
      expect([0, good, good + 0.1, moderate, moderate + 0.1, moderate * 10].map(v => aqLevel(k, v))).toEqual([
        0, 0, 1, 1, 2, 2,
      ]);
    },
  );

  test('no reading is -1, not good', () => {
    expect(aqLevel('co2', null)).toBe(-1);
  });
});

describe('outdoorLevel', () => {
  test('up to 50 good, up to 100 moderate, above poor; no reading counts as good', () => {
    expect([null, 0, 50, 50.5, 100, 100.5, 300].map(outdoorLevel)).toEqual([0, 0, 0, 1, 1, 2, 2]);
  });
});

describe('rateRoom', () => {
  test('the test house’s purifier: Mila’s index 68 is moderate, though every pollutant is good but PM2.5 at 20', () => {
    const {states, registries, names} = readingOf(fullHouse);
    const rating = rateRoom(milaRooms(states, registries, names)[0]);
    expect(rating).toEqual({
      level: 1,
      milaIndex: 68,
      why: [{k: 'pm2_5', v: 20, level: 1}],
      pollutants: [
        {k: 'pm2_5', v: 20, level: 1},
        {k: 'co2', v: 640, level: 0},
        {k: 'voc', v: 180, level: 0},
        {k: 'co', v: 1, level: 0},
      ],
    });
  });

  test('Mila’s index decides the level over the bands, both ways, and the why still names the pollutants', () => {
    expect(rateRoom(room({airQuality: 30, co2: 2000})).level).toBe(0);
    expect(rateRoom(room({airQuality: 30, co2: 2000})).why).toEqual([{k: 'co2', v: 2000, level: 2}]);
    expect(rateRoom(room({airQuality: 120, pm2_5: 1})).level).toBe(2);
    expect(rateRoom(room({airQuality: 120, pm2_5: 1})).milaIndex).toBe(120);
  });

  test('without Mila’s index the level is the worst pollutant’s, and the why names only those at that level', () => {
    const rating = rateRoom(room({pm2_5: 20, co2: 1500, voc: 4000, co: 10}));
    expect(rating.level).toBe(2);
    expect(rating.milaIndex).toBeNull();
    expect(rating.why).toEqual([
      {k: 'co2', v: 1500, level: 2},
      {k: 'voc', v: 4000, level: 2},
    ]);
  });

  test('a moderate worst names the moderate ones, not the poor ones that are not there', () => {
    expect(rateRoom(room({pm2_5: 20, co2: 500})).why).toEqual([{k: 'pm2_5', v: 20, level: 1}]);
  });

  test('a missing reading is not better than good: one good reading and three missing rate good, not no data', () => {
    expect(rateRoom(room({co2: 500})).level).toBe(0);
    expect(rateRoom(room({co2: 500})).why).toEqual([]);
  });

  test('no reading at all rates -1, with no why and four pollutants without a value', () => {
    const rating = rateRoom(room({}));
    expect(rating.level).toBe(-1);
    expect(rating.why).toEqual([]);
    expect(rating.pollutants.map(p => [p.k, p.v, p.level])).toEqual([
      ['pm2_5', null, -1],
      ['co2', null, -1],
      ['voc', null, -1],
      ['co', null, -1],
    ]);
  });

  test('a clean room has an empty why', () => {
    expect(rateRoom(room({pm2_5: 3, co2: 450, voc: 100, co: 0})).why).toEqual([]);
  });
});
