// ClimateDetailEvent: the pane tells the shell which room the detail shows, and over which range, while the detail is on screen.
// Pattern: events up (Lit docs, Events): the legacy chart and controls still draw into the detail's slots until #246 and #248, and the shell hands them
// what the pane chose through the guest interface, so the legacy panel keeps no selection of its own. A bridge that goes with them.
// Must not: carry anything but the choice, be dispatched with `composed: false` (it crosses the shadow roots), or outlive #248.
import type {Range} from '../../ui/ranges.ts';
import type {ClimateSelection} from './model.ts';

/** What the detail shows. */
export interface ClimateShown {
  sel: ClimateSelection;
  range: Range;
}

/** The detail came on screen or changed what it shows (`shown`), or left it (`null`). */
export class ClimateDetailEvent extends CustomEvent<{shown: ClimateShown | null}> {
  constructor(shown: ClimateShown | null) {
    super('climate-detail', {bubbles: true, composed: true, detail: {shown}});
  }
}

declare global {
  interface HTMLElementEventMap {
    'climate-detail': ClimateDetailEvent;
  }
}
