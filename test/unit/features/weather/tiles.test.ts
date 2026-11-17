// TILES as data. The guard of the condition names against the legacy panel's `COND` went with `COND` when the idle clock moved (#276);
// `wxDef`, the class's table of the tiles, went with the history sheet (#159).
import {describe, expect, test} from 'vitest';
import {EC_SUFFIX} from '../../../../src/core/entities.ts';
import {tileDefinition, tileKeyOf, TILES} from '../../../../src/features/weather/tiles.ts';

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
