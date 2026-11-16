// fold at the pure seam: the form two names are compared in.
import {expect, test} from 'vitest';
import {fold} from '../../../src/core/fold.ts';

test('drops case and accents, and keeps spaces and punctuation', () => {
  expect(fold('Lumière  Dessus-Piano')).toBe('lumiere  dessus-piano');
  expect(fold('ÉTÉ çà')).toBe('ete ca');
});
