// The recording command: `main` of scripts/ask-record.mjs driven with a fake connection, a fixed clock and a fake file. No model, no socket,
// no file is touched; the sample recording it writes is scanned for personal data like any tracked text.
// Pattern: example-based tests at the shell's parameters (ADR 0005, Meszaros, xUnit Test Patterns), as record-fixture.test.mjs does for the fixture recorder.
// Must not: open a socket, read the environment or write to the repository.
import {readFileSync} from 'node:fs';
import {describe, expect, test, vi} from 'vitest';
import {askModel, main, parseArguments} from '../../../../scripts/ask-record.mjs';
import {ASK_NOW, askHouse} from '../../../../scripts/lib/ask-house.mjs';
import {scoreOf, wireOf} from '../../../../scripts/lib/ask-suite.mjs';
import {INSTRUCTIONS_VERSION} from '../../../../src/features/ask/instructions.ts';
import {BANNED_PATTERNS} from '../../../personal-data.mjs';

interface Question {
  id: string;
  language: 'en' | 'fr';
  question: string;
  expected: {form: string};
}

const QUESTIONS_URL = new URL('../../fixtures/ask/questions.json', import.meta.url);
const SUITE = JSON.parse(readFileSync(QUESTIONS_URL, 'utf8')) as Question[];

/** What the command writes, read back. */
interface Written {
  replies: Record<string, unknown>;
  failures?: Record<string, string>;
}
const ENV = {HASS_URL: 'http://ha.example:8123', HASS_TOKEN: 'token'};
const ARGS = ['--entity', 'ai_task.local_model', '--model', 'model-a'];
const RECORDED_AT = new Date('2026-12-01T15:00:00Z');
const catalogOf = (language: string) => askHouse(language).catalog;

const ASKED = [
  {
    id: 'q-en',
    language: 'en',
    question: 'How warm was the office yesterday?',
    expected: {form: 'series', sensor: 'temp.office', period: 'yesterday'},
  },
  {
    id: 'q-fr',
    language: 'fr',
    question: 'Combien le chauffage a-t-il consommé hier?',
    expected: {form: 'total', sensor: 'energy.heating', period: 'yesterday'},
  },
] as const;

type Message = {
  service_data: {instructions: string; structure: Record<string, unknown>; entity_id: string; task_name: string};
} & Record<string, unknown>;

/** What a call rejects with, which the socket gives as an Error or as a plain object. */
const rejects = (reason: unknown) => ({reject: reason});

/** A connection whose model answers each question from `answers` (keyed by a piece of the instructions), or fails when the answer is `rejects(...)`. */
function fakeConnection(answers: Record<string, unknown>) {
  const sent: Message[] = [];
  const connection = {
    haVersion: '2026.11.0',
    close: vi.fn(),
    sendMessagePromise: vi.fn((message: Message) => {
      sent.push(message);
      const key = Object.keys(answers).find(piece => message.service_data.instructions.includes(piece));
      const answer = key === undefined ? undefined : answers[key];
      if (typeof answer === 'object' && answer !== null && 'reject' in answer)
        return vi.fn<() => Promise<never>>().mockRejectedValue(answer.reject)();
      return Promise.resolve({context: {id: 'c'}, response: {conversation_id: 'conversation', data: answer}});
    }),
  };
  return {connection, sent};
}

/** `main` over a fake connection and a fake file: the exit code, the file written (path and parsed text) and the lines printed. */
async function record(answers: Record<string, unknown>, questions: readonly unknown[] = ASKED, argv = ARGS) {
  const {connection, sent} = fakeConnection(answers);
  const files: [string, string][] = [];
  const log: string[] = [];
  const errors: string[] = [];
  const connect = vi.fn(() => Promise.resolve(connection));
  const code = await main(argv, ENV, {
    connect,
    now: () => RECORDED_AT,
    questions,
    writeFile: (path: string, text: string) => files.push([path, text]),
    log: (line: string) => log.push(line),
    error: (line: string) => errors.push(line),
  });
  const written = files[0]
    ? {path: files[0][0], text: files[0][1], json: JSON.parse(files[0][1]) as Written}
    : undefined;
  return {code, connect, connection, sent, written, log, errors};
}

