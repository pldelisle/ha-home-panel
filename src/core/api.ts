// The API client: the one typed door to Home Assistant, a method per message the panel sends and the reply as its own type.
// Pattern: port and gateway (Cockburn, Hexagonal Architecture; Fowler, Patterns of Enterprise Application Architecture)
// over an anti-corruption layer (Evans, Domain-Driven Design): the wire is read into the panel's types here and nowhere else.
// Must not: let a caller see a wire field name, cache, retry or batch, touch the DOM, or be bypassed (ESLint forbids callWS).
import type {
  AutomationConfig,
  ForecastEntry,
  HistoryPoint,
  LovelaceResource,
  PanelSystemData,
  StatisticRow,
  Trace,
  TraceSummary,
} from './ha.ts';
import type {PanelHass} from './hass.ts';
import type {PanelStore} from './store.ts';

/** A reply arrived under a different config than the call was made under: the panel was reconfigured in between. */
export class StaleReply extends Error {
  readonly requested: number;
  readonly current: number;
  constructor(requested: number, current: number) {
    super(`The reply belongs to config generation ${requested}, and the panel is at ${current}`);
    this.name = 'StaleReply';
    this.requested = requested;
    this.current = current;
  }
}

/** The forecast kinds `weather/subscribe_forecast` serves. */
export type ForecastType = 'daily' | 'hourly' | 'twice_daily';

export interface HistoryOptions {
  /** Home Assistant's minimal response: states without attributes, except the first of each entity. */
  minimal: boolean;
  /** False asks Home Assistant to leave the attributes out altogether. */
  attributes: boolean;
  end?: Date;
}

export interface PanelApi {
  /** Statistics of the given ids (empty and missing ids dropped, repeated ids asked once); `{}` and no message when none are left. */
  statistics(
    ids: readonly (string | null | undefined)[],
    period: string,
    start: Date,
    types: readonly string[],
    end?: Date,
  ): Promise<Record<string, StatisticRow[]>>;
  history(ids: readonly string[], start: Date, options: HistoryOptions): Promise<Record<string, HistoryPoint[]>>;
  /** What is stored under the key, or null when nothing is. */
  getSystemData(key: string): Promise<PanelSystemData | null>;
  setSystemData(key: string, value: PanelSystemData): Promise<void>;
  traceList(domain: string): Promise<TraceSummary[]>;
  traceGet(domain: string, itemId: string, runId: string): Promise<Trace>;
  automationConfig(entityId: string): Promise<{config: AutomationConfig}>;
  lovelaceResources(): Promise<LovelaceResource[]>;
  /** The returned function unsubscribes. */
  subscribeForecast(entityId: string, type: ForecastType, cb: (forecast: ForecastEntry[]) => void): Promise<() => void>;
  /** Calls a Home Assistant service; not named `callService`, which the lint rule keeps for hass alone. */
  runService(domain: string, service: string, data?: Record<string, unknown>): Promise<void>;
}

// What Home Assistant sends, before it is read. Only this file knows these shapes.
type Wire<T> = T | null | undefined;
type WireStatistics = Record<
  string,
  {
    start: number | string;
    end: number | string;
    mean?: number | null;
    min?: number | null;
    max?: number | null;
    change?: number | null;
    sum?: number | null;
    state?: number | null;
  }[]
>;
/** The compressed state: epoch seconds; `lc` is the only time when it equals `lu`, which is then left out. */
interface WireMinimalPoint {
  s: string;
  a?: Record<string, unknown>;
  lu?: number;
  lc?: number;
}
interface WireFullPoint {
  state: string;
  attributes?: Record<string, unknown>;
  last_updated: number | string;
  last_changed: number | string;
}
type WireHistory = Record<string, (WireMinimalPoint | WireFullPoint)[]>;

const toMs = (v: number | string): number => (typeof v === 'number' ? v : Date.parse(v));

