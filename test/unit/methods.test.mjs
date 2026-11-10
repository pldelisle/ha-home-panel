// Every this.method() the panel calls must exist. v1.19.9 fixed TV buttons that crashed on a call to renderPhone(),
// a method removed along with the old Phone view; this catches that kind of leftover before it ships.
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
const [panel, auto] = ['src/home-panel.js', 'src/auto.js'].map(f =>
  readFileSync(new URL('../../' + f, import.meta.url), 'utf8'),
);
const src = panel + '\n' + auto;
const BUILTIN = new Set([
  'attachShadow',
  'dispatchEvent',
  'addEventListener',
  'removeEventListener',
  'querySelector',
  'querySelectorAll',
  'getAttribute',
  'setAttribute',
  'closest',
  'contains',
]);

test('no call to a method that no longer exists', () => {
  const called = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
  const defined = new Set(
    [...src.matchAll(/^\s+(?:async\s+)?(?:get |set |static )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map(m => m[1]),
  );
  const assigned = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1]));
  const missing = [...called].filter(n => !defined.has(n) && !assigned.has(n) && !BUILTIN.has(n));
  expect(missing).toStrictEqual([]);
});

// Spec 14, step B: the class is the shell's guest, not an element. It defines the guest's methods by name (a rename or a
// removal fails here before it reaches the shell), reaches the page through the context's fields, and holds none of
// the element's half or of the services the shell owns.
test('the class defines the guest methods', () => {
  for (const m of [
    'connect',
    'disconnect',
    'hassChanged',
    'panelChanged',
    'toast',
    'tabChanged',
    'compactChanged',
    'appearanceChanged',
    'openMore',
    'availability',
    'moreLine',
  ])
    expect(panel, m).toMatch(new RegExp(`^  ${m}\\(`, 'm'));
});

test('the class takes the page and the services from the context, and is no element', () => {
  expect(panel).toMatch(/^export class LegacyPanel \{/m);
  for (const f of ['root', 'host', 'store', 'api', 'settings'])
    expect(panel, f).toMatch(new RegExp(`this\\.${f} = ctx\\.${f};`));
  for (const gone of [
    'extends HTMLElement',
    'connectedCallback',
    'disconnectedCallback',
    'createStore',
    'createSettings',
    'createApi',
    'setPanelConfig',
    'this.shadowRoot',
  ])
    expect(panel.includes(gone), gone).toBe(false);
  expect(panel).not.toMatch(/\b_panel\b/); // a word: the light-order key 'home_panel' is not the removed field
  expect(auto.includes('this.shadowRoot')).toBe(false);
});

// Spec 14, step C: the rail, the phone's bar, the panes and the phone threshold are the shell's (src/shell/features.ts), so
// the class holds no list of tabs, no gate on the rail's buttons and no media query of its own for the phone's shape.
test("the class draws no frame: the tabs, the rail gate and the phone query are the shell's", () => {
  expect(panel).not.toMatch(/const (TABS|PHONE_TABS|TAB_COLOR)\b/);
  for (const gone of ['gateTabs', 'data-tab', 'data-more', 'renderMoreTab', 'max-width:599px', 'this.mq'])
    expect(panel.includes(gone), gone).toBe(false);
  expect(panel).toMatch(/this\.ctx\.shell\.setTab\(/);
});

test('the config is de-duplicated on the store generation, not on its own copy of the config', () => {
  const at = panel.search(/^ {2}configure\(\) \{/m);
  expect(at).toBeGreaterThan(-1);
  expect(panel.slice(at, panel.indexOf('\n  }\n', at))).toContain('this.store.generation');
});
