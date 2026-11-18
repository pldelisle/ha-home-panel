// figureCell (src/ui/figure-cell.ts) and reading (src/ui/reading.ts): a figure and its unit, or the words for no reading in the kit's `.na`.
// Nothing is rendered: the template's strings and values are read, as lens.test.ts reads the lens.
import {expect, test} from 'vitest';
import {createMessages} from '../../../src/core/i18n/messages.ts';
import {figureCell} from '../../../src/ui/figure-cell.ts';
import {bareReading, reading} from '../../../src/ui/reading.ts';

const {t} = createMessages({language: 'en', tag: 'en-CA'});
const {t: tFr} = createMessages({language: 'fr', tag: 'fr-CA'});

test('a null figure is the words for no reading, with no unit, in either language; a figure keeps its unit', () => {
  expect(reading(t, null, 'kWh')).toEqual({value: 'No reading', unit: '', missing: true});
  expect(reading(tFr, null, 'kWh')).toEqual({value: 'Aucune mesure', unit: '', missing: true});
  expect(reading(t, '4.2', 'kWh')).toEqual({value: '4.2', unit: 'kWh'});
  expect(bareReading(t, null)).toEqual({value: 'No reading', missing: true});
  expect(bareReading(t, '4.2°')).toEqual({value: '4.2°'});
});

test('the cell of a missing reading is the kit’s .na with no unit and no figure class; a figure is .v num with its unit', () => {
  const missing = figureCell(reading(t, null, 'kWh'));
  expect(missing.strings.join('|')).toBe('<div class="na">|</div>');
  expect(missing.values).toEqual(['No reading']);
  const figure = figureCell(reading(t, '4.2', 'kWh'));
  expect(figure.strings.join('|')).toBe('<div class="v num">|<small>|</small></div>');
  expect(figure.values).toEqual(['4.2', 'kWh']);
});
