// legacyFeature (src/shell/legacy-feature.ts): the data of a descriptor for a subject the guest still draws, and the ids
// its pane header and host containers hold. A template is data too: its strings and values are read, nothing is rendered.
import {describe, expect, test} from 'vitest';
import type {PanelStore} from '../../src/core/store.ts';
import type {FeatureEnv, FeatureKey} from '../../src/shell/feature.ts';
import {FEATURES} from '../../src/shell/features.ts';
import {legacyFeature} from '../../src/shell/legacy-feature.ts';

const env = (availability: Partial<Record<FeatureKey, boolean>>, line: string | null = null): FeatureEnv => ({
  store: {} as PanelStore,
  guest: {availability: () => availability, moreLine: () => line},
});

const parts = {
  icon: 'car',
  color: 'var(--c-ev)',
  phoneBar: true,
  header: {h2Id: 'carh2', subId: 'carsub2', compact: true},
  hosts: ['<div id="carhost"></div>'],
} as const;

/** the markup a pane renders: its static strings, with each plain value and each unsafeHTML string where the template binds it */
function markup(pane: ReturnType<typeof legacyFeature>['pane']): string {
  const result = pane();
  const written = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && '_$litDirective$' in value)
      return String((value as {values: unknown[]}).values[0]);
    return ''; // the icon, a nested template
  };
  // an attribute bound to a value is written quoted, and one bound to nothing (ifDefined) is left out
  return result.strings.reduce((text, s, i) => {
    if (i === 0) return s;
    const value = written(result.values[i - 1]);
    if (!text.endsWith('=')) return text + value + s;
    return value ? `${text}"${value}"${s}` : text.replace(/ [\w-]+=$/, '') + s;
  }, '');
}

describe('legacyFeature', () => {
  test('names the title by the key and carries the parts', () => {
    const d = legacyFeature('car', parts);
    expect([d.key, d.title, d.icon, d.color, d.phoneBar, d.shortTitle]).toEqual([
      'car',
      'car.title',
      'car',
      'var(--c-ev)',
      true,
      undefined,
    ]);
  });

  test('is available unless the guest says the house lacks it', () => {
    const d = legacyFeature('car', parts);
    expect(d.available?.(env({car: false}))).toBe(false);
    expect(d.available?.(env({car: true}))).toBe(true);
    expect(d.available?.(env({}))).toBe(true);
  });

  test('takes its summary from the guest', () => {
    const d = legacyFeature('car', parts);
    expect(d.summary?.(env({}, '5 W'))).toBe('5 W');
    expect(d.summary?.(env({}))).toBeNull();
  });

  test('draws the header the class wrote, then the host containers', () => {
    const text = markup(legacyFeature('car', parts).pane);
    expect(text).toBe(
      '<div class="ph cph"><span class="badge" style="--acc:var(--c-ev)"></span><div class="grow"><h2 id="carh2">Car</h2>' +
        '<div class="sub" id="carsub2"></div></div></div><div id="carhost"></div>',
    );
  });

  test('leaves the heading without an id and the header without the compact class when the parts do not name them', () => {
    const text = markup(
      legacyFeature('media', {...parts, header: {subId: 'msub', extra: '<i id="x"></i>'}, hosts: ['<b id="y"></b>']})
        .pane,
    );
    expect(text).toContain('<div class="ph">');
    expect(text).toContain('<h2>Media</h2>');
    expect(text).toContain('<i id="x"></i></div><b id="y"></b>');
  });
});

describe('the ten panes', () => {
  // the guest writes into these by id, so an id twice is a pane that draws into the wrong one
  test('hold no id twice, and the ones the guest writes into are there', () => {
    const ids = FEATURES.flatMap(f => [...markup(f.pane).matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['hsub', 'lsub', 'csub2', 'wsub2', 'carsub2', 'esub2', 'asub2', 'msub', 'cmsub', 'ausub'])
      expect(ids, id).toContain(id);
    for (const id of ['ch2', 'wh2', 'carh2', 'eh2', 'ah2', 'lhost', 'ehost', 'eside', 'camhost', 'senhost', 'auhost'])
      expect(ids, id).toContain(id);
  });

  test('head their pane with the English title', () => {
    for (const f of FEATURES) expect(markup(f.pane), f.key).toMatch(/<h2[^>]*>[A-Z][a-z]+<\/h2>/);
  });
});
