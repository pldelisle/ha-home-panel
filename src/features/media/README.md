# Media

What the Media tab will compute and draw ([spec 16](../../../docs/specs/16-media.md)). This folder holds the pure half: the rules that find the television and the speakers, the model every Media element will draw, the scenes row and the commands, pinned in Vitest against the test house before the code that draws them moves. The legacy panel still draws Media; no element reads the model yet, and the pane and the Home cards arrive with the next tickets.

## The folder

```
src/providers/
  tv-source.ts             TvSource (the port), TvInputs, visibleTvs, readSet and the wake-button rule the adapters share
  tv-entity.ts             any media_player with device_class 'tv': the generic adapter
  samsung-tv.ts            the Samsung platform: preferred when both exist
src/features/media/
  README.md
  ids.ts                   mediaIds(store): the TV, its wake button, the speakers, the scenes and the modes
  inputs.ts                TV_SOURCES, findTv, readMedia(states, registries, names, sources): MediaInputs
  speakers.ts              speakers(states, registries, names, tvId): Speaker[] (generic rules, pure)
  model.ts                 mediaModel(inputs, {t, names, overlay}): MediaViewModel (summary, tv, speakers, speakersLine, tiles, labels)
  scenes.ts                sceneTiles(states, registries, config, overlay, deps): SceneTileView[]; sceneIcon
  commands.ts              tvPower, tvVolume, tvMute, tvPlayPause, speakerPlayPause, speakerSkip, speakerVolume, runScene, setMode; K, SCENE_RAN_MS
src/core/
  registry.ts              areaOf and isHidden: the registry rules the store, the providers and the features share
  timing.ts                debounce(fn, ms, timers?): the volume's 450 ms, with injected timers and a cancel
  i18n/format.ts           fmt.ago(instant, now): a scene's last run as a kind and a count (now, minutes, hours) or a date, which `media.last` words
```

The pane, the tiles, the sheet and the Home cards (`<hp-media-pane>` and the elements it places) are listed in spec 16 and land with the tickets that build them.

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

`readMedia` composes the two and reads each speaker's state beside it; `mediaIds` lists every id the pane and the cards will read, so a light changing never reaches them.

## The model

`mediaModel(inputs, {t, names, overlay})` returns the strings and flags every Media element draws, and nothing else: `summary` (the pane's sub-line), `tv` (the box: its name, state, `status` for the Home card and `statusLine` for the pane, the switch and the four controls), `speakers` (the pods), `speakersLine`, `tiles` (the phone's) and `labels` (the words around the cards). The **television, the card and the tile read one state**: a held `on` or `mute`, a speaker's held `state` or `volume`, comes in through `deps.overlay`, the narrowest type that the panel's `OverlayStore` and each element's `OptimisticController` both satisfy, so the model never knows which. Every word is a catalog key said through `deps.t`; the `supported_features` bits it reads are named constants after Home Assistant's `MediaPlayerEntityFeature`.

Two rules copy the legacy panel on purpose: the **summary** and the **speakers line** count what Home Assistant reports, not what a tap holds (the pod flips at once, the line follows the player), and a speaker count that follows a television part is its own message (`media.summaryPlaying`), because the French rewrite layer words a count alone (`2 haut-parleurs en lecture`) and a count after another part (`2 speakers : en lecture`) differently, and the catalog says what the pane showed.

## The scenes and the commands

`sceneTiles` lists the visible scenes in the config's order, then alphabetically, then the config's modes that exist. A scene says "Done" while the overlay holds `K.ran(id)` (four seconds, `SCENE_RAN_MS`), else "Last {ago}" when its state is a date, else "Tap to run"; a mode says On or Off.

Each command is a pure function returning the kit's `Command`: the service, the optimistic keys it holds (`K`, one typed function per key) and the toast it says on success. The element holds the value the key names and runs the command; nothing here sends. `tvPower(tv, true)` carries the wake-on-LAN button as `fallback` when the house has one, whichever set was chosen, as the legacy `tv()` does.

`sceneIcon` and the other rules copied from `src/home-panel.js` (the television's power path, the scenes' order, the line words) stay in the legacy panel too, because it still draws Media; #220 (the last Media move) deletes the legacy copies.
