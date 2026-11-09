// The fixture recorder: the owner runs it against the real house, it writes one anonymised fixture for the model tests.
// Pattern: functional core, imperative shell (Bernhardt, Boundaries); this is the shell (arguments, socket, files, exit code)
// around scripts/lib/anonymise.mjs, and `main` takes its connection, clock and files as parameters so a test drives it with fakes.
// Must not: run in CI, read the URL or the token from anywhere but the environment, accept a mapping file inside the repository,
// or write the output when the scan finds a name, a mapped string or a banned pattern left in it.
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {BANNED_PATTERNS} from '../test/personal-data.mjs';
import {anonymise, scan} from './lib/anonymise.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DAY = 864e5;

/** The statistics periods the panel asks for and the longest span it asks of each, in days (src/home-panel.js). */
export const STATISTIC_SPANS = {'5minute': 1.05, hour: 7, day: 400};
const STATISTIC_TYPES = ['mean', 'min', 'max', 'change', 'sum'];

// what the library throws for a connection that does not open (it throws numbers, not errors)
const LIBRARY_ERRORS = {
  1: 'cannot connect to HASS_URL',
  2: 'Home Assistant refused HASS_TOKEN',
  3: 'the connection was lost',
};

const USAGE = `usage: HASS_URL=<url> HASS_TOKEN=<long-lived token> node scripts/record-fixture.mjs --map <mapping.json> --out <fixture.json> [--statistics id,id,...]

  --map         the anonymisation mapping ({"entities": {from: to}, "strings": {from: to}}); keep it outside the repository
  --out         where to write the fixture, e.g. test/unit/fixtures/houses/main.json
  --statistics  entity ids whose statistics are recorded, for each period the panel asks for`;

