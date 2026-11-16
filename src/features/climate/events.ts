// The Climate pane's two bridge events with the legacy panel: ClimateDetailEvent (up: which room and range the detail shows) and `climate-figures` (down: what the legacy history read).
// Pattern: events up (Lit docs, Events): the legacy chart and controls still draw into the detail's slots until #246 and #248, and the shell hands them what the pane chose
// through the guest interface. The guest imports no feature, so it dispatches `climate-figures` by its name; its type is here. The pair goes with the legacy chart (#246, #248).
// Must not: carry anything but the choice and the figures, or be dispatched with `composed: false` where it must cross a shadow root (`climate-detail` does).
import type {Range} from '../../ui/ranges.ts';
import type {ClimateFigures, ClimateSelection} from './model.ts';

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
    /** The legacy panel's history loaded: the figures the Range and Heating tiles wait for (#246 deletes this). It bubbles from the guest's `#chost` to the pane. */
    'climate-figures': CustomEvent<ClimateFigures>;
  }
}
