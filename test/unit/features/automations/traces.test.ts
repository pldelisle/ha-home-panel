// Which runs the Automations tab shows: the noise rule, the four picks with and without a selection, the fingerprint,
// today's runs and the running pill's elapsed time.
// Pattern: example tests at the pure functions over literal `trace/list` rows (ADR 0005; Meszaros, xUnit Test Patterns).
// Must not: read the clock (every instant is a literal) or ask Home Assistant.
import {describe, expect, test} from 'vitest';
import type {TraceSummary} from '../../../../src/core/ha.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  elapsedText,
  fingerprint,
  isNoise,
  noiseOf,
  picks,
  todayRuns,
} from '../../../../src/features/automations/traces.ts';

const run = (item: string, run_id: string, start: string, more: Partial<TraceSummary> = {}): TraceSummary => ({
  item_id: item,
  run_id,
  timestamp: {start},
  state: 'stopped',
  script_execution: 'finished',
  ...more,
});

describe('isNoise', () => {
  const pattern = {triggers: [{trigger: 'time_pattern', minutes: '/5'}]};
  test('an automation whose every trigger is a time pattern, whatever its run did', () => {
    expect(isNoise(run('a', 'r', 'x'), pattern)).toBe(true);
    expect(isNoise(run('a', 'r', 'x'), {trigger: [{platform: 'time_pattern'}, {platform: 'time_pattern'}]})).toBe(true);
  });
  test('a time-pattern run stopped by its condition; not one that acted, nor another trigger stopped', () => {
    const mixed = {triggers: [{trigger: 'time_pattern'}, {trigger: 'state'}]};
    expect(isNoise(run('a', 'r', 'x', {trigger: 'time pattern', script_execution: 'failed_conditions'}), mixed)).toBe(
      true,
    );
    expect(isNoise(run('a', 'r', 'x', {trigger: 'time pattern'}), mixed)).toBe(false);
    expect(isNoise(run('a', 'r', 'x', {trigger: 'state of x', script_execution: 'failed_conditions'}), null)).toBe(
      false,
    );
    expect(isNoise(run('a', 'r', 'x'), {triggers: []})).toBe(false);
  });
  test('noiseOf binds the configs by item id', () => {
    const noise = noiseOf({a: pattern, b: null});
    expect(noise(run('a', 'r', 'x'))).toBe(true);
    expect(noise(run('b', 'r', 'x'))).toBe(false);
  });
});

describe('picks', () => {
  const list = [
    run('a', 'a1', '2026-11-07T10:00:00Z'),
    run('a', 'a2', '2026-11-07T12:00:00Z', {script_execution: 'failed_conditions'}),
    run('b', 'b1', '2026-11-07T11:00:00Z', {state: 'running', script_execution: undefined}),
    run('n', 'n1', '2026-11-07T13:00:00Z'),
  ];
  const noise = (s: TraceSummary) => s.item_id === 'n';

  test('without a selection: the running, the last decision and the last completed, noise left out', () => {
    expect(picks(list, null, noise)).toEqual({
      selected: undefined,
      running: list[2],
      decision: list[1],
      completed: list[0],
    });
  });
  test("an automation's latest run, a given run, and a noise run when it is the one picked", () => {
    expect(picks(list, {item: 'a'}, noise).selected).toBe(list[1]);
    expect(picks(list, {item: 'a', run: 'a1'}, noise).selected).toBe(list[0]);
    expect(picks(list, {item: 'n'}, noise).selected).toBe(list[3]);
    expect(picks(list, {item: 'a', run: 'gone'}, noise).selected).toBeUndefined();
  });
  test('nothing to pick in an empty list', () => {
    expect(picks([], {item: 'a'}, noise)).toEqual({
      selected: undefined,
      running: undefined,
      decision: undefined,
      completed: undefined,
    });
  });
});

test('fingerprint changes with a run, a start, an end or a switch', () => {
  const a = {entity: 'automation.a', item: 'a', name: 'A', on: true, last: null, current: 0};
  const base = fingerprint([a]);
  expect(base).toBe('automation.anull0true');
  for (const change of [{last: '2026-11-07T10:00:00Z'}, {current: 1}, {on: false}])
    expect(fingerprint([{...a, ...change}])).not.toBe(base);
  expect(fingerprint([a, {...a, entity: 'automation.b'}])).toBe('automation.anull0true|automation.bnull0true');
});

test('todayRuns: from midnight on, noise left out, the earliest first', () => {
  const midnight = Date.parse('2026-11-07T05:00:00Z');
  const list = [
    run('a', 'late', '2026-11-07T20:00:00Z'),
    run('a', 'yesterday', '2026-11-07T04:59:59Z'),
    run('n', 'noise', '2026-11-07T08:00:00Z'),
    run('a', 'early', '2026-11-07T05:00:00Z'),
  ];
  expect(todayRuns(list, midnight, s => s.item_id === 'n').map(s => s.run_id)).toEqual(['early', 'late']);
});

const {t} = createMessages({language: 'en', tag: 'en'});

test('elapsedText: minutes and seconds under an hour, hours and minutes after, never negative', () => {
  const start = Date.parse('2026-11-07T10:00:00Z');
  expect(elapsedText(start, start + 247_000, t)).toBe('4:07');
  expect(elapsedText(start, start + 3_900_000, t)).toBe('1 h 05');
  expect(elapsedText(start, start - 5000, t)).toBe('0:00');
});
