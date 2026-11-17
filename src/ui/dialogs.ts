// The rules every dialog keeps (ADR 0036), and the look every dialog wears: Escape stops at the dialog, a confirmation is cancelled by a tap on its backdrop, and the one stylesheet.
// Pattern: shared event handlers (Lit docs, Events), module functions so a template hands the same function at every render; one source, two views (ADR 0019) for the look, adopted by `<hp-dialog>` and by an owner's own editor.
// Must not: open or close a sheet, hold state, or be used on an editor's backdrop (a stray tap would drop the draft).
import {unsafeCSS} from 'lit';
import dialogCss from './dialog.element.css?inline';
import {forShadow} from './styles/host.ts';

/** The dialog's box, its scrim, its heading and line, and its buttons: what `<hp-dialog>` draws and what an owner's editor dialog borrows. */
export const dialogLook = unsafeCSS(forShadow(dialogCss));

/** The dialog handles its own Escape (it closes itself): the host's window listener must not also close the sheet beneath it. One Escape, one thing. */
export const stopEscape = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') e.stopPropagation();
};

/** A tap on a confirmation's backdrop cancels it, as on iPadOS: the click lands on the `<dialog>` itself only outside its box. */
export const closeOnBackdrop = (e: MouseEvent): void => {
  const dialog = e.currentTarget as HTMLDialogElement;
  if (e.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
  if (!inside) dialog.close();
};
