// barsGeometry: the card's 30-day bars as numbers, the position and size of each bar in a 300 by 56 box.
// Pattern: geometry as pure data (as Climate's dial and Energy's flow), so the hardest drawing is tested with numbers and the element only places them; the rule is the legacy `bars()`'s (deleted in #251),
// positions rounded to a tenth as its `toFixed(1)` did, a bar of nothing drawn a pixel high.
// Must not: word a bar's title or say its unit (the model does, through `fmt`), pick a colour, or read the DOM.
export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The bar has something in it: it takes the series' colour, an empty one the neutral ring. */
  filled: boolean;
  /** The day it stands for, as given. */
  label: string;
  value: number;
}

export interface BarsGeometry {
  width: number;
  height: number;
  /** The scale: the highest value, and 1 for a series with nothing above zero, so that it divides. */
  highest: number;
  bars: Bar[];
}

const WIDTH = 300;
const HEIGHT = 56;
const GAP = 2;
/** The room kept above the tallest bar. */
const HEADROOM = 4;
/** A bar with something in it is at least this high; an empty one is one pixel. */
const MIN_FILLED = 2;
const MIN_EMPTY = 1;

const tenth = (n: number) => Math.round(n * 10) / 10;

/** The bars of `values`, one per label, left to right, each as tall as its share of the highest value. */
export function barsGeometry(values: readonly number[], labels: readonly string[]): BarsGeometry {
  const count = values.length || 1;
  const width = (WIDTH - GAP * (count - 1)) / count;
  const highest = Math.max(...values, 0) || 1;
  return {
    width: WIDTH,
    height: HEIGHT,
    highest,
    bars: values.map((value, i) => {
      const height = Math.max(value > 0 ? MIN_FILLED : MIN_EMPTY, (value / highest) * (HEIGHT - HEADROOM));
      return {
        x: tenth(i * (width + GAP)),
        y: tenth(HEIGHT - height),
        width: tenth(width),
        height: tenth(height),
        filled: value > 0,
        label: labels[i],
        value,
      };
    }),
  };
}
