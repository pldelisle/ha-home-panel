// withArchive: the recorder's statistics with an archive's rows in front, where the recorder has none yet.
// Pattern: decorator (Gamma et al.) over the API client's `statistics`, so the cache wraps it unchanged; the archive is a port
// (Cockburn, Hexagonal Architecture) whose adapter is a provider (#447). The recorder is asked first and its first row per id is the
// line: the archive fills what comes before it, or the whole range when the recorder has nothing.
// Must not: touch a recorder row, swallow the recorder's failure (a StaleReply included: only the archive's), call `history`
// but to pass it through, read a clock but the `now` it is given, or know which archive it has.
import type {PanelApi} from './api.ts';
import type {EntityKey} from './entities.ts';
import type {StatisticRow, StatisticsPeriod} from './ha.ts';
import {idsKey} from './statistics-cache.ts';

/** The archive's answer for one series: its rows, oldest first, and the name of the station they come from. */
export interface ArchiveFill {
  station: string;
  rows: StatisticRow[];
}

/** The port: a source of past statistics under the recorder's own names. */
export interface StatisticsArchive {
  /**
   * The rows of `key` at `period` in `[start, end)`, or null when this archive does not cover it (no station, no such series, a
   * period it does not keep). It rejects when it fails; the decorator takes that as "no rows".
   */
  rows(key: EntityKey, period: StatisticsPeriod, start: Date, end: Date): Promise<ArchiveFill | null>;
}

/** Where the earlier part of a chart comes from: the station, and the instant its rows stop (the end of the last one). */
export interface ArchiveNotice {
  station: string;
  before: number;
}

type Ids = readonly (string | null | undefined)[];

export type ArchivedStatistics = Pick<PanelApi, 'statistics' | 'history'> & {
  /**
   * Where the archive rows of that very read came from (the arguments of `statistics`, the types aside), or null when it added none: the
   * detail's foot and the history sheet say it. Per read, because a week the recorder covers has no archive rows beside a season that has.
   */
  notice: (ids: Ids, period: StatisticsPeriod, start: Date, end?: Date) => ArchiveNotice | null;
};

/** How many reads' notices are kept: the reads a pane makes are a few ranges, and a start that moves each hour must not pile up. */
const KEPT_NOTICES = 32;

const readKey = (ids: Ids, period: StatisticsPeriod, start: Date, end?: Date) =>
  JSON.stringify([idsKey(ids), period, start.getTime(), end?.getTime() ?? null]);

interface Hit {
  id: string;
  fill: ArchiveFill;
}

export function withArchive(
  api: Pick<PanelApi, 'statistics' | 'history'>,
  archive: StatisticsArchive,
  /** The entity ids the archive covers, each with its key: read at each call, as the config may change under the pane. */
  keysOf: () => ReadonlyMap<string, EntityKey>,
  now: () => number = Date.now,
): ArchivedStatistics {
  const notices = new Map<string, ArchiveNotice>();

  return {
    history: (ids, start, options) => api.history(ids, start, options),
    notice: (ids, period, start, end) => notices.get(readKey(ids, period, start, end)) ?? null,
    async statistics(ids, period, start, types, end) {
      const recorded = await api.statistics(ids, period, start, types, end);
      const keys = keysOf();
      const limit = (end ?? new Date(now())).getTime();
      const asked = [...new Set(ids)].flatMap(id => {
        const key = id ? keys.get(id) : undefined;
        const before = (id && recorded[id]?.[0]?.start) || limit;
        return id && key && before > start.getTime() ? [{id, key, before}] : [];
      });
      const answers = await Promise.all(
        asked.map(({id, key, before}) =>
          archive.rows(key, period, start, new Date(before)).then(
            (fill): Hit | null => (fill?.rows.length ? {id, fill} : null),
            () => null,
          ),
        ),
      );
      const hits = answers.filter(hit => hit !== null);
      // a read that adds nothing says nothing, even where the same read added rows before (the config changed its station)
      const read = readKey(ids, period, start, end);
      if (!hits.length) {
        notices.delete(read);
        return recorded;
      }
      // the archive may stop short of the recorder's first row (it runs days behind): the notice names where its rows end
      const stops = hits.map(({fill}) => fill.rows[fill.rows.length - 1].end);
      notices.set(read, {station: hits[0].fill.station, before: Math.min(...stops)});
      if (notices.size > KEPT_NOTICES) notices.delete(notices.keys().next().value!);
      const merged = {...recorded};
      for (const {id, fill} of hits) merged[id] = [...fill.rows, ...(recorded[id] ?? [])];
      return merged;
    },
  };
}
