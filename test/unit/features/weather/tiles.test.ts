// TILES as data, and the condition names against the legacy panel's `COND`, which they copy (Home and the idle clock still read it:
// the guard goes with `COND` when the last of them moves). `wxDef`, the class's table of the tiles, went with the history sheet (#159).
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, test} from 'vitest';
import {en} from '../../../../src/core/i18n/en.ts';
import {EC_SUFFIX} from '../../../../src/core/entities.ts';
import {tileDefinition, tileKeyOf, TILES} from '../../../../src/features/weather/tiles.ts';

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

const OLD_COND = evaluate('const COND = ', '\nconst condName') as Record<string, string>;

describe('the condition names against the class COND', () => {
  test('every Home Assistant condition has the class text in the English catalog, and no other key is there', () => {
    const catalog = Object.fromEntries(
      Object.entries(en)
        // Environment Canada's own phrases (`weather.cond.ec.*`) are the adapter's, not the class's COND
        .filter(([key]) => key.startsWith('weather.cond.') && !key.startsWith('weather.cond.ec.'))
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

  test('the pane shows the eight in the order of their tiles', () => {
    expect(TILES.map(t => t.key)).toEqual(['wind', 'hum', 'feels', 'pres', 'uv', 'aqhi', 'pop', 'normal']);
  });

  test('tileKeyOf reads the key of a sheet request, and nothing from anything else', () => {
    expect(tileKeyOf({key: 'pres'})).toBe('pres');
    for (const bad of [undefined, null, 'wind', {}, {key: 'rain'}, {key: 7}]) expect(tileKeyOf(bad)).toBeUndefined();
  });
});
