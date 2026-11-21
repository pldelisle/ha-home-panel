// The API client: the one typed door to Home Assistant, a method per message the panel sends and the reply as its own type.
// Pattern: port and gateway (Cockburn, Hexagonal Architecture; Fowler, Patterns of Enterprise Application Architecture)
// over an anti-corruption layer (Evans, Domain-Driven Design): the wire is read into the panel's types here and nowhere else.
// Time fields become milliseconds and shapes are typed at the edge; field names stay the wire's (item_id, light_order).
// Must not: let a caller parse a wire shape, cache, retry or batch, touch the DOM, or be bypassed (ESLint forbids callWS).
import type {
  AiTaskStructure,
  AutomationConfig,
  ForecastEntry,
  HistoryPoint,
  LovelaceResource,
  PanelSystemData,
  StatisticRow,
  StatisticsPeriod,
  Trace,
  TraceSummary,
} from './ha.ts';
import type {PanelHass} from './hass.ts';
import type {PanelStore} from './store.ts';

/** The unit every energy statistic is asked in, which `statistics` below sets in its `units` (the test of record-fixture pins the two together): a meter that counts in Wh in the house still arrives in kWh. */
export const METER_UNIT = 'kWh';

/** What Home Assistant lists an AI Task as when the caller names none; the recorded-model command (scripts/ask-record.mjs) sends the same name, so a model sees what it sees in the panel. */
export const DEFAULT_TASK_NAME = 'Home panel';

/** Why a call failed, as Home Assistant words it: it rejects with `{code, message}`, not an Error; the message, else the code, else the value. */
export const rejectionReason = (error: unknown): string => {
  const rejection = error as {message?: unknown; code?: unknown} | null;
  return String(rejection?.message || rejection?.code || error);
};

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

/** The caller stopped waiting: its signal aborted. Home Assistant is not told, a service call cannot be cancelled there. */
export class Cancelled extends Error {
  constructor() {
    super('The caller stopped waiting for the reply');
    this.name = 'Cancelled';
  }
}

/** The forecast kinds `weather/subscribe_forecast` serves. */
export type ForecastType = 'daily' | 'hourly' | 'twice_daily';

export interface ReadOptions {
  /** False takes the reply whatever the config did meanwhile; true (the default) rejects with a StaleReply. */
  stale?: boolean;
}

export interface GenerateOptions extends ReadOptions {
  /** Aborting it rejects the call with a Cancelled; a reply that comes later is dropped. The caller's timeout is this signal. */
  signal?: AbortSignal;
  /** What Home Assistant lists the task as (default: Home panel); the feature that asks names its own. */
  taskName?: string;
}

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
    period: StatisticsPeriod,
    start: Date,
    types: readonly string[],
    end?: Date,
  ): Promise<Record<string, StatisticRow[]>>;
  history(ids: readonly string[], start: Date, options: HistoryOptions): Promise<Record<string, HistoryPoint[]>>;
  /**
   * What is stored under the key, or null when nothing is. System data does not depend on the panel's config, so a
   * caller that reads it for that reason passes `{stale: false}` and gets the reply whatever the config did meanwhile.
   */
  getSystemData(key: string, options?: ReadOptions): Promise<PanelSystemData | null>;
  setSystemData(key: string, value: PanelSystemData): Promise<void>;
  traceList(domain: string): Promise<TraceSummary[]>;
  traceGet(domain: string, itemId: string, runId: string): Promise<Trace>;
  /** The config is null when Home Assistant has none, so a caller's fallback (the trace's copy) still applies. */
  automationConfig(entityId: string): Promise<{config: AutomationConfig | null}>;
  lovelaceResources(): Promise<LovelaceResource[]>;
  /** The returned function unsubscribes. */
  subscribeForecast(entityId: string, type: ForecastType, cb: (forecast: ForecastEntry[]) => void): Promise<() => void>;
  /**
   * Asks the AI Task entity for data of the given structure and returns the reply's data as it came, unparsed: reading it is
   * the feature's. No retry, no cache, no timeout: the caller's is its signal.
   */
  generateData(
    entityId: string,
    instructions: string,
    structure: AiTaskStructure,
    options?: GenerateOptions,
  ): Promise<unknown>;
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

  /** Drops a reply, as a StaleReply, when the config changed since `generation` (unless the caller takes any reply). */
  const dropIfStale = (generation: number, stale: boolean): void => {
    if (stale && store.generation !== generation) throw new StaleReply(generation, store.generation);
  };

  /** A read: the reply is dropped, as a StaleReply, when the config changed while it was on its way. */
  async function read<W, R>(
    msg: {type: string} & Record<string, unknown>,
    reader: (wire: W) => R,
    {stale = true}: ReadOptions = {},
  ): Promise<R> {
    const hass = connected();
    const generation = store.generation;
    const wire = await hass.callWS<W>(msg);
    dropIfStale(generation, stale);
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
        // copied into STATISTIC_UNITS of scripts/record-fixture.mjs: the fixture holds rows in these units
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

    getSystemData(key, options) {
      return read<Wire<{value?: PanelSystemData | null}>, PanelSystemData | null>(
        {type: 'frontend/get_system_data', key},
        wire => wire?.value ?? null,
        options,
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
      // the config is in `config`; a reply that is the bare config is the config; no reply is no config
      return read<Wire<AutomationConfig & {config?: AutomationConfig}>, {config: AutomationConfig | null}>(
        {type: 'automation/config', entity_id: entityId},
        wire => ({config: wire?.config || wire || null}),
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

    async generateData(entityId, instructions, structure, {signal, taskName = DEFAULT_TASK_NAME, stale = true} = {}) {
      const hass = connected();
      const generation = store.generation;
      if (signal?.aborted) throw new Cancelled();
      // `ai_task.generate_data` answers `{context, response: {conversation_id, data}}` when the response is asked for
      const call = hass.callService(
        'ai_task',
        'generate_data',
        {task_name: taskName, instructions, entity_id: entityId, structure},
        undefined,
        false,
        true,
      ) as Promise<{response?: {data?: unknown}} | null | undefined>;
      let onAbort!: () => void;
      // the race stops the wait, not the call: whatever the call does later has a handler and is dropped
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Cancelled());
        signal?.addEventListener('abort', onAbort, {once: true});
      });
      try {
        const reply = await Promise.race([call, aborted]);
        // an abort that came as the reply did wins over a stale one
        if (signal?.aborted) throw new Cancelled();
        dropIfStale(generation, stale);
        return reply?.response?.data;
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },

    async runService(domain, service, data) {
      await connected().callService(domain, service, data);
    },
  };
}
