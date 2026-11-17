# 0031: The Home-card bridge also places Who's home and the smart stack, with a static attribute, in slots the guest writes once

Status: accepted (2026-11-17); its `#hwx` uses closed on 2026-11-17 by the Home move (#268)

## Context

ADR 0024 lets the guest write a feature element's tag into one of its containers, with no attribute but a static `id`, once per draw in `build()`. #266 moves Who's home and the smart stack into elements before the Home pane (#268), the header (#269) and the idle screen (spec 26) can compose them. Their containers are not the guest's alone: `#hello` holds the greeting the guest still writes each minute, `#hwx` the weather it writes on each change, and `#iwrap` the idle clock it writes every twenty seconds; each write replaced the whole container, which would recreate the elements and lose what they hold (the stack's history and its cards). The stack has two looks, and the chips two places.

## Decision

**The bridge places four more tags, each with a static attribute naming its place**: `<hp-who-chips place="header">` in `#hello`, `<hp-who-card>` and `<hp-smart-stack mode="home">` in `#hwx` (the stack in its `#hstk` slot, on a tablet), and `<hp-smart-stack mode="idle">` in `#iwrap`'s `#istk`. **The guest splits each container into the slots it still fills** (`#hello-h` and `#hello-sub`, `#hwx-wx`, `#iclk`), written as siblings of the elements in `build()`, so a redraw writes a slot and never the element. `#hstk` is added or removed when the shape changes, as the legacy card drew it on a tablet only. `hp-empty` hides `#hstk`, and beside the clock it chooses between the clock alone and the clock with its card (`.ss`).

## Consequences

- No element is recreated by a redraw; the stack keeps its cards and its history.
- `#hwx-wx` is a `display: contents` wrapper, which no rule of the legacy sheet matches; `#hello`'s two slots are the legacy `h1` and `div`, so `.hello h1` and `.hello div` still match them.
- The chips in the header reproduce what the legacy `.hello div` rule set on their row (its top margin), in their own sheet.
- The bridge now has five uses, listed in `src/shell/guest.ts`; #268 and #269 delete four, and spec 26 the last.

## Read

ADR 0024; ADR 0026; `docs/specs/24-home.md`, "As built in #266".
