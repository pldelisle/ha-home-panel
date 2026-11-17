# Design rules

The rules every pane follows, so that what can be tapped looks tappable and nothing else does. They sit under the glass look
(`src/shell/frame/glass.css`) and hold with glass off too. The tokens are in `src/ui/styles/tokens.css`; the published design system
mirrors them.

## Two layers

Apple's rule (HIG, Materials): "Don't use Liquid Glass in the content layer." Liquid Glass is the **navigation layer** only: the
rail and the phone's tab bar, the header's round buttons and capsules (the live pill, the peak chip, Settings), popovers, toasts,
dialogs (`<hp-dialog>`, ADR 0036: a question over the page, in the top layer) and a sheet's frame and its close button.
Everything a pane shows is the **content layer**, and stays opaque with glass on: the
wallpaper shows faintly through a card's near-opaque fill and plain blur, never through its wells or controls. The glass tokens of
the navigation layer are `--g-fill`, `--g-dense`, `--g-edge`, `--g-bd` (with the Chromium lens), `--nav-sel-bg` and
`--g-nav-rim-s`; the content layer's are `--g-card`, `--g-tile`, `--m-bd` and `--m-edge` (`src/ui/styles/tokens.css` and `src/shell/frame/glass.css`). The glass
strength setting moves the navigation layer only.

- The rail and the phone's tab bar draw as the Files app's sidebar: every icon in the one blue (`--c-home`), the labels in the
  text colour, and the chosen section on a darker neutral fill (`--nav-sel-bg`). A section never colours the navigation.
- A pane's or a sheet's title icon stands bare beside the title, on no fill: it is part of the title, not a button.

## Three surfaces in the content layer

| Surface | What it is                                             | Look                                                                              | Radius           |
| ------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------- |
| Card    | holds one subject's content                            | `--card` and `--shadow`; glass: `--g-card` (near-opaque), `--m-bd` and `--m-edge` | 22 px            |
| Well    | shows a value or a state, and does nothing when tapped | `--card2`; glass: `--g-tile` (near-opaque), no rim                                | 16 px            |
| Control | anything a tap acts on inside a card                   | `--ctl-bg` and `--ctl-edge`: raised above the wells, the same with glass on       | 16 px, pills 999 |