function readHistoryPoint(row: WireMinimalPoint | WireFullPoint): HistoryPoint {
  if ('s' in row) {
    return {
      state: row.s,
      lastUpdated: (row.lu || row.lc || 0) * 1000,
      lastChanged: (row.lc || row.lu || 0) * 1000,
      attributes: row.a,
    };
  }
  return {
    state: row.state,
    lastUpdated: toMs(row.last_updated),
    lastChanged: toMs(row.last_changed),
    attributes: row.attributes,
  };
}

export function createApi(store: PanelStore): PanelApi {
  const connected = (): PanelHass => {
    const hass = store.hass;
    if (!hass) throw new Error('Home Assistant is not connected yet');
    return hass;
  };

  /** A read: the reply is dropped, as a StaleReply, when the config changed while it was on its way. */
  async function read<W, R>(msg: {type: string} & Record<string, unknown>, reader: (wire: W) => R): Promise<R> {
    const hass = connected();
    const generation = store.generation;
    const wire = await hass.callWS<W>(msg);
    if (store.generation !== generation) throw new StaleReply(generation, store.generation);
    return reader(wire);
  }

  return {
    statistics(ids, period, start, types, end) {
      const statisticIds = [...new Set(ids.filter(Boolean))];
      if (!statisticIds.length) return Promise.resolve({});
      const msg: {type: string} & Record<string, unknown> = {
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        statistic_ids: statisticIds,
        period,
        types,
        units: {power: 'kW', energy: 'kWh', temperature: '°C'},
      };
      if (end) msg.end_time = end.toISOString();
      return read<Wire<WireStatistics>, Record<string, StatisticRow[]>>(msg, wire =>
        Object.fromEntries(
          Object.entries(wire ?? {}).map(([id, rows]) => [
            id,
            rows.map(r => ({
              start: toMs(r.start),
              end: toMs(r.end),
              mean: r.mean,
              min: r.min,
              max: r.max,
              change: r.change,
              sum: r.sum,
              state: r.state,
            })),
          ]),
        ),
      );
    },

    history(ids, start, {minimal, attributes, end}) {
      const msg: {type: string} & Record<string, unknown> = {
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        entity_ids: ids,
        minimal_response: minimal,
        no_attributes: !attributes,
        significant_changes_only: false,
      };
      if (end) msg.end_time = end.toISOString();
      return read<Wire<WireHistory>, Record<string, HistoryPoint[]>>(msg, wire =>
        Object.fromEntries(Object.entries(wire ?? {}).map(([id, rows]) => [id, rows.map(readHistoryPoint)])),
      );
    },

    getSystemData(key) {
      return read<Wire<{value?: PanelSystemData | null}>, PanelSystemData | null>(
        {type: 'frontend/get_system_data', key},
        wire => wire?.value ?? null,
      );
    },

    // a save is a save: no stale check, whatever the config did meanwhile
    async setSystemData(key, value) {
      await connected().callWS({type: 'frontend/set_system_data', key, value});
    },

    traceList(domain) {
      return read<Wire<TraceSummary[]>, TraceSummary[]>({type: 'trace/list', domain}, wire => wire ?? []);
    },

    traceGet(domain, itemId, runId) {
      return read<Wire<Trace>, Trace>({type: 'trace/get', domain, item_id: itemId, run_id: runId}, wire => wire ?? {});
    },

    automationConfig(entityId) {
      return read<Wire<{config?: AutomationConfig}>, {config: AutomationConfig}>(
        {type: 'automation/config', entity_id: entityId},
        wire => ({config: wire?.config ?? {}}),
      );
    },

    lovelaceResources() {
      return read<Wire<LovelaceResource[]>, LovelaceResource[]>({type: 'lovelace/resources'}, wire =>
        Array.isArray(wire) ? wire : [],
      );
    },

    // a subscription is not stale: its owner tears it down itself
    async subscribeForecast(entityId, type, cb) {
      const connection = connected().connection;
      if (!connection) throw new Error('Home Assistant has no live connection yet');
      return connection.subscribeMessage<Wire<{forecast?: ForecastEntry[]}>>(m => cb(m?.forecast ?? []), {
        type: 'weather/subscribe_forecast',
        forecast_type: type,
        entity_id: entityId,
      });
    },

    async runService(domain, service, data) {
      await connected().callService(domain, service, data);
    },
  };
}
