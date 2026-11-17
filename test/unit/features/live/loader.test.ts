// LiveHistory at the controller seam (ADR 0005): a fake cache, a fake store and a fake host, as Car's loader is tested. The kit's
// timing (a fifteen-minute reuse, a hidden host, a late reply) is proven once in windowed-history's tests; here, the windows and what derives them.
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {LiveHistory, liveWindows, type LiveHistoryDeps} from '../../../../src/features/live/loader.ts';
import {fakeHass} from '../../fake-hass.ts';

const fmt = createFormatters(
  panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
);
const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const HOUR = 36e5;
const FIVE = 3e5;
const row = (start: number, fields: Partial<StatisticRow>): StatisticRow => ({start, end: start + HOUR, ...fields});
const entities = {...DEFAULT_ENTITIES, whT: 'sensor.wh_t', whP: 'sensor.wh_p', evP: 'sensor.ev'};
const config = {entities, rooms: []};

type Call = [ids: readonly (string | null | undefined)[], period: string];

function setup() {
  const calls: Call[] = [];
  const cache = {
    statistics: (ids: readonly (string | null | undefined)[], period: string) => {
      calls.push([ids, period]);
      if (period === 'hour')
        // two hours of 7 kW: one session of 14 kWh
        return Promise.resolve({
          'sensor.ev': [row(NOW - 3 * HOUR, {mean: 7, max: 7.4}), row(NOW - 2 * HOUR, {mean: 7, max: 7.1})],
        });
      return Promise.resolve({
        'sensor.wh_t': [row(NOW - 2 * FIVE, {mean: 52}), row(NOW - FIVE, {mean: 53})],
        'sensor.wh_p': [row(NOW - 2 * FIVE, {mean: 4.5}), row(NOW - FIVE, {})],
      });
    },
  };
  const controllers: object[] = [];
  const host = {
    active: true,
    addController: (controller: object) => controllers.push(controller),
    removeController: () => undefined,
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const deps = {cache, store: {generation: 1, config}, fmt} as unknown as LiveHistoryDeps;
  const history = new LiveHistory(host, () => deps);
  return {history, host, calls, controller: controllers[0]};
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LiveHistory', () => {
  test("asks the very windows Energy's water card and Car's history ask, so the cache answers it from theirs", () => {
    const windows = liveWindows(NOW, config as never, fmt);
    expect(windows.fiveMin25h).toMatchObject({period: '5minute', ids: ['sensor.wh_t', 'sensor.wh_p']});
    expect(windows.hours).toMatchObject({period: 'hour', ids: ['sensor.ev']});
  });

  test('registers with its host, loads both windows when it connects, and derives the water day and the sessions', async () => {
    const {history, host, calls, controller} = setup();
    expect(controller).toBe(history);
    expect(history.data).toBeNull();
    history.hostConnected();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map(([, period]) => period).sort()).toEqual(['5minute', 'hour']);
    expect(history.data).toEqual({
      at: NOW,
      wh24: {
        t: [
          [NOW - 2 * FIVE, 52],
          [NOW - FIVE, 53],
        ],
        p: [[NOW - 2 * FIVE, 4.5]],
      },
      sessions: [expect.objectContaining({kwh: 14, peak: 7.4})],
    });
    expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    history.hostUpdate();
    history.hostDisconnected();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
  });
});
