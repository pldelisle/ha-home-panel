# Media

What the Media tab will compute and draw ([spec 16](../../../docs/specs/16-media.md)). This folder holds the pure half so far: the rules that find the television and the speakers, pinned in Vitest against the test house before the code that draws them moves. The legacy panel still draws Media; the pane, the commands and the Home cards arrive with the next tickets.

## The folder

```
src/providers/
  tv-source.ts             TV_SOURCES and findTv; re-exports the port (TvSource, TvInputs, TvNaming)
  tv-entity.ts             any media_player with device_class 'tv': the generic adapter
  samsung-tv.ts            the Samsung platform: preferred when both exist; finds the wake-on-LAN button
  tv-port.ts               the port's types and what the two adapters read the same way (the visible televisions, a set's area, name, state, input)
src/features/media/
  README.md
  ids.ts                   mediaIds(store): the TV, its wake button, the speakers, the scenes and the modes
  inputs.ts                readMedia(states, registries, naming, sources): MediaInputs
  speakers.ts              speakers(states, registries, names, tvId): Speaker[] (generic rules, pure)
src/core/
  timing.ts                debounce(fn, ms, timers?): the volume's 450 ms, with injected timers
```

The model, the commands, the pane, the cards and the scenes are listed in spec 16 and land with the tickets that build them.

## The providers

Two TV sources sit behind one port, `TvSource`:

| Source       | File                          | Candidates                                                                     | Reads                                                                                                                                                   |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `samsung-tv` | `src/providers/samsung-tv.ts` | the visible players of the `samsungtv` platform that say they are a television | its name (the device's own, else the catalog's `Samsung TV`), its state, input and volume flag, and the wake-on-LAN `button.*` whose name mentions a TV |
| `tv-entity`  | `src/providers/tv-entity.ts`  | every visible player with `device_class` `tv`                                  | the same, named `TV` when Home Assistant has no name; no wake button                                                                                    |

`findTv(states, registries, naming, sources = TV_SOURCES)` asks the sources in list order and reads the first candidate of the first source that has one, so **a Samsung set is preferred over a generic one** whatever order the house lists them in, and a house with none gives `null`. A hidden player is never a candidate. A house adds a source with one file and one line in `TV_SOURCES`; nothing else changes.

## The speakers

`speakers(states, registries, names, tvId)` is generic, so it lives here and not in a provider: every visible `media_player.*` that is not the television, not on the `unifiprotect` or `samsungtv` platforms (a camera's speaker and a television have their own controls), and that sits in an area. Its name drops the words of its area's name, as Home Assistant gives it and as the panel shows it (`HomePod mini Kitchen` in the Kitchen is `HomePod mini`); a name that would be emptied is kept whole. **The order is the house's insertion order**: the baselines depend on it, so nothing sorts.

`readMedia` composes the two and reads each speaker's state beside it; `mediaIds` lists every id the pane and the cards will read, so a light changing never reaches them.
