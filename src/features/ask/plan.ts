// The plan: the closed type a model's reply is parsed into, the one place that reads the reply, and the errors it can give.
// Pattern: parse, don't validate (King, 2019; ADR 0015): `unknown` goes in once and a `Plan` or a `PlanError` comes out, so no code
// downstream checks it again; the model plans and the panel computes (ADR 0040). Spec 29, "The plan". The model's six flat fields
// (`form`, `sensor`, `period`, `test`, `value`, `longer_than_min`) are mapped onto the spec's `Plan` and `Test` here and nowhere else.
// Must not: coerce a type, show or log the reply (a reason goes to the console once, from the caller), run a plan, or read a catalog's entity ids.
import type {Catalog, CatalogEntry, CatalogKey, SensorKind} from './catalog.ts';
import {PERIODS, type Period} from './period.ts';

export type {Period} from './period.ts';

/** What a moment must satisfy: a binary sensor's side (`on` is open, on or home, else its opposite), or a measure's threshold. */
export type Test = {on: boolean} | {above: number} | {below: number};

export type Plan =
  | {form: 'series'; sensor: CatalogKey; period: Period}
  | {form: 'moments'; sensor: CatalogKey; period: Period; test: Test; longerThanMin: number | null}
  | {form: 'total'; sensor: CatalogKey; period: Period}
  | {form: 'unsupported'};

export type PlanForm = Plan['form'];

/** The first thing that was wrong with a reply, by name; it is shown as "unsupported", and the name goes to the console. */
export type PlanErrorReason =
  | 'not_an_object'
  | 'unknown_form'
  | 'unknown_sensor'
  | 'unknown_period'
  | 'form_kind_mismatch'
  | 'bad_test'
  | 'bad_duration';

export interface PlanError {
  error: PlanErrorReason;
}

export const isPlanError = (parsed: Plan | PlanError): parsed is PlanError => 'error' in parsed;

const FORMS: readonly PlanForm[] = ['series', 'moments', 'total', 'unsupported'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A field a model left out: strict-schema integrations send `null`, some send `''`, and an unused field may be absent. */
const isAbsent = (value: unknown): boolean => value === undefined || value === null || value === '';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The test the wire's `test` and `value` say, for a sensor of this kind; null when they do not make one. */
function testOf(kind: SensorKind, test: unknown, value: unknown): Test | null {
  if (kind === 'binary') return test === 'on' || test === 'off' ? {on: test === 'on'} : null;
  if (!isNumber(value)) return null;
  if (test === 'above') return {above: value};
  return test === 'below' ? {below: value} : null;
}

/** The kinds of sensor each form may be asked of. */
const KINDS: Record<'series' | 'moments' | 'total', readonly SensorKind[]> = {
  series: ['measure'],
  moments: ['binary', 'measure'],
  total: ['meter'],
};

function planOf(reply: Record<string, unknown>, form: PlanForm, catalog: Catalog): Plan | PlanError {
  if (form === 'unsupported') return {form};
  const entry: CatalogEntry | undefined = catalog.entries.find(candidate => candidate.key === reply.sensor);
  if (!entry) return {error: 'unknown_sensor'};
  const period = PERIODS.find(candidate => candidate === reply.period);
  if (!period) return {error: 'unknown_period'};
  if (!KINDS[form].includes(entry.kind)) return {error: 'form_kind_mismatch'};
  if (form !== 'moments') return {form, sensor: entry.key, period};
  const test = testOf(entry.kind, reply.test, reply.value);
  if (!test) return {error: 'bad_test'};
  const minutes = reply.longer_than_min;
  if (!isAbsent(minutes) && (!isNumber(minutes) || minutes < 0)) return {error: 'bad_duration'};
  // a model that fills an unused number with 0 means no minimum
  return {form, sensor: entry.key, period, test, longerThanMin: isNumber(minutes) && minutes > 0 ? minutes : null};
}

/** A model's reply as a plan the panel can answer, or the name of what was wrong with it. */
export function parsePlan(reply: unknown, catalog: Catalog): Plan | PlanError {
  if (!isObject(reply)) return {error: 'not_an_object'};
  const form = FORMS.find(candidate => candidate === reply.form);
  return form ? planOf(reply, form, catalog) : {error: 'unknown_form'};
}
