// The anonymiser of the fixture recorder: a pure function from a recorded house and a mapping to the same house with the
// owner's names, places and ids replaced, and the scan that finds what is left. Nothing here reads a file or the network.
// Pattern: functional core, imperative shell (Bernhardt, Boundaries), the recorder script being the shell; the scan is the
// guard the shell obeys (Meyer, Design by Contract: a postcondition checked before anything is written).
// Must not: touch the file system, the clock or the environment, or print a leftover (the caller decides what to show).

/** The keys dropped wherever they occur: secrets, pictures, hardware identifiers and links to the real installation. */
export const DROPPED_KEYS = new Set([
  'access_token',
  'entity_picture',
  'id',
  'user_id',
  'mac',
  'connections',
  'identifiers',
  'serial_number',
  'sw_version',
  'hw_version',
  'configuration_url',
  // beyond the minimum: ids and hardware strings a registry row carries that no model reads
  'unique_id',
  'config_entry_id',
  'config_entries',
  'primary_config_entry',
]);

/** The keys whose number is rounded to one decimal (about ten kilometres: a town, not a street). */
const COORDINATES = new Set(['latitude', 'longitude']);

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lower case, accents removed: how Home Assistant would spell a name inside an id. */
const fold = s =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** `Real Town` as `real_town`, the way Home Assistant makes an id or an area id from a name. */
export const slug = s =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** The mapping's two tables, checked: plain objects of non-empty keys to strings. Throws on a mapping that cannot be applied. */
function checkMapping(mapping) {
  for (const table of ['entities', 'strings']) {
    const t = mapping?.[table] ?? {};
    if (typeof t !== 'object' || Array.isArray(t)) throw new Error(`mapping.${table} must be an object`);
    for (const [from, to] of Object.entries(t)) {
      if (from === '') throw new Error(`mapping.${table} has an empty key, which would match everywhere`);
      if (typeof to !== 'string') throw new Error(`mapping.${table}["${from}"] must be a string`);
      if (table === 'entities' && !from.includes('.'))
        throw new Error(`mapping.entities["${from}"] is not an entity id`);
    }
  }
  return {entities: mapping?.entities ?? {}, strings: mapping?.strings ?? {}};
}

/** One regular expression over every key of `table`, longest first so that a short name inside a long one is not half-replaced. */
const alternation = (keys, before = '', after = '') =>
  keys.length === 0
    ? null
    : new RegExp(
        `${before}(?:${[...keys]
          .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
          .map(escapeRegExp)
          .join('|')})${after}`,
        'g',
      );

/** An entity id for the replacement: the domain of the original is kept, whatever the mapping wrote before the dot. */
function keepDomain(from, to) {
  const objectId = to.includes('.') ? to.slice(to.indexOf('.') + 1) : to;
  return `${from.slice(0, from.indexOf('.'))}.${objectId}`;
}

/**
 * The replacer for a mapping: `(text) => text` applying the entity ids first (whole ids only, the domain kept), then the
 * strings (substrings, and the same words spelled as an id: `Real Town` also replaces `real_town`), longest key first.
 */
export function replacerOf(mapping) {
  const {entities, strings} = checkMapping(mapping);
  const ids = new Map(Object.entries(entities).map(([from, to]) => [from, keepDomain(from, to)]));
  // the exact spellings first, so that a slug which happens to equal another key never takes its place
  const words = new Map(Object.entries(strings));
  for (const [from, to] of Object.entries(strings)) {
    const asId = slug(from);
    if (asId && !words.has(asId)) words.set(asId, slug(to));
  }
  const idPattern = alternation([...ids.keys()], '(?<![\\w.])', '(?!\\w)');
  const wordPattern = alternation([...words.keys()]);
  return text => {
    const withIds = idPattern ? text.replace(idPattern, m => ids.get(m)) : text;
    return wordPattern ? withIds.replace(wordPattern, m => words.get(m)) : withIds;
  };
}

