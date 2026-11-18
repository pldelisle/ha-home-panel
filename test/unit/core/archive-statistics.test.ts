// withArchive at the API client's seam: a literal recorder (a fake `statistics`), a fake archive that records what it was asked, no network.
import {describe, expect, test, vi} from 'vitest';
import {StaleReply, type PanelApi} from '../../../src/core/api.ts';
import {withArchive, type StatisticsArchive} from '../../../src/core/archive-statistics.ts';
import type {EntityKey} from '../../../src/core/entities.ts';
import type {StatisticRow} from '../../../src/core/ha.ts';

const HOUR = 3_600_000;
const START = new Date('2026-11-01T00:00:00Z');
const NOW = Date.parse('2026-11-17T12:00:00Z');
const row = (start: number, mean: number): StatisticRow => ({start, end: start + HOUR, mean, min: mean, max: mean});
const KEYS = new Map<string, EntityKey>([
  ['sensor.wind', 'wind'],
  ['sensor.hum', 'hum'],
]);

function setup(
  recorded: Record<string, StatisticRow[]>,
  fill: StatisticsArchive['rows'] = () => Promise.resolve(null),
) {
  const statistics = vi.fn<PanelApi['statistics']>(() => Promise.resolve(recorded));
  const history = vi.fn<PanelApi['history']>(() => Promise.resolve({}));
  const rows = vi.fn(fill);
  const api = withArchive(
    {statistics, history},
    {rows},
    () => KEYS,
    () => NOW,
  );
  return {api, statistics, history, rows};
}
const archived =
  (...starts: number[]) =>
  () =>
    Promise.resolve({station: 'LAKESIDE', rows: starts.map(at => row(at, 1))});

describe('the gap split', () => {
  test('the archive fills what comes before the first recorder row, per id, and the recorder rows stay as they are', async () => {
    const first = START.getTime() + 10 * HOUR;
    const recorded = {'sensor.wind': [row(first, 9)], 'sensor.hum': [row(first + 5 * HOUR, 8)]};
    const {api, rows} = setup(recorded, archived(START.getTime()));
    const out = await api.statistics(['sensor.wind', 'sensor.hum'], 'hour', START, ['mean']);
    expect(rows.mock.calls.map(([key, period, from, to]) => [key, period, from, to.getTime()])).toEqual([
      ['wind', 'hour', START, first],
      ['hum', 'hour', START, first + 5 * HOUR],
    ]);
    expect(out['sensor.wind'].map(r => r.mean)).toEqual([1, 9]);
    expect(out['sensor.hum']).toHaveLength(2);
    expect(recorded['sensor.wind']).toHaveLength(1);
    // the notice names where the archive's rows end (the end of the last), not where the recorder's begin
    expect(api.notice(['sensor.wind', 'sensor.hum'], 'hour', START)).toEqual({
      station: 'LAKESIDE',
      before: START.getTime() + HOUR,
    });
    // the notice belongs to that read: another range of the same ids, or other ids, has none
    expect(api.notice(['sensor.wind', 'sensor.hum'], 'day', START)).toBeNull();
    expect(api.notice(['sensor.wind'], 'hour', START)).toBeNull();
  });

  test('a recorder with nothing for the id leaves the whole range to the archive, up to `end` or else to now', async () => {
    const {api, rows} = setup({}, archived(START.getTime()));
    const out = await api.statistics(['sensor.wind'], 'hour', START, ['mean']);
    expect(out['sensor.wind']).toHaveLength(1);
    expect(rows.mock.calls[0][3].getTime()).toBe(NOW);
    // with no recorder row, the notice is not "before now": it is where the archive stopped
    expect(api.notice(['sensor.wind'], 'hour', START)?.before).toBe(START.getTime() + HOUR);
    const end = new Date('2026-11-10T00:00:00Z');
    await api.statistics(['sensor.wind'], 'hour', START, ['mean'], end);
    expect(rows.mock.calls[1][3]).toEqual(end);
  });

  test('a recorder that reaches back to the start is not supplemented, and the archive is not asked', async () => {
    const {api, rows} = setup({'sensor.wind': [row(START.getTime(), 9)]}, archived(START.getTime()));
    expect(await api.statistics(['sensor.wind', 'sensor.other', null], 'hour', START, ['mean'])).toEqual({
      'sensor.wind': [row(START.getTime(), 9)],
    });
    expect(rows).not.toHaveBeenCalled();
    expect(api.notice(['sensor.wind'], 'hour', START)).toBeNull();
  });
});

describe('failure and passing through', () => {
  test('an archive that fails, or has no rows, gives the recorder rows alone', async () => {
    const recorded = {'sensor.wind': [row(START.getTime() + HOUR, 9)]};
    const failing = setup(recorded, () => Promise.reject(new Error('offline')));
    expect(await failing.api.statistics(['sensor.wind'], 'hour', START, ['mean'])).toBe(recorded);
    const empty = setup(recorded, () => Promise.resolve({station: 'X', rows: []}));
    expect(await empty.api.statistics(['sensor.wind'], 'hour', START, ['mean'])).toBe(recorded);
    expect(empty.api.notice(['sensor.wind'], 'hour', START)).toBeNull();
  });

  test("the recorder's StaleReply propagates, and the archive is not asked", async () => {
    const {api, statistics, rows} = setup({});
    statistics.mockRejectedValueOnce(new StaleReply(1, 2));
    await expect(api.statistics(['sensor.wind'], 'hour', START, ['mean'])).rejects.toBeInstanceOf(StaleReply);
    expect(rows).not.toHaveBeenCalled();
  });

  test('a read that adds nothing where it added rows before drops its notice', async () => {
    const {api, rows} = setup({}, archived(START.getTime()));
    await api.statistics(['sensor.wind'], 'hour', START, ['mean']);
    expect(api.notice(['sensor.wind'], 'hour', START)).not.toBeNull();
    rows.mockResolvedValueOnce(null);
    await api.statistics(['sensor.wind'], 'hour', START, ['mean']);
    expect(api.notice(['sensor.wind'], 'hour', START)).toBeNull();
  });

  test('the notices of the oldest reads are let go, a few dozen are kept', async () => {
    const {api} = setup({}, archived(START.getTime()));
    for (let day = 1; day <= 40; day++)
      await api.statistics(['sensor.wind'], 'hour', new Date(START.getTime() - day * HOUR), ['mean']);
    const noticeAt = (day: number) => api.notice(['sensor.wind'], 'hour', new Date(START.getTime() - day * HOUR));
    expect(noticeAt(1)).toBeNull();
    expect(noticeAt(40)).not.toBeNull();
  });

  test('history goes to the client untouched', async () => {
    const {api, history} = setup({});
    await api.history(['sensor.wind'], START, {minimal: true, attributes: false});
    expect(history).toHaveBeenCalledWith(['sensor.wind'], START, {minimal: true, attributes: false});
  });
});
