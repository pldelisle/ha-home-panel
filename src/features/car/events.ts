// The Car's two events: `car-detail-shown`, the bridge to the legacy panel (down: the detail came on screen or left it), and `car-image-failed` (up: a photo did not load).
// Pattern: events up, properties down (Lit docs, Events): the pane owns whether Ford's photo failed, for its life, so the card and the battery block, which come and go with the tab and the sheet, tell it and are told back.
// The guest imports no feature, so it listens to `car-detail-shown` by its name on `#car-controls`; its type is here. That event goes with the legacy charger and comfort cards (#253).
// Must not: carry anything but its one fact, or be dispatched with `composed: false` where it must cross a shadow root (`car-image-failed` does).

/** The pane's container of the legacy controls was marked (`data-shown`) or unmarked: the guest draws the cards or stops. Sent from the container itself; deleted by #253. */
export class CarDetailShownEvent extends Event {
  constructor() {
    super('car-detail-shown');
  }
}

/** A photo of the car did not load: the pane keeps that for its life, so the drawn car stands in for it wherever the picture would draw. */
export class CarImageFailedEvent extends Event {
  constructor() {
    super('car-image-failed', {bubbles: true, composed: true});
  }
}

declare global {
  interface HTMLElementEventMap {
    /** Deleted by #253 with the legacy controls it announces. */
    'car-detail-shown': CarDetailShownEvent;
    'car-image-failed': CarImageFailedEvent;
  }
}
