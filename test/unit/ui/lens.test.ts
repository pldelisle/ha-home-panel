// lensLike (src/ui/lens.ts): the Mercury drop's filter for an element's own root, drawn where the root the element sits in has
// it. A root is stood in for by an object with `querySelector`, the one thing the function asks of it; nothing is rendered.
import {nothing} from 'lit';
import {describe, expect, test} from 'vitest';
import {lensLike} from '../../../src/ui/lens.ts';

const root = (ids: string[]) =>
  ({querySelector: (selector: string) => (ids.includes(selector.slice(1)) ? {} : null)}) as unknown as Node;

describe('lensLike', () => {
  test('draws the filter when the root the element sits in has one', () => {
    const drawn = lensLike(root(['glass-distortion']));
    expect(drawn).not.toBe(nothing);
    expect((drawn as {strings: string[]}).strings.join('')).toContain('<filter id="glass-distortion"');
  });

  test('draws nothing when that root has none, as the glass the guest draws has no lens after a redraw', () => {
    expect(lensLike(root(['other']))).toBe(nothing);
  });

  test("looks outward through the hosts: an element inside a pane's root draws the filter the shell's root has", () => {
    const shell = root(['glass-distortion']);
    const pane = Object.assign(root(['other']), {host: {getRootNode: () => shell}});
    expect(lensLike(pane)).not.toBe(nothing);
    const bare = Object.assign(root(['other']), {host: {getRootNode: () => root([])}});
    expect(lensLike(bare)).toBe(nothing);
  });
});
