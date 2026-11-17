// lens (src/ui/lens.ts): the Mercury drop's filter for an element's own root, drawn in every root with glass since the guest went
// (#277), whose redraw wiped the shell's copy (#198) and made the copies conditional. Nothing is rendered: the template is read.
import {expect, test} from 'vitest';
import {lens} from '../../../src/ui/lens.ts';

test('is the filter the frame names, hidden and taking no room', () => {
  const text = lens.strings.join('');
  expect(text).toContain('<filter id="glass-distortion"');
  expect(text).toContain('aria-hidden="true"');
  expect(text).toContain('width:0;height:0');
});
