// StackHistory at the controller seam (ADR 0005): a fake cache, a fake store and a fake host, as Live's loader is tested. The kit's
// timing is proven once in windowed-history's tests; here, the windows and what derives them.
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {DEFAULT_ENTITIES} from '../../../../src/core/entities.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {StackHistory, stackWindows, type StackHistoryDeps} from '../../../../src/features/stack/loader.ts';
import {fakeHass} from '../../fake-hass.ts';

const fmt = createFormatters(
  panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
);
const NOW = Date.parse('2026-11-09T09:45:00-05:00');
const HOUR = 36e5;
const row = (start: number, fields: Partial<StatisticRow>): StatisticRow => ({start, end: start + HOUR, ...fields});
const entities = {...DEFAULT_ENTITIES, grid: 'sensor.grid', energy: 'sensor.meter'};
const config = {entities, rooms: []};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

test("asks Energy's three windows, so the cache answers it from the card's, and derives the flow and the meter's today", async () => {
  const windows = stackWindows(NOW, config as never, fmt);
  expect(Object.keys(windows)).toEqual(['hour7', 'today', 'meter33']);
  const calls: string[] = [];
  const cache = {
    statistics: (ids: readonly (string | null | undefined)[], period: string) => {
      calls.push(period);
      return Promise.resolve({
        'sensor.grid': [row(NOW - 2 * HOUR, {mean: 2})],
        'sensor.meter': [row(NOW - 2 * HOUR, {change: 3}), row(NOW - HOUR, {change: 1.5})],
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
  const deps = {cache, store: {generation: 1, config}, fmt} as unknown as StackHistoryDeps;
  const history = new StackHistory(host, () => deps);
  expect(controllers[0]).toBe(history);
  expect(history.data).toBeNull();
  history.hostConnected();
  await vi.advanceTimersByTimeAsync(0);
  expect(calls).toHaveLength(3);
  expect(history.data).toMatchObject({at: NOW, flow: [[NOW - 2 * HOUR, 0, 0, 0, 2, 2]], totals: {today: 4.5}});
  history.hostUpdate();
  history.hostDisconnected();
});
