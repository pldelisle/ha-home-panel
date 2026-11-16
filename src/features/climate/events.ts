// The Climate pane's bridge event with the legacy panel: ClimateDetailEvent (up: which room the detail shows).
// Pattern: events up (Lit docs, Events): the legacy controls still draw into the detail's slot until #248, and the shell hands them what the pane chose
// through the guest interface. The event goes with the legacy controls (#248).
// Must not: carry anything but the choice, or be dispatched with `composed: false` where it must cross a shadow root (`climate-detail` does).
import type {ClimateSelection} from './model.ts';

/** What the detail shows: the room the legacy controls draw for. */
export interface ClimateShown {
  sel: ClimateSelection;
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
