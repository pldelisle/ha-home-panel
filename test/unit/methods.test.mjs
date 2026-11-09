// Every this.method() the panel calls must exist. v1.19.9 fixed TV buttons that crashed on a call to renderPhone(),
// a method removed along with the old Phone view; this catches that kind of leftover before it ships.
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
const src = ['src/home-panel.js', 'src/auto.js']
  .map(f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8'))
  .join('\n');
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
  const body = readFileSync(new URL('../../src/home-panel.js', import.meta.url), 'utf8');
  for (const m of ['connect', 'disconnect', 'hassChanged', 'panelChanged', 'narrowChanged'])
    expect(body, m).toMatch(new RegExp(`^  ${m}\\(`, 'm'));
  for (const g of ['root', 'host']) expect(body, g).toMatch(new RegExp(`^  get ${g}\\(\\) \\{`, 'm'));
});

test('the element callbacks and setters only forward to the guest methods', () => {
  const body = readFileSync(new URL('../../src/home-panel.js', import.meta.url), 'utf8');
  for (const m of ['connectedCallback', 'disconnectedCallback', 'set narrow', 'set panel', 'set hass']) {
    const at = body.search(new RegExp(`^  ${m}\\(`, 'm'));
    expect(at, m).toBeGreaterThan(-1);
    const end = body.indexOf('\n  }\n', at);
    expect(body.slice(at, end).split('\n').length, `${m} stays under ten lines`).toBeLessThan(10);
  }
});