- A control is never drawn as a well, and a well never gets a rim, a shadow or a pointer.
- **A value tile with a chevron leads to its data; a tile without one is not a button.** If a tile opens something (a history, or
  the chart and range it summarises), it is a control, the kit's `.tile.tilebtn` (`src/ui/styles/tiles.css`): a `<button>` raised on
  `--ctl-bg`, its figure followed by a `›`, and a screen-reader description of where it leads (`aria-description`: "Opens the
  history", "Shows its chart"). If it opens nothing it is a well (`.tile`): a `<div>`, flat, with no pointer. One row of tiles can
  mix the two (Energy's totals, Climate's house detail): only the tiles that lead somewhere are buttons. Why: HIG, Buttons and Lists and tables: a thing that acts looks as if it does, and the same shape works the same way
  everywhere. Used by Weather's tiles, Air's readings (which carry the words in their name, "CO₂ 640 ppm, opens its history"),
  Climate's Warmest and Coolest, and Energy's totals. Enforced by `test/e2e/climate.spec.ts` (the description), `test/e2e/energy.spec.ts` (four of the six totals are buttons, the car and the
  rate are not) and `test/e2e/air.spec.ts` (the names); `test/e2e/a11y.spec.ts` fails a button that holds another (`nestedInteractive`).
- A whole card is tappable only when the whole card goes to one place (the Home tiles, which show the `›` square in their
  top-right corner). A card with controls inside it is not itself tappable; if it also leads somewhere, its header row carries the
  `›` (the Security card). A row that opens something ends in a plain `›` (a light tile's row, the Car's departure and charging
  history, the Automations list); a tile that acts and opens nothing (a scene, a bulb) has none, and a light tile is two sibling
  buttons, the row that opens the room and the bulb that switches it, never one inside the other.
- Nested shapes take the smaller radius: card 22, then wells and controls 16, then icon squares 10–12.
- A request for reduced transparency (`prefers-reduced-transparency: reduce`) makes the navigation layer solid too, and drops the
  cards' blur.

## Telling the person what a tap does

- Say it with the surface and the `›`, not with words. No "Tap to …" lines: a scene that has never run says "Never run", not
  "Tap to run"; the Now playing card has no footer.
- A toggle shows its state on the control (tint and its On/Off line), never only in the label.
- A value the person cannot change right now (a read-only segmented control, an unavailable device) mutes its unchosen options.

## Status is text with a dot

A filled capsule means "tap me" in this panel (the live pill), so a fact never wears one. **A status is text with
a small coloured dot, never a filled capsule.** The kit's `.status` (`src/ui/styles/status.css`) is plain text with an `<i
aria-hidden>` dot before it; the dot's tone is `.ok`, `.warn` (its word in the warning text colour) or `.bad`, and the word always
stays, so the tone is never carried by colour alone. It has no fill, so the card's glass shows through. The Car's facts, the
Automations' dates and runs, Air's ratings and Home's people use it. Why: HIG, Buttons (a button's style says it can be tapped) and
Color (never colour alone). Nothing forbids a capsule mechanically yet: the e2e specs find the `.status` text (`air.spec.ts`,
`automations.spec.ts`), and `test/e2e/a11y.spec.ts` holds its 4.5:1 contrast with no rule switched off (`DISABLED_RULES` is empty).

## One range per tab

A pane with a history has **one range control, at the top** (`<hp-range-tabs>`, `src/ui/range-tabs.ts`; the ranges are `RANGES` in
`src/ui/ranges.ts`, with Energy's own Now and Today). Every card below it follows it, or names its own fixed period in its title
or its line ("Today, hour by hour", "Today so far", "30 days"); a card never carries a second range control, and a tile that
sets the range does it by setting the tab's (Energy's totals). A sheet that opens over a pane for one reading's history (Weather's
and Air's tiles, a sensor) is its own place and has its own one control, at its top. Why: HIG, Segmented controls: one control
chooses one thing, so the page cannot say Week while a card says Today. Enforced by `test/e2e/energy.spec.ts` (one
`hp-range-tabs` under the header, the totals set it) and the unit tests of the ranges (`test/unit/ui/ranges.test.ts`).

## The header

- The header's controls are the live pill and the round gear (Settings). A reading (the weather) is plain text beside them, so it
  never looks like one of them, and the people under the greeting are status text (see "Status is text"), not buttons. The one
  capsule there that opens nothing is the peak chip, a glass alert in the navigation layer; it is a known exception to "a filled
  capsule is a button", not a pattern to copy.
- The date is written once, under the greeting; a pane's sub-line does not repeat it.

## Type and words

- **Labels and group headers are in sentence case**, as iOS 26 writes them: the catalog's words are drawn as written, with no
  `text-transform: uppercase` and no letter spacing (13 pt semibold in the secondary text colour). Why: HIG, Typography and
  Writing: capitals read worse at small sizes and with Larger Text. Enforced by `test/unit/styles-split.test.mjs` ("no stylesheet
  writes text-transform: uppercase"), which scans every stylesheet.
- **Every time and date the household reads goes through `fmt`** (`src/core/i18n/format.ts`, built from Home Assistant's locale,
  time zone and 12 or 24-hour choice): 12-hour with am and pm in English, 24-hour in French, and the month-first or day-first date
  of the language. A chart's axis and tooltip are no exception: the library's own English tick formats are never used; `houseAxis`,
  `axisLabel` and `tooltipDate` (`src/ui/chart-options.ts`) write them from `fmt`, with ticks on whole hours or midnights, and a
  chart within one day writes midnight as "12 am" or "0 h". Why: HIG, Writing and Layout: the format people expect, the same
  everywhere. Enforced by `test/unit/ui/chart-options.test.ts` ("the time axis in the house's formats", `tooltipDate`, `timeAxis`)
  and `test/unit/format.test.ts`.

- Manrope for every word and figure (400–700), JetBrains Mono for code (the config card's paths). Both ship in `dist/fonts/`
  (`src/fonts.js`); nothing is fetched from Google.
- The design system copies no platform vendor's assets: the icons are the panel's own, and no font, control or setting name is
  taken from Apple.
