# 0035: Modal interruptions are native dialogs; navigation sheets stay the host's

Status: accepted (2026-11-17)

## Context

The Car rework (docs/apple-hig-audit-car-2026-11-17.md) added four overlays: a confirmation before Unlock, another before Start, the departure editor with Cancel and Save, and the charging history. ADR 0021 says the sheet host is the one object that knows which sheet is open, and that an element's sheet is asked for with a `SheetRequestEvent` and drawn in `<hp-sheet>`. The kit's sheet is a detail view the person browses and closes: it has no Cancel and Save bar, no focus trap and no `inert` page, and it is `position: fixed`, so a sheet drawn inside a card whose `backdrop-filter` makes a containing block (`.app.gl .inner`) is trapped in that card. A confirmation and an editor are not detail views. HIG, Alerts and Action sheets: a confirmation of an intentional action interrupts and asks. HIG, Sheets and Modality: an editor is a scoped task with a way to dismiss it and a guard on unsaved changes.

## Decision

**A sheet in the glossary's sense (a detail view the person browses and closes) is `<hp-sheet>`, opened through a `SheetRequestEvent` and the host, as ADR 0021 says**: the charging history is `car.history`, an over-sheet of the Car pane, as Weather's histories are. **A modal interruption, a confirmation of an intentional action or an editor holding a draft with Cancel and Save, is a native `<dialog>` opened with `showModal()` by the element that owns the decision or the draft**: the top layer escapes the content layer's containing blocks, the page goes inert, focus is trapped and returns, and the draft never leaves its element. A dialog stops Escape at itself (`stopEscape`, `src/features/car/dialogs.ts`), so one Escape closes one thing and the host never also closes the sheet beneath; a confirmation is cancelled by a tap on its backdrop, an editor never is, since a stray tap would drop the draft. A dialog never opens a sheet or another dialog. Its styles are the feature's `dialog.css` until a second feature needs one, when they move to the kit as `<hp-dialog>`.

## Consequences

- Two kinds of overlay, each with its own owner: the host answers for sheets, the element for its dialogs. The glossary names both (**Sheet**, **Dialog**).
- On a phone, opening the history from the detail sheet over Home closes that sheet first: the host's one-sheet rule.
- The departure editor works inside the phone's detail sheet as on the tab, because the top layer is above both.

## When to revisit

A second feature that needs a confirmation or an editor: move `dialog.css` and `dialogs.ts` to `src/ui/` as `<hp-dialog>`. A kit sheet that gains a Cancel and Save bar, a focus trap and the top layer would let the editor become a sheet again.

## Read

ADR 0021 (the one sheet host); `docs/apple-hig-audit-car-2026-11-17.md`, findings 7 and 9; HIG, Alerts, Action sheets, Sheets, Modality.
