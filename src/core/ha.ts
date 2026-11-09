// The panel's own types for what Home Assistant answers: the replies of the API client, one per message it sends.
// Pattern: anti-corruption layer in type form (Evans, Domain-Driven Design); each type is what the panel reads, not Home
// Assistant's whole schema, and the client fills it at the edge (times in milliseconds, history in camelCase).
// Must not: import at runtime, hold any value, or grow a field the panel does not read.

/** One bucket of a statistic (`recorder/statistics_during_period`); times are milliseconds since the epoch. */
export interface StatisticRow {
  start: number;
  end: number;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  change?: number | null;
  sum?: number | null;
  state?: number | null;
}

/** One state of an entity's history (`history/history_during_period`), from either the minimal or the full shape. */
export interface HistoryPoint {
  state: string;
  /** Milliseconds since the epoch. */
  lastUpdated: number;
  /** Milliseconds since the epoch. */
  lastChanged: number;
  /** Absent in a minimal reply, except on the first point of each entity. */
  attributes?: Record<string, unknown>;
}

/** The panel's value in Home Assistant's frontend system data (key `home_panel`). */
export interface PanelSystemData {
  light_order?: string[] | null;
  light_links?: string[][];
}

/** One run in the list of automation traces (`trace/list`). */
export interface TraceSummary {
  item_id: string;
  run_id: string;
  timestamp: {start: string; finish?: string | null};
  state: string;
  script_execution?: string;
  last_step?: string;
  trigger?: string;
  error?: string;
}

/** One step of a trace: when it ran, what it decided and how it failed. */
export interface TraceStep {
  timestamp?: string;
  result?: Record<string, unknown>;
  error?: string;
  [field: string]: unknown;
}

/** A full trace (`trace/get`): the fields the flow drawing reads, the rest left `unknown`. */
export interface Trace {
  trace?: Record<string, TraceStep[]>;
  timestamp?: {start: string; finish?: string | null};
  last_step?: string;
  state?: string;
  script_execution?: string;
  error?: string;
  [field: string]: unknown;
}

/** An automation's configuration (`automation/config`): free-form, read by the flow drawing. */
export type AutomationConfig = Record<string, unknown>;

/** One Lovelace resource (`lovelace/resources`). */
export interface LovelaceResource {
  id: string;
  url: string;
  type: string;
}

/** One entry of a weather forecast (`weather/subscribe_forecast`). */
export interface ForecastEntry {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  is_daytime?: boolean;
}