/** A copy of `value` with the replacer applied to every string and every key, the dropped keys removed, coordinates rounded. */
function clean(value, replace) {
  if (typeof value === 'string') return replace(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => clean(v, replace));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !DROPPED_KEYS.has(k))
      .map(([k, v]) => [
        replace(k),
        COORDINATES.has(k) && typeof v === 'number' ? Math.round(v * 10) / 10 : clean(v, replace),
      ]),
  );
}

/** The map `rows` with its keys and rows cleaned; `fix(cleanedRow, originalRow, oldKey)` adjusts a row, `rename(oldKey)` names its key. */
function cleanRows(rows, replace, {rename = replace, fix = row => row} = {}) {
  return Object.fromEntries(
    Object.entries(rows ?? {}).map(([key, row]) => [rename(key), fix(clean(row, replace), row, key)]),
  );
}

/**
 * The recorded house, anonymised: `{states, entities, devices, areas, statistics?}` (maps keyed by entity id, entity id,
 * device id and area id; statistics keyed by `period@start`, each a reply keyed by statistic id) in, the same shape out.
 * The device registry keeps its links: a device id becomes `device_001`, `device_002`, ... in the order of the real ids, and
 * every `device_id` and `via_device_id` follows, so an entity still belongs to its device.
 */
export function anonymise(house, mapping) {
  const replace = replacerOf(mapping);
  const deviceIds = new Map(
    Object.keys(house.devices ?? {})
      .sort()
      .map((id, i) => [id, `device_${String(i + 1).padStart(3, '0')}`]),
  );
  const link = id => deviceIds.get(id) ?? null;
  const out = {
    states: cleanRows(house.states, replace),
    entities: cleanRows(house.entities, replace, {
      fix: (row, original) => ('device_id' in original ? {...row, device_id: link(original.device_id)} : row),
    }),
    devices: cleanRows(house.devices, replace, {
      rename: id => link(id),
      fix: (row, original, key) => ({
        ...row,
        id: link(key),
        ...('via_device_id' in original ? {via_device_id: link(original.via_device_id)} : {}),
      }),
    }),
    areas: cleanRows(house.areas, replace),
  };
  if (house.statistics) out.statistics = clean(house.statistics, replace);
  return out;
}

// ---- the scan ----

/** `states["sensor.x"].attributes.list[0]`: where in the output a leftover sits. */
const pathOf = (parent, key) =>
  typeof key === 'number'
    ? `${parent}[${key}]`
    : /^\w+$/.test(key)
      ? `${parent}.${key}`
      : `${parent}[${JSON.stringify(key)}]`;

/** Every string of `value` (keys included) with its path, depth first. */
function* walkStrings(value, path = '$') {
  if (typeof value === 'string') yield {path, text: value, kind: 'value'};
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* walkStrings(v, pathOf(path, i));
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      yield {path: pathOf(path, k), text: k, kind: 'key'};
      yield* walkStrings(v, pathOf(path, k));
    }
}

/**
 * Everything in `output` that the mapping says must be gone, or that a banned pattern matches: `[{path, kind, found,
 * source}]`, `kind` being `key` or `value`, `source` being `mapping` (found is the mapped string) or `pattern` (found is
 * the pattern). Mapped strings are looked for ignoring case and accents, and also spelled as an id. An empty list means the
 * output may be written.
 */
export function scan(output, mapping, bannedPatterns) {
  const {entities, strings: names} = checkMapping(mapping);
  const needles = [
    ...Object.keys(entities).map(from => [from, [fold(from)]]),
    ...Object.keys(names).map(from => [from, [fold(from), slug(from)].filter(Boolean)]),
  ];
  const leftovers = [];
  for (const {path, text, kind} of walkStrings(output)) {
    const folded = fold(text);
    for (const [from, forms] of needles)
      if (forms.some(f => folded.includes(f))) leftovers.push({path, kind, found: from, source: 'mapping'});
    for (const re of bannedPatterns)
      if (text.search(re) >= 0) leftovers.push({path, kind, found: String(re), source: 'pattern'});
  }
  return leftovers;
}
