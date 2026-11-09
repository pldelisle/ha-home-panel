// TILES, the condition names and the catalog words, against the old class's own tables (`wxDef`, `COND`), which they copy.
// The guard exists while the class still holds those tables: the ticket that deletes `wxDef` (the history move) deletes this
// file's guard tests with it, and until then a drift in either copy fails here.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, test} from 'vitest';
import {en} from '../../../../src/core/i18n/en.ts';
import {EC_SUFFIX} from '../../../../src/core/entities.ts';
import {tileDefinition, TILES, type Tone} from '../../../../src/features/weather/tiles.ts';

const panel = readFileSync(new URL('../../../../src/home-panel.js', import.meta.url), 'utf8');

/** The JavaScript text between `start` and the first `end` after it, evaluated. */
function evaluate(start: string, end: string): unknown {
  const from = panel.indexOf(start);
  expect(from, `${start} is still in the class`).toBeGreaterThan(-1);
  const to = panel.indexOf(end, from);
  const text = panel
    .slice(from + start.length, to)
    .trim()
    .replace(/;$/, '');
  return runInNewContext(`(${text})`) as unknown;
}

interface OldDefinition {
  title: string;
  sub: string;
  note: string;
  series: {id: string; name: string; unit: string; stat?: string; dash?: boolean}[];
  min?: number;
  max?: number;
  step?: boolean;
  dec?: number;
  bands?: [number, number, string, string][];
}

// the class's table is a function of the entity ids; given each key itself, a series says which key it reads
const oldTable = (
  evaluate('const wxDef = ', '\n// ---------- climate helpers') as (
    e: Record<string, string>,
  ) => Record<string, OldDefinition>
)(new Proxy({}, {get: (_, key) => String(key)}));

const OLD_COND = evaluate('const COND = ', '\nconst condName') as Record<string, string>;

const TONES: Record<string, Tone> = {'--ok': 'ok', '--warn': 'warn', '--crit': 'crit'};

describe('TILES against the class wxDef', () => {
  test('the same eight measures, the pane shows them in its own order', () => {
    expect(TILES.map(t => t.key).sort()).toEqual(Object.keys(oldTable).sort());
    expect(TILES.map(t => t.key)).toEqual(['wind', 'hum', 'feels', 'pres', 'uv', 'aqhi', 'pop', 'normal']);
  });

  test.each(TILES.map(tile => [tile.key] as const))('%s: the words, the series, the scale and the bands', key => {
    const tile = tileDefinition(key);
    const was = oldTable[key];
    expect(en[tile.labelKey]).toBe(was.title);
    expect(en[tile.subKey]).toBe(was.sub);
    expect(en[tile.noteKey]).toBe(was.note);
    expect(
      tile.series.map(s => ({id: s.entity, name: en[s.nameKey], unit: s.unit, stat: s.stat, dash: s.dash})),
    ).toEqual(was.series.map(s => ({id: s.id, name: s.name, unit: s.unit, stat: s.stat, dash: s.dash})));
    expect([tile.min, tile.max, tile.stepline, tile.dec]).toEqual([was.min, was.max, was.step, was.dec]);
    expect((tile.bands ?? []).map(b => [b.from, b.to, b.tone, en[b.labelKey]])).toEqual(
      (was.bands ?? []).map(([from, to, token, label]) => [from, to, TONES[token], label]),
    );
  });
});

describe('the condition names against the class COND', () => {
  test('every Home Assistant condition has the class text in the English catalog, and no other key is there', () => {
    const catalog = Object.fromEntries(
      Object.entries(en)
        .filter(([key]) => key.startsWith('weather.cond.'))
        .map(([key, text]) => [key.slice('weather.cond.'.length), text]),
    );
    expect(catalog).toEqual(OLD_COND);
  });
});

describe('TILES as data', () => {
  test('every series reads a sensor the config resolver finds by suffix, or the air temperature, or a forecast one', () => {
    const resolved = new Set([...Object.keys(EC_SUFFIX)]);
    for (const tile of TILES)
      for (const s of tile.series) expect(resolved.has(s.entity), `${tile.key}: ${s.entity}`).toBe(true);
  });

  test('a band covers its own numbers and the bands of a tile do not overlap', () => {
    for (const tile of TILES) {
      const bands = [...(tile.bands ?? [])].sort((a, b) => a.from - b.from);
      bands.forEach((band, i) => {
        expect(band.from).toBeLessThanOrEqual(band.to);
        if (i > 0) expect(band.from).toBeGreaterThan(bands[i - 1].to);
      });
    }
  });

  test('tileDefinition finds a tile by its key', () => {
    expect(tileDefinition('uv').labelKey).toBe('weather.tile.uv.label');
  });
});
