// The recorded-model suite: every reply a model gave, saved by `npm run ask:record`, parsed with `parsePlan` and compared with the plan a correct
// model returns. CI never calls a model; with no recording committed the suite passes and says so.
// Pattern: a golden-master test over saved replies (Feathers, characterization tests) at the pure-function seam (spec 29, "Testing Decisions");
// the judging is `problemsOf` (scripts/lib/ask-suite.mjs), tested here on recordings made in memory.
// Must not: call a model, read the clock, or fail on a reply that is a listed known miss.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {askHouse} from '../../../../scripts/lib/ask-house.mjs';
import {problemsOf, wireOf} from '../../../../scripts/lib/ask-suite.mjs';
import {INSTRUCTIONS_VERSION} from '../../../../src/features/ask/instructions.ts';

interface Question {
  id: string;
  language: string;
  question: string;
  expected: {form: string};
}
interface Recording {
  instructionsVersion: number;
  model: string;
  replies: Record<string, unknown>;
  knownMisses?: string[];
}

const FIXTURES = new URL('../../fixtures/ask/', import.meta.url);
const QUESTIONS = JSON.parse(readFileSync(new URL('questions.json', FIXTURES), 'utf8')) as Question[];
const RECORDINGS = new URL('recordings/', FIXTURES);
const files = existsSync(RECORDINGS) ? readdirSync(RECORDINGS).filter(name => name.endsWith('.json')) : [];
const catalogOf = (language: string) => askHouse(language).catalog;

describe('the recordings in the repository', () => {
  if (files.length === 0)
    test('no recording is committed yet: record a model with `npm run ask:record -- --entity ai_task.<name> --model <label>`', () => {
      expect(files).toEqual([]);
    });
  for (const name of files)
    test(`${name}: every reply parses to the expected plan, but the known misses`, () => {
      const recording = JSON.parse(readFileSync(new URL(name, RECORDINGS), 'utf8')) as Recording;
      expect(problemsOf(recording, QUESTIONS, catalogOf, INSTRUCTIONS_VERSION, name.replace(/\.json$/, ''))).toEqual(
        [],
      );
    });
});

describe('problemsOf, on recordings made in memory', () => {
  const ask = QUESTIONS.slice(0, 4);
  const perfect = (): Recording => ({
    instructionsVersion: INSTRUCTIONS_VERSION,
    model: 'm',
    replies: Object.fromEntries(ask.map(question => [question.id, wireOf(question.expected)])),
  });
  const problems = (recording: Recording, questions = ask, version = INSTRUCTIONS_VERSION) =>
    problemsOf(recording, questions, catalogOf, version, 'm');

  test('a recording of the right plans is sound', () => {
    expect(problems(perfect())).toEqual([]);
  });

  test('a reply that differs and is not listed fails, with what was wanted and what came', () => {
    const recording = perfect();
    recording.replies[ask[0].id] = {...wireOf(ask[0].expected), period: 'today'};
    expect(problems(recording)).toEqual([
      `m: ${ask[0].id} wanted series temp.office yesterday, got series temp.office today; list it in knownMisses if it is expected`,
    ]);
  });

  test('a listed known miss is allowed to differ, whether it parses to a wrong plan, to unsupported or to a refusal', () => {
    const recording = perfect();
    recording.replies[ask[0].id] = {...wireOf(ask[0].expected), period: 'today'};
    recording.replies[ask[1].id] = {form: 'unsupported'};
    recording.replies[ask[2].id] = 'not an object';
    recording.knownMisses = ask.slice(0, 3).map(question => question.id);
    expect(problems(recording)).toEqual([]);
  });

  test('a known miss that now passes fails: it is removed from the list', () => {
    const recording = perfect();
    recording.knownMisses = [ask[0].id];
    expect(problems(recording)).toEqual([`m: ${ask[0].id} now passes, remove it from knownMisses`]);
  });

  test('a recording made with older instructions fails with the command to record it again', () => {
    const recording = {...perfect(), instructionsVersion: INSTRUCTIONS_VERSION - 1};
    const [problem, ...rest] = problems(recording);
    expect(rest).toEqual([]);
    expect(problem).toContain(
      `instructions version ${INSTRUCTIONS_VERSION - 1}, the code is at ${INSTRUCTIONS_VERSION}`,
    );
    expect(problem).toContain('npm run ask:record -- --entity ai_task.<name> --model m');
  });

  test('a question with no reply, a reply to no question and a known miss that is no question each fail', () => {
    const recording = perfect();
    delete recording.replies[ask[3].id];
    recording.replies['gone'] = {form: 'unsupported'};
    recording.knownMisses = ['also-gone'];
    expect(problems(recording)).toEqual([
      'm holds a reply to gone, which is no question',
      'm lists also-gone as a known miss, which is no question',
      `m has no reply to ${ask[3].id}`,
    ]);
  });

  test('a recording with no known misses and no replies at all is a recording of misses', () => {
    expect(problems({instructionsVersion: INSTRUCTIONS_VERSION, model: 'm', replies: {}})).toHaveLength(ask.length);
  });

  test('a failed call, recorded as a null reply, is a miss like any other', () => {
    const recording = perfect();
    recording.replies[ask[0].id] = null;
    expect(problems(recording)).toEqual([
      `m: ${ask[0].id} wanted series temp.office yesterday, got refused not_an_object; list it in knownMisses if it is expected`,
    ]);
  });
});