const RIGHT = {'How warm': wireOf(ASKED[0].expected), 'Combien le chauffage': wireOf(ASKED[1].expected)};

describe('ask:record, main', () => {
  test('sends the instructions and the structure the panel sends for a question, in its language, to the entity asked', async () => {
    const {sent} = await record(RIGHT);
    expect(sent).toHaveLength(2);
    const [english, french] = sent;
    expect(english).toMatchObject({
      type: 'call_service',
      domain: 'ai_task',
      service: 'generate_data',
      return_response: true,
    });
    expect(english.service_data.entity_id).toBe('ai_task.local_model');
    expect(english.service_data.task_name).toBe('Home panel');
    expect(english.service_data.instructions).toContain('Question: "How warm was the office yesterday?"');
    // the fixed instant, not the clock of the run: the date the model is told is the recording's
    expect(english.service_data.instructions).toContain('Today is Saturday 2026-11-21.');
    expect(english.service_data.instructions).toContain('temp.office (Office, measure, °)');
    expect(Object.keys(english.service_data.structure)).toEqual([
      'form',
      'sensor',
      'period',
      'test',
      'value',
      'longer_than_min',
    ]);
    // the catalog is the full test house's, named in the question's language, and holds no entity id
    expect(french.service_data.instructions).toContain('Names are in French.');
    expect(french.service_data.instructions).toContain('temp.office (Bureau, measure, °)');
    expect(french.service_data.instructions).not.toContain('sensor.');
    expect(new Date(ASK_NOW).getTime()).toBe(Date.parse('2026-11-21T20:00:00Z'));
  });

  test('writes the replies with the instructions version, the model label and the instants, and closes the connection', async () => {
    const {code, written, connection} = await record(RIGHT);
    expect(code).toBe(0);
    expect(written?.path.endsWith('test/unit/fixtures/ask/recordings/model-a.json')).toBe(true);
    expect(written?.json).toEqual({
      instructionsVersion: INSTRUCTIONS_VERSION,
      model: 'model-a',
      recordedAt: '2026-12-01T15:00:00.000Z',
      now: ASK_NOW,
      replies: {'q-en': wireOf(ASKED[0].expected), 'q-fr': wireOf(ASKED[1].expected)},
    });
    expect(written?.text.endsWith('\n')).toBe(true);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  test('prints the score per language and per form, then the misses with the line that accepts them', async () => {
    const wrong = {...wireOf(ASKED[1].expected), sensor: 'energy.car'};
    const {log} = await record({'How warm': wireOf(ASKED[0].expected), 'Combien le chauffage': wrong});
    expect(log).toContain('model-a: 1/2 right');
    expect(log).toContain('  by language: en 1/1, fr 0/1');
    expect(log).toContain('  by form: series 1/1, total 0/1');
    expect(log).toContain('    q-fr: wanted total energy.heating yesterday, got total energy.car yesterday');
    expect(log).toContain('  to accept them in CI, add to the file: "knownMisses": ["q-fr"]');
  });

  test('a failed call is recorded as a miss and the run goes on; it is not a crash', async () => {
    const {code, written, log, connection} = await record({
      'How warm': rejects(new Error('the model is loading')),
      'Combien le chauffage': wireOf(ASKED[1].expected),
    });
    expect(code).toBe(0);
    expect(written?.json.replies).toEqual({'q-en': null, 'q-fr': wireOf(ASKED[1].expected)});
    expect(written?.json.failures).toEqual({'q-en': 'the model is loading'});
    expect(log).toContain('model-a: 1/2 right');
    expect(log).toContain('    q-en: wanted series temp.office yesterday, got refused not_an_object');
    expect(log).toContain('  1 call(s) failed and are recorded as misses: q-en');
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  test('a reply with no data is a failed call too', async () => {
    const {written} = await record({'How warm': undefined, 'Combien le chauffage': wireOf(ASKED[1].expected)});
    expect(written?.json.replies['q-en']).toBeNull();
    expect(written?.json.failures['q-en']).toBe('the reply holds no data');
  });

  test('a call that rejects with a service error object is recorded by its message, a bare value by its text', async () => {
    const {written} = await record({
      'How warm': rejects({code: 'unknown_error'}),
      'Combien le chauffage': rejects('timed out'),
    });
    expect(written?.json.failures).toEqual({'q-en': 'unknown_error', 'q-fr': 'timed out'});
  });

  test('refuses a missing flag or a missing environment with the usage and asks nothing', async () => {
    const noEntity = await record(RIGHT, ASKED, ['--model', 'x']);
    expect(noEntity.code).toBe(2);
    expect(noEntity.errors[0]).toContain('--entity and --model are required');
    expect(noEntity.errors[0]).toContain('usage: HASS_URL=');
    expect(noEntity.connect).not.toHaveBeenCalled();
    const lines: string[] = [];
    const code = await main(ARGS, {}, {error: (line: string) => lines.push(line), connect: vi.fn()});
    expect(code).toBe(2);
    expect(lines[0]).toContain('HASS_URL and HASS_TOKEN must be set');
  });

  test('takes an ai_task entity and a label that is a file name, nothing else', () => {
    expect(parseArguments(ARGS)).toEqual({entity: 'ai_task.local_model', model: 'model-a'});
    expect(() => parseArguments(['--entity', 'light.lamp', '--model', 'a'])).toThrow('ai_task entity id');
    expect(() => parseArguments(['--entity', 'ai_task.a', '--model', '../escape'])).toThrow('label of letters');
    expect(() => parseArguments(['--entity', 'ai_task.a', '--model', 'a', '--out', 'x'])).toThrow();
  });

  test('a connection that does not open is reported in words and writes nothing', async () => {
    const errors: string[] = [];
    const writeFile = vi.fn();
    const refused = await main(ARGS, ENV, {
      connect: vi.fn().mockRejectedValue(2),
      writeFile,
      error: (line: string) => errors.push(line),
      questions: ASKED,
    });
    expect(refused).toBe(1);
    expect(errors).toEqual(['failed: Home Assistant refused HASS_TOKEN']);
    const broken = await main(ARGS, ENV, {
      connect: vi.fn().mockRejectedValue(new Error('boom')),
      writeFile,
      error: (line: string) => errors.push(line),
      questions: ASKED,
    });
    expect(broken).toBe(1);
    expect(errors[1]).toBe('failed: boom');
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('askModel returns the data of the reply', async () => {
    const {connection} = fakeConnection({'How warm': {form: 'unsupported'}});
    expect(await askModel(connection, 'ai_task.a', ASKED[0], new Date(ASK_NOW))).toEqual({form: 'unsupported'});
  });
});

describe('the suite as a model that is always right would record it', () => {
  const replies = Object.fromEntries(SUITE.map(question => [question.id, wireOf(question.expected)]));

  test('scores every question', () => {
    const score = scoreOf(SUITE, replies, catalogOf);
    expect(score).toMatchObject({right: SUITE.length, asked: SUITE.length, misses: []});
  });

  test('the questions and a sample recording of them hold nothing the personal-data scan looks for', async () => {
    const {written} = await record(
      Object.fromEntries(SUITE.map(question => [`"${question.question}"`, wireOf(question.expected)])),
      SUITE,
    );
    for (const text of [readFileSync(QUESTIONS_URL, 'utf8'), written?.text ?? '']) {
      expect(text.length).toBeGreaterThan(1000);
      for (const banned of BANNED_PATTERNS) expect(text).not.toMatch(banned);
    }
    expect(written?.json.replies).toEqual(replies);
  });
});
