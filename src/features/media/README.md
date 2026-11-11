# Media

What the Media tab computes and draws ([spec 16](../../../docs/specs/16-media.md)). This folder holds the pure half, the rules that find the television and the speakers, the model every Media element draws, the scenes row and the commands, pinned in Vitest against the test house, and the pane: `<hp-media-pane>` with `<hp-tv-box>` and one `<hp-speaker-pod>` per speaker on a tablet, and one `<hp-media-tile>` per player on a phone, whose tap opens the card in a sheet; and the Home tab's scenes row, `<hp-scene-tiles>`, which the guest places by its tag (ADR 0024). The hidden Home TV card was deleted, not moved (#219).

## The folder

```
src/providers/
  tv-source.ts             TvSource (the port), TvInputs, visibleTvs, readSet and the wake-button rule the adapters share
  tv-entity.ts             any media_player with device_class 'tv': the generic adapter
  samsung-tv.ts            the Samsung platform: preferred when both exist
src/features/media/
  README.md
  index.ts                 mediaFeature: the registry's descriptor, the pane's template and the More sheet's line (mediaBrief)
  ids.ts                   mediaIds(store): the TV, its wake button, the speakers, the scenes and the modes
  inputs.ts                TV_SOURCES, findTv, readMedia(states, registries, names, sources): MediaInputs
  speakers.ts              speakers(states, registries, names, tvId): Speaker[] (generic rules, pure)
  model.ts                 mediaModel(inputs, {t, names, overlay}): MediaViewModel (summary, tv, speakers, speakersLine, tiles, labels); mediaBrief
  scenes.ts                sceneTiles(states, registries, config, overlay, deps): SceneTileView[]; sceneIcon
  commands.ts              tvPower, tvVolume, tvMute, tvPlayPause, speakerPlayPause, speakerSkip, speakerVolume, runScene, setMode; K, SCENE_RAN_MS, volumeLevel
  sheets.ts                CONTROLS_SHEET ('media.controls'), the sheet a phone's tile asks for, and controlsKeyOf, the reader of its detail
  media-pane.ts            <hp-media-pane>: the header; the two cards on a tablet, the tiles and the sheet on a phone; media-pane.element.css
  media-tile.ts            <hp-media-tile>: a player on the phone, its switch or play button; media-tile.element.css
  tv-box.ts                <hp-tv-box>: the name, status and switch, the screen and the four buttons; tv-box.element.css
  speaker-pod.ts           <hp-speaker-pod>: the cover, the track, the volume stepper and play; speaker-pod.element.css
  scene-tiles.ts           <hp-scene-tiles>: the Home scenes row, placed by the guest through the Home-card bridge; scene-tiles.element.css
src/core/
  registry.ts              areaOf and isHidden: the registry rules the store, the providers and the features share
  timing.ts                debounce(fn, ms, timers?): the volume's 450 ms, with injected timers and a cancel
  i18n/format.ts           fmt.ago(instant, now): a scene's last run as a kind and a count (now, minutes, hours) or a date, which `media.last` words
```

## The providers

Two TV sources sit behind one port, `TvSource`:

| Source       | File                          | Candidates                                                                     | Names the set                                                                           |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `samsung-tv` | `src/providers/samsung-tv.ts` | the visible players of the `samsungtv` platform that say they are a television | the device's own name; else null, and `defaultName` is `media.samsungTv` (`Samsung TV`) |
| `tv-entity`  | `src/providers/tv-entity.ts`  | every visible player with `device_class` `tv`                                  | the device's, else the entity's name; else null, and `defaultName` is `media.tv`        |

Both read the set's state, input, volume flag and area the same way, and the wake-on-LAN `button.*` whose name mentions a TV, whichever set was chosen. No adapter calls the catalog: a name is `tv.name ?? t(tv.defaultName)`, and the model does that.

`findTv(states, registries, names, sources = TV_SOURCES)` asks the sources in list order and reads the first candidate of the first source that has one, so **a Samsung set is preferred over a generic one** whatever order the house lists them in, and a house with none gives `null`. A hidden player is never a candidate. A house adds a source with one file and one line in `TV_SOURCES` (in `inputs.ts`, as the weather sources are in theirs); nothing else changes.

## The speakers

