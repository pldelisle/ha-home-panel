# Design rules

The rules every pane follows, so that what can be tapped looks tappable and nothing else does. They sit under the glass look
(`src/css/glass.css`) and hold with glass off too. The tokens are in `src/ui/styles/tokens.css`; the published design system
mirrors them.

## Three surfaces

| Surface | What it is                                             | Look                                                                             | Radius           |
| ------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------- |
| Card    | holds one subject's content                            | `--card` and `--shadow`; glass: `--g-card`, the backdrop blur and `--g-edge`     | 22 px            |
| Well    | shows a value or a state, and does nothing when tapped | `--card2`; glass: `--g-tile`, no rim                                             | 16 px            |
| Control | anything a tap acts on inside a card                   | `--ctl-bg` and `--ctl-edge`: raised above the wells (glass: `--g-sel` and a rim) | 16 px, pills 999 |

- A control is never drawn as a well, and a well never gets a rim, a shadow or a pointer. If a tile opens something, it is a
  control (`.tile.tilebtn`); if it does not, it is a well (`.tile`).
- A whole card is tappable only when the whole card goes to one place (the Home tiles, the scene tiles, a light cell). It then
  shows the `›` square in its top-right corner. A card with controls inside it is not itself tappable; if it also leads
  somewhere, its header row carries the `›` (the Security card).
- Nested shapes take the smaller radius: card 22, then wells and controls 16, then icon squares 10–12.
- A request for reduced transparency (`prefers-reduced-transparency: reduce`) makes every glass surface solid again: cards `--card`, wells `--card2`, controls `--card` with `--shadow`.

## Telling the person what a tap does

- Say it with the surface and the `›`, not with words. No "Tap to …" lines: a scene that has never run says "Never run", not
  "Tap to run"; the Now playing card has no footer.
- A toggle shows its state on the control (tint and its On/Off line), never only in the label.
- A value the person cannot change right now (a read-only segmented control, an unavailable device) mutes its unchosen options.

## The header

- The capsules in the header are controls: the live pill and Settings. A reading (the weather) is plain text beside them, so it
  never looks like one of them. The people chips under the greeting are small state tags, not buttons.
- The date is written once, under the greeting; a pane's sub-line does not repeat it.

## Type

- Manrope for every word and figure (400–700), JetBrains Mono for code (the config card's paths). Both ship in `dist/fonts/`
  (`src/fonts.js`); nothing is fetched from Google.
- The design system copies no platform vendor's assets: the icons are the panel's own, and no font, control or setting name is
  taken from Apple.