/** The command line as `{map, out, statistics}`; throws a usage error for an unknown flag or a missing one. */
export function parseArguments(argv) {
  const {values} = parseArgs({
    args: argv,
    options: {map: {type: 'string'}, out: {type: 'string'}, statistics: {type: 'string'}},
    strict: true,
  });
  if (!values.map || !values.out) throw new Error('--map and --out are required');
  const statistics = (values.statistics ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  return {map: values.map, out: values.out, statistics};
}

/** The `{id: row}` map of a registry or states reply, keyed by `key`. */
const indexBy = (rows, key) => Object.fromEntries(rows.map(row => [row[key], row]));

// wide enough for a statistics row with full-precision floats
const LINE_WIDTH = 200;
const isLeaf = v => v === null || typeof v !== 'object';

/**
 * JSON with two-space indentation, except that an object or array of plain values that fits on a line stays on one: a
 * statistics row is one line instead of ten, which keeps a fixture with a year of days readable and a diff of it short.
 */
export function stringify(value, indent = '') {
  if (isLeaf(value)) return JSON.stringify(value);
  const isList = Array.isArray(value);
  const entries = isList ? value.map(v => [null, v]) : Object.entries(value);
  if (entries.length === 0) return isList ? '[]' : '{}';
  const [open, close] = isList ? ['[', ']'] : ['{', '}'];
  const item = ([k, v], inner) => (isList ? '' : `${JSON.stringify(k)}: `) + stringify(v, inner);
  if (entries.every(([, v]) => isLeaf(v))) {
    const line = `${open}${entries.map(e => item(e)).join(', ')}${close}`;
    if (indent.length + line.length <= LINE_WIDTH) return line;
  }
  const inner = `${indent}  `;
  return `${open}\n${entries.map(e => `${inner}${item(e, inner)}`).join(',\n')}\n${indent}${close}`;
}

/** True when `path` is `root` or lies under it (both absolute, links resolved). */
const isInside = (path, root) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Asks Home Assistant for the house: states, the three registries and, for `statisticIds`, one statistics reply per period
 * over the span the panel uses. `connection` is what `home-assistant-js-websocket`'s `createConnection` returns: `haVersion`
 * and `sendMessagePromise(message)`.
 */
export async function fetchHouse(connection, {statisticIds = [], now}) {
  const ask = message => connection.sendMessagePromise(message);
  const [states, entities, devices, areas] = await Promise.all([
    ask({type: 'get_states'}),
    ask({type: 'config/entity_registry/list'}),
    ask({type: 'config/device_registry/list'}),
    ask({type: 'config/area_registry/list'}),
  ]);
  const house = {
    recordedAt: now.toISOString(),
    source: `home-assistant ${connection.haVersion}`,
    states: indexBy(states, 'entity_id'),
    entities: indexBy(entities, 'entity_id'),
    devices: indexBy(devices, 'id'),
    areas: indexBy(areas, 'area_id'),
  };
  if (statisticIds.length > 0) {
    house.statistics = {};
    for (const [period, days] of Object.entries(STATISTIC_SPANS)) {
      const start = new Date(now.getTime() - days * DAY).toISOString();
      // the raw reply, kept as Home Assistant sent it, under the period and start it answers
      house.statistics[`${period}@${start}`] = await ask({
        type: 'recorder/statistics_during_period',
        start_time: start,
        statistic_ids: statisticIds,
        period,
        types: STATISTIC_TYPES,
        units: {power: 'kW', energy: 'kWh', temperature: '°C'},
      });
    }
  }
  return house;
}

/** The real connection: a long-lived token over Node's global WebSocket, which the library's own socket uses. */
async function connectToHomeAssistant({url, token}) {
  const {createConnection, createLongLivedTokenAuth, createSocket} = await import('home-assistant-js-websocket');
  // `createLongLivedTokenAuth` derives ws:// or wss:// from the http(s):// URL and the library's socket does the
  // auth_required, auth, auth_ok exchange; setupRetry 0 gives up on the first failure instead of retrying for ever
  return createConnection({auth: createLongLivedTokenAuth(url, token), createSocket, setupRetry: 0});
}

/**
 * Records the fixture. Returns the exit code: 0 written, 1 refused or failed, 2 usage. `deps` are the parts a test replaces:
 * `connect({url, token})` returns the connection, `now()` the instant, `readFile(path)` and `writeFile(path, text)` the files,
 * `repoRoot` the folder a mapping may not be in, `log` and `error` the two outputs.
 */
export async function main(argv, env, deps = {}) {
  const {
    connect = connectToHomeAssistant,
    now = () => new Date(),
    readFile = path => readFileSync(path, 'utf8'),
    writeFile = (path, text) => {
      mkdirSync(dirname(path), {recursive: true});
      writeFileSync(path, text);
    },
    repoRoot = ROOT,
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
  try {
    const mapPath = resolve(args.map);
    if (isInside(realpathOrSelf(mapPath), realpathOrSelf(resolve(repoRoot)))) {
      error(
        `${args.map} is inside the repository: the mapping holds the real names, keep it outside and never commit it`,
      );
      return 1;
    }
    const mapping = JSON.parse(readFile(mapPath));
    const connection = await connect({url: env.HASS_URL, token: env.HASS_TOKEN});
    let recorded;
    try {
      recorded = await fetchHouse(connection, {statisticIds: args.statistics, now: now()});
    } finally {
      connection.close();
    }
    const {recordedAt, source, ...raw} = recorded;
    const output = {recordedAt, source, ...anonymise(raw, mapping)};
    const leftovers = scan(output, mapping, BANNED_PATTERNS);
    if (leftovers.length > 0) {
      error(
        `refusing to write ${args.out}: ${leftovers.length} leftover(s), nothing was written. Add each to the mapping:`,
      );
      for (const l of leftovers)
        error(`  ${l.path} (${l.kind}) still holds ${l.source === 'mapping' ? `"${l.found}"` : l.found}`);
      return 1;
    }
    writeFile(resolve(args.out), `${stringify(output)}\n`);
    log(
      `wrote ${args.out}: ${Object.keys(output.states).length} states, ${Object.keys(output.entities).length} entities, ` +
        `${Object.keys(output.devices).length} devices, ${Object.keys(output.areas).length} areas` +
        (output.statistics ? `, statistics for ${args.statistics.length} id(s)` : ''),
    );
    return 0;
  } catch (e) {
    error(`failed: ${LIBRARY_ERRORS[e] ?? e?.message ?? e}`);
    return 1;
  }
}

// a path's real location when it exists (a link into the repository must not slip past), else the path itself
function realpathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  // exit rather than wait: a socket whose server never answers the close would keep the process alive
  process.exit(await main(process.argv.slice(2), process.env));
}
