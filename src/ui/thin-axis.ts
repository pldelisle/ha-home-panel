// thinCategories: the options that label every few bars of a category axis, so a phone's chart neither rotates nor piles up its labels.
// Pattern: functional core (Bernhardt, Boundaries): a pure function of the categories and the screen, after the legacy panel's `thin()`
// (deleted in #241); its options are plain data, merged over a chart's own (ADR 0022). Energy's month and year charts use it; Climate's and Car's will.
// Must not: read the viewport (the caller says whether it is compact), the DOM or a chart library, or write a label (the categories are the caller's).
import type {ChartOptions} from './chart-options.ts';

/**
 * The x axis and the tooltip of a bar chart whose categories are `categories`: on a compact screen about `phone` labels are
 * written, elsewhere about `wide`; every `step`th category keeps its label and the others are blank, while the tooltip still names each bar.
 */
export function thinCategories(
  categories: readonly string[],
  phone: number,
  wide: number,
  compact: boolean,
): ChartOptions {
  const step = Math.ceil(categories.length / (compact ? phone : wide));
  const kept = new Set(categories.filter((_category, index) => index % step === 0));
  return {
    xaxis: {
      categories,
      labels: {rotate: 0, hideOverlappingLabels: true, formatter: (label: string) => (kept.has(label) ? label : '')},
    },
    tooltip: {x: {formatter: (label: string) => label}},
  };
}
