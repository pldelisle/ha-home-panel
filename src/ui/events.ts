// The events an element sends up: a request to open a sheet, a message for the toast.
// Pattern: events up, properties down (Lit docs, Events): an element never imports the shell, it dispatches one of these
// from itself, and the shell, listening on its root, calls the sheet host or draws the toast.
// Must not: carry state the shell has to hand back, or be dispatched with `composed: false`: they cross shadow roots.

export interface SheetRequestDetail {
  /** `<owner>.<name>` for an element's sheet, the element's id for a legacy one (`sh-energy`) */
  id: string;
  /** what the sheet is asked to show, which the element and the sheet agree on */
  detail: unknown;
}

/** An element asks for a sheet to open: the shell's host closes the one open and opens this. */
export class SheetRequestEvent extends CustomEvent<SheetRequestDetail> {
  constructor(id: string, detail?: unknown) {
    super('sheet-request', {bubbles: true, composed: true, detail: {id, detail}});
  }
}

export interface ToastDetail {
  message: string;
  /** stays until it is tapped, where a plain one goes after a few seconds */
  sticky: boolean;
}

/** An element has a short message for the household. */
export class ToastEvent extends CustomEvent<ToastDetail> {
  constructor(message: string, sticky = false) {
    super('toast', {bubbles: true, composed: true, detail: {message, sticky}});
  }
}

declare global {
  interface HTMLElementEventMap {
    'sheet-request': SheetRequestEvent;
    toast: ToastEvent;
  }
}
