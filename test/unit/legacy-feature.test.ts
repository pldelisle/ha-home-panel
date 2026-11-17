// legacyFeature (src/shell/legacy-feature.ts): the data of a descriptor for a subject the guest still draws, and the ids
// and slots its pane header and host containers hold. A template is data too: its strings and values are read, nothing is
// rendered (the header is an element, and no element is mounted in Node: the harness proves what it draws).
import {describe, expect, test} from 'vitest';
import type {PanelStore} from '../../src/core/store.ts';
import type {FeatureEnv, FeatureKey} from '../../src/ui/feature.ts';
import {FEATURES} from '../../src/shell/features.ts';
import {legacyFeature} from '../../src/shell/legacy-feature.ts';

const env = (availability: Partial<Record<FeatureKey, boolean>>, line: string | null = null): FeatureEnv => ({
  store: {t: (key: string) => `[${key}]`} as unknown as PanelStore,
  guest: {availability: () => availability, moreLine: () => line},
  sheetOpen: () => false,
  sheetDetail: () => undefined,
  attention: 0,
});

const parts = {
  icon: 'star',
  color: 'var(--c-ev)',
  phoneBar: true,
  header: {subId: 'sub-line'},
  hosts: ['<div id="host-box"></div>'],
} as const;

type Pane = ReturnType<typeof legacyFeature>['pane'];

/** the markup a pane renders: its static strings, with the header's three bindings (icon, colour, heading) left out */
const markup = (pane: Pane): string => pane(env({})).strings.join('');

/** the three values the header is given: its icon, its colour and its heading */
const bindings = (pane: Pane) => pane(env({})).values;

describe('legacyFeature', () => {
  test('names the title by the key and carries the parts', () => {
    const d = legacyFeature('car', parts);
    expect([d.key, d.title, d.icon, d.color, d.phoneBar, d.shortTitle]).toEqual([
      'car',
      'car.title',
      'star',
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

  test('draws <hp-pane-header> with the guest-written line in its slot, then the host containers', () => {
    expect(markup(legacyFeature('car', parts).pane)).toBe(
      '<hp-pane-header icon= color= heading=><div slot="sub" id="sub-line"></div></hp-pane-header><div id="host-box"></div>',
    );
  });

  test("gives the header its icon, its colour and its heading from the catalog in the panel's language", () => {
    const d = legacyFeature('media', {...parts, icon: 'tv', color: 'var(--c-home)', header: {subId: 'msub'}});
    expect(bindings(d.pane)).toEqual(['tv', 'var(--c-home)', '[media.title]']);
  });

  test('slots the actions, as the parts say', () => {
    const d = legacyFeature('media', {
      ...parts,
      header: {subId: 'msub', actions: '<i id="x" slot="actions"></i>'},
      hosts: ['<b id="y"></b>'],
    });
    expect(markup(d.pane)).toBe(
      '<hp-pane-header icon= color= heading=><div slot="sub" id="msub"></div><i id="x" slot="actions"></i></hp-pane-header><b id="y"></b>',
    );
  });
});

describe('the ten panes', () => {
  // the guest writes into these by id, so an id twice is a pane that draws into the wrong one
  test('hold no id twice, and the ones the guest writes into are there', () => {
    const ids = FEATURES.flatMap(f => [...markup(f.pane).matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    // Home's `#hsub` is drawn by <hp-home-pane> since #268, in its light DOM, where the guest still writes it
    for (const id of ['ausub']) expect(ids, id).toContain(id);
    for (const id of ['auhost']) expect(ids, id).toContain(id);
  });

  // the header's shadow root is closed to the guest (getElementById stops at it), so the lines it writes are slotted nodes
  test("put the line the guest writes under the heading in the header's sub slot, but the Home, Lights, Weather, Climate, Car, Energy, Air, Media and Security panes', which are elements", () => {
    for (const f of FEATURES.filter(
      f => !['home', 'lights', 'weather', 'climate', 'car', 'energy', 'air', 'media', 'cams'].includes(f.key),
    ))
      expect(markup(f.pane), f.key).toMatch(/<div slot="sub" id="\w+"><\/div>/);
  });

  test('leave the heading to the catalog: no guest-written title slot is left', () => {
    expect(FEATURES.filter(f => markup(f.pane).includes('slot="title"')).map(f => f.key)).toEqual([]);
  });

  // the Lights element draws its own Arrange bar in its header since #260
  test('give no legacy pane actions', () => {
    expect(FEATURES.filter(f => markup(f.pane).includes('slot="actions"')).map(f => f.key)).toEqual([]);
  });

  test('head their pane with the catalog title, in the language of the panel, but the Home, Lights, Weather, Climate, Car, Energy, Air, Media and Security elements', () => {
    for (const f of FEATURES.filter(
      f => !['home', 'lights', 'car', 'weather', 'climate', 'energy', 'air', 'media', 'cams'].includes(f.key),
    ))
      expect(bindings(f.pane)[2], f.key).toBe(`[${f.key}.title]`);
  });
});
