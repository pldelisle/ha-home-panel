// The element view of the kit's stylesheets (src/ui/styles/host.ts): the legacy frame selectors become host selectors and
// nothing else changes. Pure text in, text out, called with literal rules, and with every file of the kit as it is written.
import {readdirSync, readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {forShadow} from '../../../src/ui/styles/host.ts';

describe('forShadow', () => {
  test.each([
    ['.app.gl .sheet > .panel { x: 1 }', ':host([glass]) .sheet > .panel { x: 1 }'],
    ['.app.cp .sheet { x: 1 }', ':host([compact]) .sheet { x: 1 }'],
    ['.app.narrow .menu { x: 1 }', ':host([narrow]) .menu { x: 1 }'],
    ['.app.cp.txl .morelist { x: 1 }', ':host([compact][large-text]) .morelist { x: 1 }'],
    [
      '.app.gl.cp .sheet > .panel > .grab::before { x: 1 }',
      ':host([glass][compact]) .sheet > .panel > .grab::before { x: 1 }',
    ],
  ])('turns the frame states into host attributes: %s', (legacy, element) => {
    expect(forShadow(legacy)).toBe(element);
  });

  test('drops `tabsv`, which every tab view has', () => {
    expect(forShadow('.app.tabsv.cp .stile.wide { x: 1 }')).toBe(':host([compact]) .stile.wide { x: 1 }');
    expect(forShadow('.app.tabsv .x { y: 1 }')).toBe(':host .x { y: 1 }');
  });

  test('keeps an attribute test as it is, and negates a state', () => {
    expect(forShadow(".app.gl[data-theme='dark'] .x { y: 1 }")).toBe(":host([glass][data-theme='dark']) .x { y: 1 }");
    expect(forShadow('.app[data-theme=dark]{y:1}')).toBe(':host([data-theme=dark]){y:1}');
    expect(forShadow('.app:not(.cp) .sheet > .panel { x: 1 }')).toBe(':host(:not([compact])) .sheet > .panel { x: 1 }');
    expect(forShadow(".app.gl:not([data-theme='dark']) .x { y: 1 }")).toBe(
      ":host([glass]:not([data-theme='dark'])) .x { y: 1 }",
    );
  });

  test('turns a bare `.app` into the host', () => {
    expect(forShadow('.app { color: red }')).toBe(':host { color: red }');
  });

  test('reads minified text: no spaces, rules and lists run together', () => {
    expect(forShadow('.app.gl .a,.app.gl .b{x:1}.app.cp .c{y:2}')).toBe(
      ':host([glass]) .a,:host([glass]) .b{x:1}:host([compact]) .c{y:2}',
    );
  });

  test('leaves every other class alone, even one that begins with `app`', () => {
    for (const css of ['.apple .x { y: 1 }', '.app-bar { y: 1 }', '.myapp .x { y: 1 }', '.sheet .panel { y: 1 }'])
      expect(forShadow(css)).toBe(css);
  });

  test('refuses a frame state that has no host attribute, by name', () => {
    expect(() => forShadow('.app.idle .x { y: 1 }')).toThrow(/\.idle/);
    expect(() => forShadow('.app:not(.live) .x { y: 1 }')).toThrow(/\.live/);
  });
});

// a rule written into the kit with a state the consumer does not reflect would throw when the element first loads: say so here
describe('the kit as written', () => {
  const folder = new URL('../../../src/ui/styles/', import.meta.url);
  const files = readdirSync(folder).filter(name => name.endsWith('.css'));

  test.each(files)('%s has a host view that names no frame class', name => {
    const element = forShadow(readFileSync(new URL(name, folder), 'utf8'));
    expect(element).not.toMatch(/\.app(?![\w-])/);
  });
});
