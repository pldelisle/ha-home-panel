// Every this.method() the panel calls must exist. v1.19.9 fixed TV buttons that crashed on a call to renderPhone(),
// a method removed along with the old Phone view; this catches that kind of leftover before it ships.
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
const src = ['src/home-panel.src.js', 'src/auto.js']
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
