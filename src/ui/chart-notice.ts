// emptyChartText: the one sentence a chart's place says, in place of empty axes, when its range holds no history yet.
// Pattern: a pure function over `Translate` (the kit's words, one place), so every tab's chart says it the same way and a feature's view model
// puts it in a `notice` the element draws instead of `<hp-chart>` (the Climate `ChartNotice`, Energy's cards): a chart with nothing to draw is not drawn.
// Must not: import the DOM or Lit, decide when a chart is empty (the model that has the rows does), or draw anything.
import type {Translate} from '../core/i18n/messages.ts';

/** "No history yet. It fills in as Home Assistant records the next hour." */
export const emptyChartText = (t: Translate): string => t('chart.empty');
