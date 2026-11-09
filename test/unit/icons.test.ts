// The icons of src/ui/icons.ts: each path is the text of the legacy class's own icon table, so the two cannot drift
// while the class still draws the rest of its icons, and `ico` draws one at the size asked.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {ICONS, ico, type IconName} from '../../src/ui/icons.ts';

const legacy = readFileSync(new URL('../../src/home-panel.js', import.meta.url), 'utf8');

describe('the icons', () => {
  test.each(Object.keys(ICONS) as IconName[])('%s is the path the class draws', name => {
    const written = ICONS[name].strings.join('');
    // prettier puts a long entry on the next line
    expect(legacy).toMatch(new RegExp(`\\n  ${name}:\\s*'${written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  });

  test('ico draws an svg of the size asked, and 20 pixels by default', () => {
    expect(ico('menu', 24).values[0]).toBe(24);
    expect(ico('menu').values).toEqual([20, 20, ICONS.menu]);
  });
});
