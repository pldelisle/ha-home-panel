# Design rules

The rules every pane follows, so that what can be tapped looks tappable and nothing else does. They sit under the glass look
(`src/css/glass.css`) and hold with glass off too. The tokens are in `src/ui/styles/tokens.css`; the published design system
mirrors them.

## Two layers

Apple's rule (HIG, Materials): "Don't use Liquid Glass in the content layer." Liquid Glass is the **navigation layer** only: the
rail and the phone's tab bar, the header's round buttons and capsules (the live pill, the peak chip, Settings), popovers, toasts,
dialogs (`<hp-dialog>`, ADR 0035: a question over the page, in the top layer) and a sheet's frame and its close button.
Everything a pane shows is the **content layer**, and stays opaque with glass on: the
wallpaper shows faintly through a card's near-opaque fill and plain blur, never through its wells or controls. The glass tokens of
the navigation layer are `--g-fill`, `--g-dense`, `--g-edge`, `--g-bd` (with the Chromium lens), `--nav-sel-bg` and
`--g-nav-rim-s`; the content layer's are `--g-card`, `--g-tile`, `--m-bd` and `--m-edge` (`src/css/glass.css`). The glass
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

- A control is never drawn as a well, and a well never gets a rim, a shadow or a pointer. If a tile opens something, it is a
  control (`.tile.tilebtn`); if it does not, it is a well (`.tile`).
- A whole card is tappable only when the whole card goes to one place (the Home tiles, the scene tiles, a light cell). It then
  shows the `›` square in its top-right corner. A card with controls inside it is not itself tappable; if it also leads
  somewhere, its header row carries the `›` (the Security card).
- Nested shapes take the smaller radius: card 22, then wells and controls 16, then icon squares 10–12.
- A request for reduced transparency (`prefers-reduced-transparency: reduce`) makes the navigation layer solid too, and drops the
  cards' blur.

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
