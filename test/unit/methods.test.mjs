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

// Spec 14: the class already speaks the guest's interface. The Lit host's ticket (#152) deletes the element half and keeps these
// by name, so a rename or a removal here fails before it reaches that deletion list.
test('the class defines the five guest methods and the two getters', () => {
  for (const m of ['connect', 'disconnect', 'hassChanged', 'panelChanged', 'narrowChanged'])
    expect(panel, m).toMatch(new RegExp(`^  ${m}\\(`, 'm'));
  for (const g of ['root', 'host']) expect(panel, g).toMatch(new RegExp(`^  get ${g}\\(\\) \\{`, 'm'));
});

test('the element callbacks and setters only forward to the guest methods', () => {
  for (const m of ['connectedCallback', 'disconnectedCallback', 'set narrow', 'set panel', 'set hass']) {
    const at = panel.search(new RegExp(`^  ${m}\\(`, 'm'));
    expect(at, m).toBeGreaterThan(-1);
    const end = panel.indexOf('\n  }\n', at);
    expect(panel.slice(at, end).split('\n').length, `${m} stays under ten lines`).toBeLessThan(10);
  }
});
