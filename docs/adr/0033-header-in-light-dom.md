# 0033: The header draws in the shell's light DOM, as the Home pane does

Status: accepted (2026-11-17)

## Context

The header (#269) is the shell's row above the panes: the sidebar button, the greeting with Who's home, the chips, the gear, the clock and the two popups. The legacy `.head` rules lay it out as a flex row on a tablet and a three-column grid on a phone, with the greeting, the chips' box and the clock placed by `grid-area`, the popups placed from `.head`, and the frame's grid placing `.head` itself. A shadow root around the header or its greeting and clock would take those parts out of the rules that place them, and the end-to-end specs find `#hello`, `#gear` and `#setpop` with `querySelector` in the shell's root. ADR 0032 drew the Home pane in light DOM for the same reason and said nothing else may without a record of its own.

## Decision

**`<hp-header>`, `<hp-greeting>` and `<hp-clock-line>` render into their own host (`createRenderRoot() { return this; }`)**, inside the shell's root. The header's host is `display: contents`, so `header.head` stays an item of the frame's grid; the greeting's host is `.hello#hello` and the clock's `.clock#clock`, so the legacy rules still size them. Their rules are `src/shell/header.css`, which the shell adopts after the legacy sheet and `home-pane.css`, as ADR 0032 does. The chips (`<hp-weather-chip>`, `<hp-peak-chip>`, `<hp-live-pill>`), Who's home and the two popups keep their shadow roots and their `*.element.css`; the weather chip's `slim` is its own host attribute, since a rule outside its root cannot reach its condition.

## Consequences

- `#hello`, `#chips`, `#gear`, `#clock`, `#attpop` and `#setpop` are where they were; the end-to-end specs that name them are unchanged.
- The French rewrite layer sees the header's light DOM, which holds the catalog's French; its header entries are deleted.
- The `.head` row and its round buttons keep their legacy rules, which the frame's layout shares; they move when the guest's sheet goes (#277).

## Read

ADR 0019; ADR 0028; ADR 0032; `docs/specs/24-home.md`, "As built in #269".