`speakers(states, registries, names, tvId)` is generic, so it lives here and not in a provider: every visible `media_player.*` that is not the television, not on the `unifiprotect` or `samsungtv` platforms (a camera's speaker and a television have their own controls), and that sits in an area. Its name drops the words of its area's name, as Home Assistant gives it and as the panel shows it (`HomePod mini Kitchen` in the Kitchen is `HomePod mini`); a name that would be emptied is kept whole. **The order is the house's insertion order**: the baselines depend on it, so nothing sorts.

`readMedia` composes the two and reads each speaker's state beside it; `mediaIds` lists every id the pane and the scenes row read, so a light changing never reaches them.

## The model

`mediaModel(inputs, {t, names, overlay})` returns the strings and flags every Media element draws, and nothing else: `summary` (the pane's sub-line), `tv` (the box: its name, state, `status` and the pane's `statusLine`, the switch and the four controls), `speakers` (the pods), `speakersLine`, `tiles` (the phone's) and `labels` (the words around the cards). The **television's box, its sheet and the tile read one state**: a held `on` or `mute`, a speaker's held `state` or `volume`, comes in through `deps.overlay`, the narrowest type that the panel's `OverlayStore` and each element's `OptimisticController` both satisfy, so the model never knows which. Every word is a catalog key said through `deps.t`; the `supported_features` bits it reads are named constants after Home Assistant's `MediaPlayerEntityFeature`.

Two rules copy the legacy panel on purpose: the **summary** and the **speakers line** count what Home Assistant reports, not what a tap holds (the pod flips at once, the line follows the player), and a speaker count that follows a television part is its own message (`media.summaryPlaying`), because the French rewrite layer words a count alone (`2 haut-parleurs en lecture`) and a count after another part (`2 speakers : en lecture`) differently, and the catalog says what the pane showed.

## The scenes and the commands

`sceneTiles` lists the visible scenes in the config's order, then alphabetically, then the config's modes that exist. A scene says "Done" while the overlay holds `K.ran(id)` (four seconds, `SCENE_RAN_MS`), else "Last {ago}" when its state is a date, else "Tap to run"; a mode says On or Off.

Each command is a pure function returning the kit's `Command`: the service, the optimistic keys it holds (`K`, one typed function per key) and the toast it says on success. The element holds the value the key names and runs the command; nothing here sends. `tvPower(tv, true)` carries the wake-on-LAN button as `fallback` when the house has one, whichever set was chosen, as the legacy `tv()` does.

`sceneIcon` and the scenes' order are copies of rules `src/home-panel.js` still holds, uncalled since #219; #220 (the last Media move) deletes them there.

## The elements

`<hp-media-pane>` runs `mediaModel` in `willUpdate` with its `OptimisticController`'s `read` as the overlay, so a value a child holds draws the pane again at once, and hands each child its view: `tv` to the box, `speaker` to each pod, keyed by id. Its store controller listens to `mediaIds` alone and is paused while the tab is hidden; a thermostat change draws nothing in the pane, the box or a pod (`media.spec.ts` proves it with a tripwire a redraw would show). On a phone it draws a `<hp-media-tile>` per player, keyed by `key`, or the hint when the house has none, and the sheet a tile opens: the tile dispatches `SheetRequestEvent('media.controls', {key})`, the descriptor binds the open tile's key to the pane's `controlsKey`, and the pane draws the television's card or the speakers' card in `<hp-sheet>` while it is open, so the sheet host's Escape and focus return apply. The sheet opens only from the Media tab, so the descriptor lists no `overSheets`: the first caller that opens it over another tab adds the id there and a branch that draws the sheet alone while the pane is behind, as Weather's detail does.

`<hp-tv-box>`, `<hp-speaker-pod>` and `<hp-media-tile>` act: a tap holds the value it asks for in the panel's `OverlayStore` (`K.on`, `K.mute`, `K.state`, `K.volume`) and runs the command through their own `CommandRunner`, which releases only that hold and says why in a sticky toast when Home Assistant refuses, after the wake-on-LAN button's try when the house has one. The pod's stepper holds the model's `volume.down` or `volume.up` at each tap and sends one `volume_set` when the taps stop for 450 ms (`debounce`); a send still waiting when the pod leaves the document is cancelled in `disconnectedCallback` and its level released. Each pod waits on its own, where the legacy `volT` was one timer for the panel, so a tap on one speaker no longer drops another's pending level. The television's holds last the legacy `tvCmd`'s fifteen seconds (`TV_HOLD_MS`). A tile's switch or play button keeps its tap to itself, so the tile does not open its sheet as well.

`<hp-scene-tiles>` is the Home tab's scenes row, the Home-card bridge's one use (ADR 0024): `build()` writes its tag into `#hscenes` once per draw, and nothing else. It runs `sceneTiles` in `willUpdate` with its `OptimisticController`'s `read` and a clock it reads there; a scene's tap holds `K.ran` for `SCENE_RAN_MS` and runs `runScene`, a mode's holds `K.on` and runs `setMode`, and a failure releases that hold alone. Its host is `display: contents`, so each tile is an item of the guest's `.hscenes` grid; it says `hp-empty` when it has nothing, and the guest hides the row as `renderScenes` did. It listens to `mediaIds` and draws again each minute while connected, so a "Last 5 min ago" line keeps time where the legacy panel redrew the row at every change of the house.

Each element's rules are its own `<element>.element.css`, under selectors of their own (`.mcard`, `.tvhead`, `.tvscreen`, `.tvkeys`, `.player`, `.vol`, `.play`, `.scenetile`), because one selector is written in one file. The legacy `.mtvhead`, `.mtvscreen`, `.mtvctl`, `.pods`, `.pod` and `.mtiles` rules they came from were deleted with the phone's card sheet (#218); `.card`, `.hint` and the card sheet's `#cardhost > .card` stay in the legacy sheet for the other panes and the water and Hilo tiles (#239 moves them; no gate deletes the card sheet's rule yet), and `.stepper` for the climate and Air controls; the last `.pp` rules went with #218 too. The scenes row's `.ptile`, `.ptile.scene` and `.hscenes .ptile` rules stay in the legacy sheet, drawn by nothing since #219, until #220 deletes them; the hidden card's `.tvbox` and `.tvctl` went with #219. The tile draws the kit's `.stile` rules (`src/ui/styles/stat-tile.css`), its play button's press included.
