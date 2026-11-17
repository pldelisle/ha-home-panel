// The Car's one event: `car-image-failed` (up: a photo did not load).
// Pattern: events up, properties down (Lit docs, Events): the pane owns whether Ford's photo failed, for its life, so the card and the battery block, which come and go with the tab and the sheet, tell it and are told back.
// Must not: carry anything but its one fact, or be dispatched with `composed: false` where it must cross a shadow root (it does).

/** A photo of the car did not load: the pane keeps that for its life, so the drawn car stands in for it wherever the picture would draw. */
export class CarImageFailedEvent extends Event {
  constructor() {
    super('car-image-failed', {bubbles: true, composed: true});
  }
}

declare global {
  interface HTMLElementEventMap {
    'car-image-failed': CarImageFailedEvent;
  }
}
