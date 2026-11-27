// The house's own monitoring as two Home Assistant sensors: the alerts Prometheus fires (`sensor.infra_alerts`, a `rest` sensor whose
// state is the number of firing alerts and whose `alerts` attribute is Prometheus's list) and the nightly security digest
// (`sensor.security_digest`, ok, watch, act or unknown, with a one-sentence `summary`), for the Status checks (spec 22).
// Pattern: an anti-corruption layer (Evans) at the boundary of Prometheus's alert shape, found by the config's keys (convention over
// configuration: the packages fix both ids); parse, don't validate (ADR 0015): an entry that is not an alert is dropped, not guessed at.
// Must not: call Prometheus (spec 27: it reaches the panel only as sensors), word anything a person reads, read the clock, or import a feature.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {attributeOf, hasState, numberOf, textAttributeOf, textOf} from '../core/states.ts';

/** One firing alert, as the Status checks read it. */
export interface InfraAlert {
  /** The rule's name: `BackupStale`. */
  name: string;
  /** `labels.severity` is `critical`. */
  critical: boolean;
  /** `annotations.summary`, the sentence the rule writes; null when it has none. */
  summary: string | null;
  /** When the alert went active, in milliseconds; null when Prometheus does not say. */
  since: number | null;
  /** The alert's labels as one text, unique among the firing alerts (Prometheus keeps one alert per label set). */
  identity: string;
}

export interface InfraAlertsInputs {
  /** The sensor reads a number: Home Assistant heard Prometheus at its last poll. */
  answering: boolean;
  /** The firing alerts, in Prometheus's order; the pending ones are left out. */
  firing: InfraAlert[];
}

export type SecurityDigestLevel = 'ok' | 'watch' | 'act' | 'unknown';

export interface SecurityDigestInputs {
  /** `unknown` also for `unavailable`, an unset state and any word the package does not send. */
  level: SecurityDigestLevel;
  /** The digest's sentence; null when it is empty. */
  summary: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** One entry of the `alerts` attribute, or null for one that is not a firing alert with a name. */
function parseAlert(entry: unknown): InfraAlert | null {
  if (!isRecord(entry) || entry.state !== 'firing' || !isRecord(entry.labels)) return null;
  const {labels} = entry;
  const name = text(labels.alertname);
  if (name === null) return null;
  const since = typeof entry.activeAt === 'string' ? Date.parse(entry.activeAt) : NaN;
  return {
    name,
    critical: labels.severity === 'critical',
    summary: isRecord(entry.annotations) ? text(entry.annotations.summary) : null,
    since: Number.isNaN(since) ? null : since,
    identity: Object.entries(labels)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => `${key}=${value as string}`)
      .sort()
      .join(','),
  };
}

/** The alerts sensor; null when the house has none. */
export function infraAlerts(states: HassEntities, config: Pick<ResolvedConfig, 'entities'>): InfraAlertsInputs | null {
  const id = config.entities.infraAlerts;
  if (!hasState(states, id)) return null;
  const answering = numberOf(states, id) !== null;
  const list = attributeOf(states, id, 'alerts');
  const firing = answering && Array.isArray(list) ? list.map(parseAlert).filter(a => a !== null) : [];
  return {answering, firing};
}

/** The security digest's sensor; null when the house has none. */
export function securityDigest(
  states: HassEntities,
  config: Pick<ResolvedConfig, 'entities'>,
): SecurityDigestInputs | null {
  const id = config.entities.securityDigest;
  if (!hasState(states, id)) return null;
  const state = textOf(states, id);
  const level: SecurityDigestLevel = state === 'ok' || state === 'watch' || state === 'act' ? state : 'unknown';
  return {level, summary: text(textAttributeOf(states, id, 'summary'))};
}
