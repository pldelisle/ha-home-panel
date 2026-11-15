// The Air commands as data: the expected objects are literals, so a rename of a service or a key is a failing test.
import {describe, expect, test} from 'vitest';
import {K, setMode, setSpeed} from '../../../../src/features/air/commands.ts';

describe('the typed overlay keys', () => {
  test('are the id and a suffix, so the mode and the speed of one purifier never share a key', () => {
    expect(K.mode('fan.den')).toBe('fan.den:mode');
    expect(K.pct('fan.den')).toBe('fan.den:pct');
  });
});

describe('setMode', () => {
  test('sets the preset, holds the mode and says which room and which mode', () => {
    expect(setMode('fan.den', 'Manual', 'Den')).toEqual({
      domain: 'fan',
      service: 'set_preset_mode',
      data: {entity_id: 'fan.den', preset_mode: 'Manual'},
      holds: ['fan.den:mode'],
      done: {key: 'air.modeSet', values: {name: 'Den', mode: 'Manual'}},
    });
  });
});

describe('setSpeed', () => {
  test('sets the percentage, holds it and says the speed', () => {
    expect(setSpeed('fan.den', 60, 'Den')).toEqual({
      domain: 'fan',
      service: 'set_percentage',
      data: {entity_id: 'fan.den', percentage: 60},
      holds: ['fan.den:pct'],
      done: {key: 'air.fanSet', values: {name: 'Den', pct: 60}},
    });
  });

  test.each([
    [0, 10],
    [5, 10],
    [14, 10],
    [26, 30],
    [100, 100],
    [105, 100],
    [400, 100],
  ])('%i percent is sent as %i: steps of ten, from ten to a hundred', (asked, sent) => {
    const command = setSpeed('fan.den', asked, 'Den');
    expect(command.data).toEqual({entity_id: 'fan.den', percentage: sent});
    expect(command.done?.values).toEqual({name: 'Den', pct: sent});
  });
});
