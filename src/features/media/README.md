# Media

What the Media tab will compute and draw ([spec 16](../../../docs/specs/16-media.md)). This folder holds the pure half so far: the rules that find the television and the speakers, pinned in Vitest against the test house before the code that draws them moves. The legacy panel still draws Media; the pane, the commands and the Home cards arrive with the next tickets.

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
src/core/
  registry.ts              areaOf and isHidden: the registry rules the store, the providers and the features share
  timing.ts                debounce(fn, ms, timers?): the volume's 450 ms, with injected timers and a cancel
```

The model, the commands, the pane, the cards and the scenes are listed in spec 16 and land with the tickets that build them.

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
