// The two rules every Car dialog keeps (ADR 0035): Escape stops at the dialog, and a confirmation is cancelled by a tap on its backdrop.
// Pattern: shared event handlers (Lit docs, Events), module functions so a template hands the same function at every render.
// Must not: open or close a sheet, hold state, or be used on the departure editor's backdrop (a stray tap would drop the draft).

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
