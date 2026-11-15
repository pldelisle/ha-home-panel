// The glow rule: activeOf reads a snapshot of the sensors, newlyActive says which turned on between two of them.
import {describe, expect, test} from 'vitest';
import {activeOf, newlyActive} from '../../../../src/features/security/activity.ts';
import {readSecurity} from '../../../../src/features/security/inputs.ts';
import {fullHouse, readingOf} from '../media/support.ts';

describe('activeOf', () => {
  test('is each sensor of the reading, on or not', () => {
    const {states, registries, names} = readingOf(fullHouse);
    const {sensors} = readSecurity(states, registries, names);
    expect(activeOf(sensors)).toEqual({'binary_sensor.front_door': false, 'binary_sensor.hall_motion': true});
  });
});

describe('newlyActive', () => {
  test('off to on counts', () => {
    expect(newlyActive({a: false, b: false}, {a: true, b: false})).toEqual(['a']);
  });

  test('an id the previous reading did not know does not count, nor does the first reading', () => {
    expect(newlyActive({a: false}, {a: true, b: true})).toEqual(['a']);
    expect(newlyActive({}, {a: true})).toEqual([]);
  });

  test('on to on, on to off and off to off do not count', () => {
    expect(newlyActive({a: true, b: true, c: false}, {a: true, b: false, c: false})).toEqual([]);
  });
});
