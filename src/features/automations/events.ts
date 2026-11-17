// The events the Automations elements tell the pane with: a run or an automation picked (a dot, a chip, a run of the picker), and
// the selected card closed. Pattern: typed DOM events (Lit docs, Events: properties down, events up), composed so they leave a root.
// Must not: carry anything but what was picked, or be handled anywhere but the pane, which holds the selection.
import type {Selection} from './traces.ts';

/** A dot, a chip or a run of the picker was tapped: draw this automation, at this run or its latest. */
export class SelectRunEvent extends Event {
  static readonly type = 'select-run';
  constructor(readonly selection: Selection) {
    super(SelectRunEvent.type, {bubbles: true, composed: true});
  }
}

/** The selected card's close was tapped. */
export class CloseSelectionEvent extends Event {
  static readonly type = 'close-selection';
  constructor() {
    super(CloseSelectionEvent.type, {bubbles: true, composed: true});
  }
}

declare global {
  interface HTMLElementEventMap {
    'select-run': SelectRunEvent;
    'close-selection': CloseSelectionEvent;
  }
}
