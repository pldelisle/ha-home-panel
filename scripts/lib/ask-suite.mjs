// The recorded-model suite's pure half: a plan as the six flat fields a model fills, a recorded reply judged against the plan a correct
// model returns, the score of a recording and the problems the CI test reports about one.
// Pattern: functional core, imperative shell (Bernhardt, Boundaries), the shell being scripts/ask-record.mjs and the CI test; a
// golden-master suite over saved replies (Feathers, Working Effectively with Legacy Code, characterization tests) for a model that cannot run in CI.
// Must not: call a model, read a file, the clock or the environment, or judge a reply any way but through the panel's own `parsePlan`.
import {isDeepStrictEqual} from 'node:util';
import {isPlanError, parsePlan} from '../../src/features/ask/plan.ts';

/**
 * @typedef {import('../../src/features/ask/plan.ts').Plan} Plan
 * @typedef {import('../../src/features/ask/catalog.ts').Catalog} Catalog
 * @typedef {{id: string, language: string, question: string, expected: Plan}} Question
 * @typedef {(language: string) => Catalog} CatalogOf
 * @typedef {{instructionsVersion?: number, model?: string, now?: string, replies?: Record<string, unknown>, knownMisses?: string[]}} Recording
 */

/**
 * The six flat fields of the wire for a plan, the unused ones `null` and `test` the word `none`, as the probe of #535 found a model sends them.
 * @param {Plan} plan
 */
export function wireOf(plan) {
  /** @type {Record<string, unknown>} */
  const wire = {form: plan.form, sensor: null, period: null, test: 'none', value: null, longer_than_min: null};
  if (plan.form === 'unsupported') return wire;
  wire.sensor = plan.sensor;
  wire.period = plan.period;
  if (plan.form !== 'moments') return wire;
  const {test} = plan;
  if ('on' in test) wire.test = test.on ? 'on' : 'off';
  else if ('above' in test) Object.assign(wire, {test: 'above', value: test.above});
  else Object.assign(wire, {test: 'below', value: test.below});
  wire.longer_than_min = plan.longerThanMin;
  return wire;
}

/**
 * What a reply came to, in a few words: `total energy.car last_week`, `refused bad_test`, `unsupported`.
 * @param {ReturnType<typeof parsePlan>} plan
 */
export function say(plan) {
  if (isPlanError(plan)) return `refused ${plan.error}`;
  if (plan.form === 'unsupported') return 'unsupported';
  const test = plan.form === 'moments' ? ` ${JSON.stringify(plan.test)} longer ${plan.longerThanMin}` : '';
  return `${plan.form} ${plan.sensor} ${plan.period}${test}`;
}

/**
 * The reply parsed against the catalog of the question's language, whether it is the plan a correct model returns, and whether it is a
 * wrong valid plan: a plan the panel would answer that is not the expected one, the one miss that shows a household a wrong answer.
 * @param {Question} question @param {unknown} reply @param {CatalogOf} catalogOf
 */
export function judge(question, reply, catalogOf) {
  const got = parsePlan(reply, catalogOf(question.language));
  const ok = isDeepStrictEqual(got, question.expected);
  return {got, ok, wrong: !ok && !isPlanError(got) && got.form !== 'unsupported'};
}

/**
 * `[right, asked]` for one more question.
 * @param {Record<string, [number, number]>} table @param {string} key @param {boolean} ok
 */
const tally = (table, key, ok) => {
  const [right, asked] = table[key] ?? [0, 0];
  table[key] = [right + (ok ? 1 : 0), asked + 1];
};

/**
 * The score of a recording: `{right, asked, byLanguage, byForm, wrong, misses}`, `byLanguage` and `byForm` as `{name: [right, asked]}` (the form is
 * the one a correct model returns) and `wrong` the count of wrong valid plans and `misses` as `{id, language, expected, got, wrong}`, the wrong valid plans first and then in the order asked. A question with no reply is a miss.
 * @param {Question[]} questions @param {Record<string, unknown>} replies @param {CatalogOf} catalogOf
 */
export function scoreOf(questions, replies, catalogOf) {
  /** @type {{right: number, asked: number, byLanguage: Record<string, [number, number]>, byForm: Record<string, [number, number]>, wrong: number, misses: {id: string, language: string, expected: Plan, got: ReturnType<typeof parsePlan>, wrong: boolean}[]}} */
  const score = {right: 0, asked: questions.length, byLanguage: {}, byForm: {}, wrong: 0, misses: []};
  for (const question of questions) {
    const {got, ok, wrong} = judge(question, replies[question.id], catalogOf);
    tally(score.byLanguage, question.language, ok);
    tally(score.byForm, question.expected.form, ok);
    if (ok) score.right++;
    else score.misses.push({id: question.id, language: question.language, expected: question.expected, got, wrong});
    if (wrong) score.wrong++;
  }
  // the wrong valid plans first: they are the ones to read (the order asked is kept within each kind)
  score.misses.sort((a, b) => Number(b.wrong) - Number(a.wrong));
  return score;
}

