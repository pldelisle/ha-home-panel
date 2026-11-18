// The events an element sends up: a request to open a sheet, to close one, a tab or a room view to show, a message for the toast, and `hp-empty`, an element with nothing to show.
// Pattern: events up, properties down (Lit docs, Events): an element never imports the shell, it dispatches one of these
// from itself, and the shell, listening on its root, calls the sheet host or draws the toast; whoever composed the element hears `hp-empty` (the idle screen, since #276).
// Must not: carry state the shell has to hand back, or be dispatched with `composed: false`: they cross shadow roots.
import type {FeatureKey} from './feature.ts';

export interface SheetRequestDetail {
  /** `<owner>.<name>` for an element's sheet (`lights.room`), the element's id for a legacy one (none is left since #262) */
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

/** An element's sheet is to close: its Close button, its backdrop or its swipe. The host closes it only if it is the sheet open. */
export class SheetDismissEvent extends CustomEvent<{id: string}> {
  constructor(id: string) {
    super('sheet-dismiss', {bubbles: true, composed: true, detail: {id}});
  }
}

export interface TabSelectDetail {
  /** the section to show */
  key: FeatureKey;
  /** the area of the room view to show instead (ADR 0039); absent for a section */
  room?: string;
}

/**
 * An element asks the shell for a tab: a tile of the More sheet, the Home card's header. The shell's frame hears it from anywhere inside
 * it (ADR 0026), closes the More sheet if it is open and shows the tab.
 */
export class TabSelectEvent extends CustomEvent<TabSelectDetail> {
  constructor(key: FeatureKey, room?: string) {
    super('tab-select', {bubbles: true, composed: true, detail: room === undefined ? {key} : {key, room}});
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

export interface EmptyDetail {
  /** the element has nothing to show, and its container hides */
  empty: boolean;
}

/**
 * An element has nothing to show, or something again: its container toggles its `hidden`, as the legacy panel did when it drew the
 * markup. The Home pane hears it from the stack and the scenes row (#268), and the idle screen from its stack (#276).
 */
export class EmptyEvent extends CustomEvent<EmptyDetail> {
  constructor(empty: boolean) {
    super('hp-empty', {bubbles: true, composed: true, detail: {empty}});
  }
}

declare global {
  interface HTMLElementEventMap {
    'sheet-request': SheetRequestEvent;
    'sheet-dismiss': SheetDismissEvent;
    'tab-select': TabSelectEvent;
    toast: ToastEvent;
    'hp-empty': EmptyEvent;
  }
}
