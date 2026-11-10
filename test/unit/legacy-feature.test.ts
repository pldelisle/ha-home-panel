// legacyFeature (src/shell/legacy-feature.ts): the data of a descriptor for a subject the guest still draws, and the ids
// and slots its pane header and host containers hold. A template is data too: its strings and values are read, nothing is
// rendered (the header is an element, and no element is mounted in Node: the harness proves what it draws).
import {nothing} from 'lit';
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
});

const parts = {
  icon: 'car',
  color: 'var(--c-ev)',
  phoneBar: true,
  header: {h2Id: 'carh2', subId: 'carsub2', compact: true},
  hosts: ['<div id="carhost"></div>'],
} as const;

type Pane = ReturnType<typeof legacyFeature>['pane'];

/** the markup a pane renders: its static strings, with the header's three bindings (icon, colour, heading) left out */
const markup = (pane: Pane): string => pane(env({})).strings.join('');

/** the three values the header is given: its icon, its colour and its heading (nothing when the guest writes it) */
const bindings = (pane: Pane) => pane(env({})).values;

const pane = (key: FeatureKey) => FEATURES.find(f => f.key === key)!.pane;

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

  test('draws <hp-pane-header> with the guest-written lines in its slots, then the host containers', () => {
    expect(markup(legacyFeature('car', parts).pane)).toBe(
      '<hp-pane-header class="cph" icon= color= heading=><h2 slot="title" id="carh2">Car</h2>' +
        '<div slot="sub" id="carsub2"></div></hp-pane-header><div id="carhost"></div>',
    );
  });

  test("gives the header its icon, its colour and its heading from the catalog in the panel's language", () => {
    const d = legacyFeature('media', {...parts, icon: 'tv', color: 'var(--c-home)', header: {subId: 'msub'}});
    expect(bindings(d.pane)).toEqual(['tv', 'var(--c-home)', '[media.title]']);
  });

  test('passes no heading when the parts name the guest-written one, since the slotted node is the heading', () => {
    expect(bindings(legacyFeature('car', parts).pane)).toEqual(['car', 'var(--c-ev)', nothing]);
  });

  test('leaves out the compact class and the heading slot, and slots the actions, as the parts say', () => {
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
    for (const id of ['hsub', 'lsub', 'csub2', 'carsub2', 'esub2', 'asub2', 'msub', 'cmsub', 'ausub'])
      expect(ids, id).toContain(id);
    for (const id of ['carh2', 'lhost', 'ehost', 'eside', 'camhost', 'senhost', 'auhost'])
      expect(ids, id).toContain(id);
  });

  // the header's shadow root is closed to the guest (getElementById stops at it), so the lines it writes are slotted nodes
  test("put the line the guest writes under the heading in the header's sub slot, but the Weather pane's, which is an element", () => {
    for (const f of FEATURES.filter(f => f.key !== 'weather'))
      expect(markup(f.pane), f.key).toMatch(/<div slot="sub" id="\w+"><\/div>/);
  });

  test("put the Car heading, which the guest writes, in the header's title slot, and no other", () => {
    expect(markup(pane('car'))).toContain('<h2 slot="title" id="carh2">Car</h2>');
    expect(FEATURES.filter(f => markup(f.pane).includes('slot="title"')).map(f => f.key)).toEqual(['car']);
  });

  test("keep the Lights pane's Arrange bar in the header's actions slot, and give no other pane actions", () => {
    expect(markup(pane('lights'))).toContain('<div class="ledbar" id="ledbar" slot="actions" hidden>');
    expect(FEATURES.filter(f => markup(f.pane).includes('slot="actions"')).map(f => f.key)).toEqual(['lights']);
  });

  test("mark the summary panes' header, which only the phone shows", () => {
    expect(FEATURES.filter(f => markup(f.pane).includes('class="cph"')).map(f => f.key)).toEqual([
      'climate',
      'car',
      'energy',
      'air',
    ]);
  });

  test('head their pane with the catalog title, in the language of the panel, but the Car pane and the Weather element', () => {
    for (const f of FEATURES.filter(f => f.key !== 'car' && f.key !== 'weather'))
      expect(bindings(f.pane)[2], f.key).toBe(`[${f.key}.title]`);
  });
});