/**
 * The lines the command prints for a score: the total, each language, each form, the wrong valid plans, then each miss (the wrong valid plans first) and the `knownMisses` line to paste into the file, which leaves the wrong valid plans out.
 * @param {ReturnType<typeof scoreOf>} score @param {string} label
 */
export function scoreLines(score, label) {
  /** @param {[number, number]} counts */
  const share = ([right, asked]) => `${right}/${asked}`;
  /** @param {Record<string, [number, number]>} rows */
  const table = rows =>
    Object.entries(rows)
      .map(([name, counts]) => `${name} ${share(counts)}`)
      .join(', ');
  const lines = [
    `${label}: ${score.right}/${score.asked} right`,
    `  by language: ${table(score.byLanguage)}`,
    `  by form: ${table(score.byForm)}`,
    `  wrong valid plans: ${score.wrong}`,
  ];
  if (score.misses.length === 0) return lines;
  lines.push('  misses:');
  for (const miss of score.misses)
    lines.push(
      `    ${miss.id}: wanted ${say(miss.expected)}, got ${say(miss.got)}${miss.wrong ? ' (WRONG PLAN)' : ''}`,
    );
  // a wrong valid plan cannot be accepted: the test refuses it as a known miss
  const acceptable = score.misses.filter(miss => !miss.wrong).map(miss => miss.id);
  if (acceptable.length > 0)
    lines.push(`  to accept them in CI, add to the file: "knownMisses": ${JSON.stringify(acceptable)}`);
  return lines;
}

/**
 * Whether a text is an instant written as `Date#toISOString` writes it.
 * @param {string} text
 */
const isIsoInstant = text => !Number.isNaN(Date.parse(text)) && new Date(text).toISOString() === text;

/** The command that records a model again, for a message. */
/** @param {string} label */
export const RERECORD = label => `npm run ask:record -- --entity ai_task.<name> --model ${label}`;

/**
 * What is wrong with a recording, as sentences (none when it is sound): its instructions older than the code's `version`, a question with
 * no reply or a reply to no question, a reply that differs from its expected plan and is not a listed known miss, a wrong valid plan (never
 * excused by the list) and a known miss that passes now (or names no question); an instructions version or a `now` missing or malformed. `label` names the file.
 * @param {Recording} recording @param {Question[]} questions @param {CatalogOf} catalogOf @param {number} version @param {string} label
 * @returns {string[]}
 */
export function problemsOf(recording, questions, catalogOf, version, label) {
  /** @type {string[]} */
  const problems = [];
  const recorded = recording.instructionsVersion;
  if (typeof recorded !== 'number')
    problems.push(
      `${label} has no instructionsVersion, so it is taken as older than the code's ${version}: record it again with ${RERECORD(label)}`,
    );
  else if (recorded < version)
    problems.push(
      `${label} was recorded with instructions version ${recorded}, the code is at ${version}: record it again with ${RERECORD(label)}`,
    );
  // the instant the questions were asked at, which a re-run tells the model again
  if (typeof recording.now !== 'string' || !isIsoInstant(recording.now))
    problems.push(`${label} has no valid now: it holds the ISO instant the questions were asked at`);
  const replies = recording.replies ?? {};
  const known = new Set(recording.knownMisses ?? []);
  const ids = new Set(questions.map(question => question.id));
  for (const id of Object.keys(replies))
    if (!ids.has(id)) problems.push(`${label} holds a reply to ${id}, which is no question`);
  for (const id of known) if (!ids.has(id)) problems.push(`${label} lists ${id} as a known miss, which is no question`);
  for (const question of questions) {
    if (!(question.id in replies)) {
      problems.push(`${label} has no reply to ${question.id}`);
      continue;
    }
    const {got, ok, wrong} = judge(question, replies[question.id], catalogOf);
    const said = `wanted ${say(question.expected)}, got ${say(got)}`;
    if (ok && known.has(question.id)) problems.push(`${label}: ${question.id} now passes, remove it from knownMisses`);
    // spec 29: a known miss is unsupported or refused, never a wrong valid plan left unremarked: listing one does not excuse it
    else if (wrong)
      problems.push(
        `${label}: ${question.id} is a wrong valid plan (${said}): a known miss may only be unsupported or refused`,
      );
    else if (!ok && !known.has(question.id))
      problems.push(`${label}: ${question.id} ${said}; list it in knownMisses if it is expected`);
  }
  return problems;
}
