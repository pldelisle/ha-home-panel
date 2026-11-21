// The recorded-model command: the owner runs it by hand, it puts each question of the suite to a real AI Task entity and saves the raw replies with a score.
// Pattern: functional core, imperative shell (Bernhardt, Boundaries); this is the shell (arguments, socket, file, exit code) around
// scripts/lib/ask-suite.mjs, and `main` takes its connection, clock and file as parameters so a test drives it with fakes (as scripts/record-fixture.mjs does).
// Must not: run in CI, read the URL or the token from anywhere but the environment, take the catalog from the live house (it only lends its model),
// stop at one failed call (the question is recorded as a miss), or write a reply it was not given.
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {askInstructions, askStructure, INSTRUCTIONS_VERSION} from '../src/features/ask/instructions.ts';
import {ASK_NOW, askHouse} from './lib/ask-house.mjs';
import {stringify} from './record-fixture.mjs';
import {scoreLines, scoreOf} from './lib/ask-suite.mjs';

export const QUESTIONS_PATH = new URL('../test/unit/fixtures/ask/questions.json', import.meta.url);
export const RECORDINGS_DIR = 'test/unit/fixtures/ask/recordings';

// the task name the panel sends (src/core/api.ts), so the model sees what it sees in the panel
const TASK_NAME = 'Home panel';

// what the library throws for a connection that does not open (it throws numbers, not errors)
const LIBRARY_ERRORS = {
  1: 'cannot connect to HASS_URL',
  2: 'Home Assistant refused HASS_TOKEN',
  3: 'the connection was lost',
};

const USAGE = `usage: HASS_URL=<url> HASS_TOKEN=<long-lived token> node scripts/ask-record.mjs --entity ai_task.<name> --model <label>

  --entity  the AI Task entity to ask, e.g. ai_task.local_model
  --model   a short label for the model (letters, digits, dots, dashes, underscores): it names the file
            ${RECORDINGS_DIR}/<label>.json`;

/**
 * The command line as `{entity, model}`; throws a usage error for an unknown flag, a missing one or a label that is not a file name.
 * @param {string[]} argv
 */
export function parseArguments(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {entity: {type: 'string'}, model: {type: 'string'}},
    strict: true,
  });
  if (!values.entity || !values.model) throw new Error('--entity and --model are required');
  if (!/^ai_task\.[a-z0-9_]+$/.test(values.entity)) throw new Error('--entity takes an ai_task entity id');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.model))
    throw new Error('--model is a label of letters, digits, dots, dashes and underscores');
  return {entity: values.entity, model: values.model};
}

/**
 * Asks the entity one question: the instructions and the structure the panel sends, for the full test house's catalog in the question's
 * language, and the plan the model filled in. `connection` is what `home-assistant-js-websocket`'s `createConnection` returns.
 * Rejects when the call fails or the reply holds no data.
 * @param {{sendMessagePromise(message: object): Promise<any>}} connection
 * @param {string} entity
 * @param {import('./lib/ask-suite.mjs').Question} question
 * @param {Date} now
 * @returns {Promise<unknown>}
 */
export async function askModel(connection, entity, question, now) {
  const {catalog, fmt} = askHouse(question.language);
  const result = await connection.sendMessagePromise({
    type: 'call_service',
    domain: 'ai_task',
    service: 'generate_data',
    service_data: {
      task_name: TASK_NAME,
      entity_id: entity,
      instructions: askInstructions(question.question, now, catalog, question.language, fmt),
      structure: askStructure(catalog),
    },
    return_response: true,
  });
  // the service answers `{context, response: {conversation_id, data}}`, the plan being `data`
  const data = result?.response?.data;
  if (data === undefined) throw new Error('the reply holds no data');
  return data;
}

/**
 * The real connection: a long-lived token over Node's global WebSocket, which the library's own socket uses.
 * @param {{url: string, token: string}} login
 */
async function connectToHomeAssistant({url, token}) {
  const {createConnection, createLongLivedTokenAuth, createSocket} = await import('home-assistant-js-websocket');
  return createConnection({auth: createLongLivedTokenAuth(url, token), createSocket, setupRetry: 0});
}

/**
 * Records the suite for one model. Returns the exit code: 0 written (misses and failed calls included), 1 the connection failed, 2 usage.
 * `deps` are the parts a test replaces: `connect({url, token})` returns the connection, `now()` the instant the recording is made,
 * `questions` the suite, `writeFile(path, text)` the file, `log` and `error` the two outputs.
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   connect?: (login: {url: string, token: string}) => Promise<{haVersion?: string, close(): void, sendMessagePromise(message: object): Promise<any>}>,
 *   now?: () => Date,
 *   questions?: import('./lib/ask-suite.mjs').Question[],
 *   writeFile?: (path: string, text: string) => unknown,
 *   log?: (line: string) => void,
 *   error?: (line: string) => void,
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv, env, deps = {}) {
  const {
    connect = connectToHomeAssistant,
    now = () => new Date(),
    questions = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')),
    writeFile = (path, text) => {
      mkdirSync(dirname(path), {recursive: true});
      writeFileSync(path, text);
    },
    log = console.log,
    error = console.error,
  } = deps;
  let args;
  try {
    args = parseArguments(argv);
    if (!env.HASS_URL || !env.HASS_TOKEN) throw new Error('HASS_URL and HASS_TOKEN must be set in the environment');
  } catch (e) {
    error(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  /** @type {Record<string, unknown>} */
  const replies = {};
  /** @type {Record<string, string>} */
  const failures = {};
  const asked = new Date(ASK_NOW);
  try {
    const connection = await connect({url: env.HASS_URL, token: env.HASS_TOKEN});
    try {
      for (const question of questions) {
        try {
          replies[question.id] = await askModel(connection, args.entity, question, asked);
        } catch (e) {
          // a failed call is a miss, not the end of the run: the model that cannot answer is what the score is for
          replies[question.id] = null;
          failures[question.id] = e?.message ?? e?.code ?? String(e);
        }
      }
    } finally {
      connection.close();
    }
  } catch (e) {
    error(`failed: ${LIBRARY_ERRORS[e] ?? e?.message ?? e}`);
    return 1;
  }
  const path = `${RECORDINGS_DIR}/${args.model}.json`;
  const recording = {
    instructionsVersion: INSTRUCTIONS_VERSION,
    model: args.model,
    recordedAt: now().toISOString(),
    now: ASK_NOW,
    ...(Object.keys(failures).length > 0 && {failures}),
    replies,
  };
  writeFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), `${stringify(recording)}\n`);
  log(`wrote ${path}`);
  for (const line of scoreLines(
    scoreOf(questions, replies, language => askHouse(language).catalog),
    args.model,
  ))
    log(line);
  const failed = Object.keys(failures).length;
  if (failed > 0) log(`  ${failed} call(s) failed and are recorded as misses: ${Object.keys(failures).join(', ')}`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  // exit rather than wait: a socket whose server never answers the close would keep the process alive
  process.exit(await main(process.argv.slice(2), process.env));
}
