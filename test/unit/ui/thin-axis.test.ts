// thinCategories: which labels of a category axis stay, by the screen's width, and what the tooltip still says.
import {describe, expect, test} from 'vitest';
import {thinCategories} from '../../../src/ui/thin-axis.ts';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Axis = {xaxis: {categories: string[]; labels: {rotate: number; formatter: (label: string) => string}}};
const labelsOf = (options: object, cats: readonly string[]) =>
  cats.map(cat => (options as Axis).xaxis.labels.formatter(cat));

describe('thinCategories', () => {
  test('on a compact screen, every third of twelve months for four labels', () => {
    const options = thinCategories(months, 4, 12, true);
    expect(labelsOf(options, months)).toEqual(['Jan', '', '', 'Apr', '', '', 'Jul', '', '', 'Oct', '', '']);
  });

  test('on a wide screen, every label up to the wide count, and every second one past it', () => {
    expect(labelsOf(thinCategories(months, 4, 12, false), months)).toEqual(months);
    expect(labelsOf(thinCategories(months, 4, 6, false), months)).toEqual(
      months.map((month, index) => (index % 2 === 0 ? month : '')),
    );
  });

  test('the axis keeps every category, never rotates, and the tooltip names the bar in full', () => {
    const options = thinCategories(months, 4, 12, true) as Axis & {tooltip: {x: {formatter: (v: string) => string}}};
    expect(options.xaxis.categories).toBe(months);
    expect(options.xaxis.labels.rotate).toBe(0);
    expect(options.tooltip.x.formatter('Feb')).toBe('Feb');
  });
});
