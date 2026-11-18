# Design rules

The rules every pane follows, so that what can be tapped looks tappable and nothing else does. They sit under the glass look
(`src/shell/frame/glass.css`) and hold with glass off too. The tokens are in `src/ui/styles/tokens.css`; the published design system
mirrors them.

## Two layers

Apple's rule (HIG, Materials): "Don't use Liquid Glass in the content layer." Liquid Glass is the **navigation layer** only: the
rail and the phone's tab bar, the header's round buttons and capsules (the live pill, Settings), popovers, toasts,
dialogs (`<hp-dialog>`, ADR 0036: a question over the page, in the top layer) and a sheet's frame and its close button.
Everything a pane shows is the **content layer**, and stays opaque with glass on: the
wallpaper shows faintly through a card's near-opaque fill and plain blur, never through its wells or controls. The glass tokens of
the navigation layer are `--g-fill`, `--g-dense`, `--g-edge`, `--g-bd` (with the Chromium lens), `--nav-sel-bg`, `--nav-sel-fg` and
`--g-nav-rim-s`; the content layer's are `--g-card`, `--g-tile`, `--m-bd` and `--m-edge` (`src/ui/styles/tokens.css` and `src/shell/frame/glass.css`). The glass
strength setting moves the navigation layer only.

- The rail and the phone's tab bar draw as an iPadOS tab bar: every section in grey (`--fg2`), the chosen one in the one blue
  (`--nav-sel-fg`), icon and label alike, on a darker neutral fill (`--nav-sel-bg`). A section never colours the navigation.
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
  history"). Every tile is drawn by one template, `tile()` (`src/ui/tile.ts`), which Climate, Energy and Air share. If it opens nothing it is a well (`.tile`): a `<div>`, flat, with no pointer. One row of tiles can
  mix the two (Climate's house detail): only the tiles that lead somewhere are buttons. Why: HIG, Buttons and Lists and tables: a thing that acts looks as if it does, and the same shape works the same way
  everywhere. Used by Weather's tiles, Air's readings ("Opens its history")
  and Climate's Warmest and Coolest. Enforced by `test/e2e/climate.spec.ts` (the description)
  and `test/e2e/air.spec.ts` (the description); `test/e2e/a11y.spec.ts` fails a button that holds another (`nestedInteractive`).
- A whole card is tappable only when the whole card goes to one place (the Home tiles, which show a plain `›` in their
  top-right corner, in `--fg3`, with no box: a boxed chevron reads as a second button). A card with controls inside it is not itself tappable; if it also leads somewhere, its header row carries a plain `›`, as the tiles do (the Security card). A row that opens something ends in a plain `›` (a light tile's row, the Car's departure and charging
  history, the Automations list); a tile that acts and opens nothing (a scene, a bulb) has none, and a light tile is two sibling
  buttons, the row that opens the room and the bulb that switches it, never one inside the other.
- Nested shapes take the smaller radius: card 22, then wells and controls 16, then icon squares 10–12.
- A request for reduced transparency (`prefers-reduced-transparency: reduce`) makes the navigation layer solid too, and drops the
  cards' blur.

## Shape and motion

Every corner and every easing is a token declared once on `.app` (`src/ui/styles/tokens.css`), named by the role it plays and not by its
value, so a second design language can redefine the set in one place. No rule writes a literal pixel `border-radius` (0, 50% and
`inherit` aside) or a `cubic-bezier(...)`: `test/unit/shape-motion-tokens.test.mjs` fails it, and fails a token a rule reads but
`tokens.css` does not declare.

| Role                | Token                                                                                                                                                                | Today                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Big surfaces        | `--shape-feature`, `--shape-slider`, `--shape-sheet`, `--shape-dialog`, `--shape-nav-item`                                                                           | 34, 32, 30, 26, 24 px                             |
| Card                | `--shape-card`; inside a sheet or a compact pane `--shape-card-compact`                                                                                              | 22, 18 px                                         |
| Stat tile           | `--shape-stat-tile`                                                                                                                                                  | 20 px                                             |
| Well and control    | `--shape-well`, `--shape-control`, then `--shape-control-sm`, `--shape-switch`                                                                                       | 16, 16, 14, 15 px                                 |
| Segment, focus ring | `--shape-segment` (a segmented control's option, a nested row), `--shape-focus`                                                                                      | 12, 8 px                                          |
| Icon square         | `--shape-icon-xl`, `-lg`, `-md`, then `--shape-icon`, `--shape-icon-sm`                                                                                              | 13, 12, 11, 10, 9 px                              |
| Bar and track ends  | `--shape-track-lg`, `-md`, `--shape-track`, `--shape-bar`, `-sm`, `-xs`                                                                                              | 6, 5, 4, 3, 2, 1 px                               |
| Inline code         | `--shape-code`                                                                                                                                                       | 6 px                                              |
| Pill                | `--shape-pill`                                                                                                                                                       | 999 px                                            |
| Easing              | `--motion-standard` (every press and entrance), `--motion-spring` (the switch knob), `--motion-sheet-spring`, `--motion-pop`, `--motion-overshoot` (the dial's knob) | `cubic-bezier(0.2, 0.8, 0.2, 1)` and four springs |
| Duration            | `--motion-press-ms`, `--motion-pane-ms`, `--motion-sheet-ms`, `--motion-sheet-spring-ms`, `--motion-pop-ms`, `--motion-switch-ms`                                    | 180, 280, 320, 460, 300, 220 ms                   |

- Durations that had no easing of their own are tokens too: `--motion-fade` and `--motion-fade-ms` (ease, 200 ms) are the cross-fade of a colour, a shadow and a
  state. A press is `--press-scale` (0.96, a key or cell 0.97, a tile 0.98, an icon 0.86), what floats is `--elevation-1` (the switch's knob), `-2` (a menu) and
  `-3` (the toast), and the keyboard focus ring is `--focus-color`, `--focus-width`, `--focus-offset`.
- The Material design (ADR 0037, #463) redefines these same tokens in `tokens.css` under `.app[data-design='material']`, on its own scale (`--shape-extra-small`
  4 ... `--shape-extra-large` 28, `--shape-full`, which only that block declares: a rule reads the role, never the scale). A card is 28 and flat, a stat tile 16,
  a well 12 and a control 16, a chip, a segment and the focus ring 8, a switch, a nav item and a pill full. `--shape-pill-pressed` is what a pill becomes under a
  finger (16), and the springs are `linear()` easings sampled from Material's motion scheme, with their settle time as the duration (spatial 347 / 411 / 567 ms,
  effects 137 / 211 / 299 ms). A press scales nothing (`--press-scale: 1`): `common.css` lays a state layer on every button (the content colour at 8% under a
  mouse, 10% under the keyboard or a finger, `border-radius: inherit`), morphs a pressed pill's corners, and under Reduce Motion turns every transition into the
  effects-fast fade. Cards and stat tiles lose their edge (`--shadow`, `--ctl-edge`, `--m-edge` are `none`); only the knob, the toast, All off and a dialog float.
- Under Material the segmented control (`hp-seg`, 48 px) and the range tabs (`hp-range-tabs`, 40 px) are the connected button group (#465): no container, buttons joined by
  2 px, the outer ends `--shape-pill`, the inner corners `--shape-group-inner` (8; 12 in Apple, where the rule is unused), the chosen one `primary` and a full pill
  (`--shape-segment-selected`), its corners on the spatial-fast spring. The rules sit in `seg.css` and `range.css` under `.app[data-design='material']`.
- The ApexCharts bars' radii (`src/features/car/history.ts`) are JavaScript, not CSS, and are the same in both designs.
- A radius that is the shape of the element's box (a circle is `50%`, a square corner `0`, a child that follows its parent
  `inherit`) stays as it is: it is geometry, not design.
- A new rule picks the token for what the element is, never one that merely has the right number; a role with no token yet gets a
  new one in `tokens.css`, with the test as the guard.

## Telling the person what a tap does

- Say it with the surface and the `›`, not with words. No "Tap to …" lines: a scene that has never run says "Never run", not
  "Tap to run"; the Now playing card has no footer.
- A toggle shows its state on the control (tint and its On/Off line), never only in the label.
- A value the person cannot change right now (a read-only segmented control, an unavailable device) mutes its unchosen options.

## Status is text with a dot

A filled capsule means "tap me" in this panel (the live pill), so a fact never wears one. **A status is text with
a small coloured dot, never a filled capsule.** The kit's `.status` (`src/ui/styles/status.css`) is plain text with an `<i
aria-hidden>` dot before it; the dot's tone is `.ok`, `.warn` (its word in the warning text colour) or `.bad`, and the word always
stays, so the tone is never carried by colour alone. **`.ok` is good news only** (charging, locked, a good rating): what is merely happening, such as "Motion now" on Home and Security (`src/features/security/sensor-status.ts`), takes no tone and keeps the neutral dot, since green would say it is fine and blue (the tint) would say it can be tapped. It has no fill, so the card's glass shows through. The Car's facts, the
Automations' dates and runs, Air's ratings, Home's people, Climate's and Energy's states and the header's peak chip use it. Why: HIG, Buttons (a button's style says it can be tapped) and
Color (never colour alone). Nothing forbids a capsule mechanically yet: the e2e specs find the `.status` text (`air.spec.ts`,
`automations.spec.ts`), and `test/e2e/a11y.spec.ts` holds its 4.5:1 contrast with no rule switched off (`DISABLED_RULES` is empty).

## One range per tab

A pane with a history has **one range control, at the top** (`<hp-range-tabs>`, `src/ui/range-tabs.ts`; the ranges are `RANGES` in
`src/ui/ranges.ts`, with Energy's own Now and Today). Every card below it follows it, or names its own fixed period in its title
or its line ("Today, hour by hour", "Today so far", "30 days"); a card never carries a second range control, and a tile that
sets the range does it by setting the tab's. A sheet that opens over a pane for one reading's history (Weather's
and Air's tiles, a sensor) is its own place and has its own one control, at its top. Why: HIG, Segmented controls: one control
chooses one thing, so the page cannot say Week while a card says Today. Enforced by `test/e2e/energy.spec.ts` (one
`hp-range-tabs` under the header) and the unit tests of the ranges (`test/unit/ui/ranges.test.ts`).

## One formatter per kind of quantity

**Every quantity of a kind is written by one rule, so the same value never reads two ways.** A battery charge is a whole percent
(`percent`), a measured temperature is to a tenth (`temperatureFigure`, `temperature`) and a forecast's is whole (`forecastFigure`,
`forecastTemperature`), a power is two significant figures with one unit per magnitude (`powerParts`, `power`: `850 W`, `3.2 kW`,
`12 kW`), and money is whole dollars in a headline and cents in a table (`money`). They are in `src/core/i18n/format.ts` and each has two forms: the
**figure** alone, for a catalog message that carries its own sign (French spaces `%` and puts `$` after the number), and the **joined**
form with its unit, which the formatter writes once. A feature never writes `toFixed`, `Math.round` or a `°` of its own for these.

**A missing value is "No reading", without its unit.** The figure forms give `null` for `null`, and `reading()` (`src/ui/reading.ts`)
turns it into the kit's word (`common.noReading`) flagged `missing`, so no tile shows "–%" or "– kWh"; `bareReading()` is the same for a
figure that carries its unit in its text. Why: HIG, Typography and Writing: one number is formatted one way, and a missing one is said in
plain language, not with a placeholder. Enforced by `test/unit/format.test.ts` and `test/unit/ui/figure-cell.test.ts`.

## One control per device

**A device gets the same control on every screen size**; the layout changes, not the control. The TV is its power button
(`<hp-tv-power>`, `src/features/media/tv-power.ts`) in the iPad's box and in the phone's tile, and a speaker's volume is the slider with
its − and + (`<hp-volume-control>`, `src/features/media/volume-control.ts`) in the pod and in the tile. Each is its own element that
both layouts compose, so the two can never drift; a feature that needs a device on a second screen reuses the element and does not
draw a second one (a switch on the phone and a button on the iPad). A play-or-pause button shows the one it does, and a toast names what the
card names (the room). Why: HIG, Toggles and Sliders: one thing is one control, wherever it is drawn. Enforced by
`test/e2e/media.spec.ts` on the tablet and phone projects.

## A sheet drawn in a tab is a region

**Only a sheet over the page is a dialog.** `<hp-sheet>` (`src/ui/sheet.ts`) takes `inline` when a tablet draws it as a tab's own panel:
then it has no backdrop, no `aria-modal` and no swipe, and its role is `region` with the same label, so VoiceOver says "Car, region" and
not "Car, dialog" on a tab. The phone's sheet and a sheet that opens over a pane stay dialogs. The detail elements that a tablet shows
inline in its pane (`<hp-car-detail>`, `<hp-energy-detail>`, `<hp-air-detail>`, `<hp-weather-detail>`) give their panel the same
`region` role when they draw it themselves, and `dialog` only when a sheet over the page does. A new tab's panel is one or the other,
never a dialog on a tab. Why: HIG, Accessibility: a role says what an element is. Enforced by `test/e2e/sheets.spec.ts` and `test/e2e/car.spec.ts` (the region by
name) and the axe scan in `test/e2e/a11y.spec.ts`.

## One figure, one source

**A figure carries the value of the source its label names, and a disagreement between sources is said once.** Energy's "Today so far" is
the Hilo meter's reading; the uses under it (the donut, the bars, the busiest hour) are the devices' own, and when the devices add up to
more than the meter, the card says so once ("Devices report more than the meter today", `energy.donut.overMeter`) rather than showing two
totals that contradict each other. The sun is one reading for every tab (`sunToday`, `sunNext` in `src/providers/sun.ts`), so Home,
Lights and Weather give the same sunrise and sunset.

## The header

- The header's controls are the live pill and the round gear (Settings). A reading (the weather) is plain text beside them, so it
  never looks like one of them, and the people under the greeting are status text (see "Status is text"), not buttons; so is the peak chip ("Critical peak now"), text with a warning dot.
- The date is written once, under the greeting; a pane's sub-line does not repeat it.
- **The header never moves between tabs.** On a tablet the clock stays top right and the controls keep their place on every tab, whatever the title beside them; Home's greeting is its one title, so Home draws no pane header under it. Enforced by `test/e2e/header.spec.ts` ("the header's place", at the tablet's two widths and in both languages).

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
- Under the Material design (ADR 0037) the panel is set in Roboto Flex, one variable file per subset in `dist/fonts/` too, with
  Material 3's type roles: `tokens.css` holds them as `--type-<role>` and `--track-<role>` on `.app[data-design='material']`, and an
  element draws a role in its Material rule (`font: var(--type-title-small)`). Sentence case, and every size times `--tx`, as in Apple.
- The design system copies no platform vendor's assets: the icons are the panel's own, and no font, control or setting name is
  taken from Apple.
