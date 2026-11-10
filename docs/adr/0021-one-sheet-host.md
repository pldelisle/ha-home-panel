# 0021: One sheet host owns which sheet is open, Escape and where focus goes back

Status: accepted (2026-11-09)

## Context

Each sheet used to look after itself. The legacy class kept `open`, `inline` and `lastFocus` and listened for Escape on the window; the More sheet (ADR 0019) added a second Escape listener and a `moreReturn` field in the shell. With two listeners one Escape closed two things: a guest sheet opened under More closed with it, where the legacy panel closed only the top one. The household's rules are older than the code: one sheet at a time, Escape closes the sheet, then the Status checks, then the settings popup, and focus goes back to what opened the sheet.

## Decision

`SheetHost` (`src/shell/sheet-host.ts`) is the **mediator** of Gamma et al.: the one object that knows which sheet is open, so sheets and popups never know about each other. It is a Lit reactive controller on the shell: the window's `keydown` listener is added in `hostConnected` and removed in `hostDisconnected` (Lit docs, _Reactive Controllers_).

- **One sheet at a time.** Opening a sheet closes the one open, so one Escape closes one thing. Escape tries the open sheet, then the popups in the order they registered.
- **Focus.** The host saves the focused element when a sheet opens, read through every shadow root (a tile of an element is two roots down), and focuses it again when the sheet closes.
- **Two kinds of sheet.** The guest's sheets register as legacy sheets: the host toggles their `hidden`, tells the guest to build and to let go (`sheetOpened`, `sheetClosed`), and on a tablet moves the five detail panels between their sheets and their panes. An element's sheet has an id `<owner>.<name>`, and its owner's template binds `isOpen(id)` to the element's `open`.
- **Events up.** An element never imports the shell. It dispatches `SheetRequestEvent` or `ToastEvent` (`src/ui/events.ts`) with `bubbles` and `composed` set, because an event dispatched inside a shadow root is not seen outside it otherwise (Lit docs, _Events_). The shell listens on its frame and stops the event there.
- **Popups register.** The guest's two popups register with the host, which never reaches into the guest's markup; the settings popup leaves when it becomes an element, the Status checks when the guest goes.

## Consequences

- Behaviour is the legacy panel's, moved. Two differences are on purpose: opening a sheet while another is open closes the first (the legacy `show` left it standing underneath), and the More sheet no longer listens for Escape.
- Only the end-to-end specs prove the host (`test/e2e/sheets.spec.ts`); its state is private, as ADR 0005 asks.
- The host and the guest share the union of the guest's sheet ids until the guest goes.

## Read

`docs/specs/14-lit-shell.md`, "The sheet host (step E)"; Gamma et al., _Design Patterns_ (mediator); Lit docs, _Reactive Controllers_ and _Events_.
