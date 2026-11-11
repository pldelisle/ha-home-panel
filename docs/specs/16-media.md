# Spec 16: Media, the second move: the TV and the speakers, the first commands from an element, and the Home-card bridge

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (the recipe, `<hp-pane-header>`, `<hp-stat-tile>`, the kit's sheets, the French equivalence test). Blocks: 17 Security and every later move that sends a service call or holds an optimistic state, and 24 Home, which composes the cards this spec exports.
Ships as: two pull requests, each a patch release, each pixel-identical. ADR 0023 landed with #215, the kit's command layer (`CommandRunner`, the shared optimistic store, `<hp-switch>`, the harness's `failNext`), which ships ahead of the two pull requests; ADR 0024 landed with the second's first half, #219 (they were numbered 0021 and 0022 when this spec was written; the sheet host and `<hp-chart>` took those numbers). Amended with #219 (2026-11-11): the hidden Home TV card is deleted, not moved, and the bridge has one use, the scenes row.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Media is the second feature with little shared state, and it is the first that **acts**: every other method the class has moved so far reads the house; Media turns the TV on, mutes it, steps a speaker's volume, plays and pauses, runs a scene. Doing that the class grew three mechanisms that every later feature also uses, none of them tested:

- **The command.** `call(domain, service, data, done)` (~2455) sends through the API client, toasts `done` on success and a sticky "Didn't work" on failure, then empties every pending state and redraws the car's controls, whatever the command was.
- **The optimistic overlay.** `pending[key] = {v, until}` and `pend(key, cur)` (~7583) hold what the person asked for up to twenty seconds, until Home Assistant reports it, so a switch flips at the tap and not at the round trip; `tvCmd`, `phoneCmd`, `mpVol`, `runScene`, the climate controls, the car controls and the lights all write into one bag with string keys (`id + ':on'`, `id + ':vol'`, `id + ':st'`, `id + ':mute'`), and `call`'s failure path throws the whole bag away.
- **The debounce.** `mpVol` (~4965) clamps the volume, holds it as pending, and sends `volume_set` 450 milliseconds after the last tap.

Around them, Media itself is nine methods, three containers and one Home row: `tv()` (which `media_player` is the television: `device_class` `tv`, the Samsung TV platform preferred, a `button.wake_on_lan_*` found by name for a set that is off the network), `speakers()` (every other `media_player` in an area, minus the UniFi Protect and Samsung platforms, named without the words of its area), `renderMedia` (the pane: the TV box with big buttons on the left, one wide player per speaker on the right with a volume stepper and a play button), `renderMediaTiles` (the phone: one `.stile.home` per device with an embedded power switch or play button), `renderTV` and `tvBox` (the Home card), `tvCmd`, `phoneCmd` (a dispatcher that also serves the purifier fans, the outlets, the Wallbox switch and the routine modes), `sceneTiles` and `renderScenes` and `runScene` (the scenes and modes row at the bottom of the Home pane, `#hscenes`, with a four-second "Done" state), the Media line of `renderPaneSubs` (~5901), and the rules of eleven CSS selectors in four files. The French map holds about twenty-five of its strings.

Two of those pieces are drawn on the **Home** pane (`#tv`, `#hscenes`), which stays the class's until spec 24. Weather side-stepped the same problem by leaving `#hwx` in the class. Media cannot: the TV box on Home and the TV box in the pane are one `tvBox` with one optimistic state, and the scenes exist only on Home. A rule is needed for a feature's card to live inside markup the guest still writes. As built (#219), `#tv` was never on screen: it sits in `.cols`, which `setView()` has hidden for good since Tabs became the only view (1.16.0), and nothing moves it into a pane, so the card is deleted, not moved, and the scenes row is the rule's one use.

## Solution

Move Media into `src/features/media/`, in two pull requests:

1. **The pane, and the kit's command layer.** `<hp-media-pane>` draws the pane header, the TV box and the speaker pods on the tablet and the device tiles on the phone, from `mediaModel`. The TV's integration-specific rules (which player is the TV, the Samsung platform, the wake-on-LAN button) sit in two providers behind `TvSource`; the speakers' rules are generic and sit in the feature. The commands go through `CommandRunner` in the kit, the optimistic state through the panel's `OverlayStore` and each element's `OptimisticController`, both reusable by every later control; `<hp-switch>` joins the kit with the TV's power switch as its first user. The class loses `renderMedia`, `renderMediaTiles`, `tvCmd`, `mpVol` and the media branches of `phoneCmd`.
2. **The scenes, the hidden TV card, and the deletion** (#219, then #220). `<hp-scene-tiles>` is the feature's Home contribution; the guest **places it by tag** inside `#hscenes`, the one use of the bridge rule of ADR 0024 (the guest writes a feature element's tag and nothing else; the element gets everything from context). The hidden Home TV card (`#tv`, `renderTV`, `tvBox`) is deleted, not moved (#219). `tv()`, `speakers()`, `renderTV`, `tvBox`, `sceneTiles`, `renderScenes`, `runScene`, the Media line of `renderPaneSubs`, the containers' inner markup, the CSS rules and the French entries are deleted; `pend`, `pending` and `call` stay in the class for the controls that have not moved, and shrink with each move.

Each pull request leaves every baseline identical (`media-tablet-*`, `bare-media-tablet-light-en`, the `home-*` eight, the phone's Media tab under More and the sheets its tiles open: `media-tiles-phone-{light,dark}-en`, `media-tiles-phone-light-fr`, `media-sheet-{tv,speakers}-phone-light-en`, recorded from the legacy panel before #218 moved them) and the French pane reads the same text from the catalog.

## User Stories

1. As a household member, I want the Media tab, its phone tiles and the scenes row to look and work exactly as before, so that the move is invisible.
2. As a household member, I want a tap on the TV's power switch, a speaker's play button or a scene tile to show its effect at once and to settle to what Home Assistant reports, as today, so that the panel feels like a switch and not like a web page.
3. As a household member, I want five quick taps on a speaker's volume to send one `volume_set` with the final level, as today, so that the speaker does not stutter.
4. As a household member, I want a failed command to tell me so and to undo its optimistic state, without touching the other controls, so that a dead TV does not reset my thermostat's pending setpoint.
5. As a household member, I want the TV to turn on through its wake-on-LAN button when the player is off the network, as today, so that the Samsung set wakes from standby.
6. Withdrawn (#219): the Home card's TV box was never on screen in the Tabs view, so there is no second box to agree with the pane's; the card is deleted.
7. As a French-speaking user, I want every Media string in French from the first paint, so that the catalog is as good as the rewrite layer was.
8. As an adopter with an LG or Android TV and no wake-on-LAN button, I want the TV found by `device_class` and turned on with `media_player.turn_on`, so that the panel fits my house.
9. As a maintainer, I want one command runner (send, toast on success, sticky toast on failure, undo the command's own optimistic keys) used by every feature, so that a fix to the failure path is one fix.
10. As a maintainer, I want the optimistic overlay to be one typed store per panel with a per-key time-to-live and a controller per element, tested in Vitest without the DOM, so that "held until Home Assistant agrees" is a rule in one place.
11. As a maintainer, I want the TV and speaker rules (which player, which name, which features) in pure functions tested against the test house and the recorded fixture, so that today's output is pinned before the code moves.
12. As a maintainer, I want the TV, the speakers and the scenes to be elements the Home pane will compose unchanged in spec 24, so that the Home move is layout only.
13. As a maintainer, I want the rule that lets the guest place a feature element written down (ADR 0024), so that the bridge is a known shape and not a hack, and its one use is deleted with the Home move.
14. As a maintainer, I want `<hp-switch>` in the kit with the TV as its first user, so that the lights' Auto and Night switches and the Wallbox switch reuse it.
15. As a maintainer, I want the behaviour tests to tap and read through the harness alone, including a command that fails, so that the tests survive the rewrite.
16. As a learner, I want the command runner and the optimistic overlay explained as a **command** with compensation (Gamma et al.; Richardson's _Microservices Patterns_ for the compensating action), so that the shape is named.

## Implementation Decisions

### The folder

```
src/providers/
  tv-source.ts             TvSource (the port: candidates, read(id, states, registries, names): TvInputs), TvInputs, visibleTvs, readSet, the wake-button rule
  tv-entity.ts             any media_player with device_class 'tv': the generic adapter
  samsung-tv.ts            the Samsung platform: preferred when both exist
src/features/media/
  README.md
  index.ts                 mediaFeature: FeatureDescriptor; defines the Home scenes row's element
  ids.ts                   mediaIds(store): the TV, the speakers, the wake button, the scenes and modes
  inputs.ts                TV_SOURCES, findTv, readMedia(states, registries, names, sources): MediaInputs
  speakers.ts              speakers(states, registries, names, tvId): Speaker[] (generic rules, pure; readMedia adds each one's state)
  model.ts                 mediaModel(inputs, {t, names, overlay}): MediaViewModel
  scenes.ts                sceneTiles(states, registries, config, overlay, deps): SceneTileView[]
  commands.ts              the feature's commands: tvPower, tvVolume, tvMute, tvPlayPause, speakerPlayPause, speakerVolume, speakerSkip, runScene, setMode
  media-pane.ts            <hp-media-pane> (#217), its rules in media-pane.element.css
  tv-box.ts                <hp-tv-box> (the TV with its switch and controls; the pane's, #217, and the phone's sheet's, #218), tv-box.element.css
  speaker-pod.ts           <hp-speaker-pod> (#217), speaker-pod.element.css
  media-tile.ts            <hp-media-tile> (the phone's tile with an embedded switch or play button)
  scene-tiles.ts           <hp-scene-tiles> (Home, placed by the guest through the bridge, #219), scene-tiles.element.css
  styles.css               the rules two of the feature's elements share, if a later ticket has any (#217 has none: each element's are its own)
src/ui/
  commands.ts              CommandRunner: the invoker of a Command, `commands.run(cmd)` (#215)
  overlay-store.ts         overlay(), OverlayStore: the held values, shared by the panel (#215)
  switch.ts, switch.element.css  <hp-switch> (#215)
  controllers/optimistic.ts OptimisticController: one host's subscriber to the store (#215)
  contexts.ts              + optimisticContext, provided by the shell, one store per panel (#215)
  styles/stepper.css
test/unit/
  providers/tv-entity.test.ts, samsung-tv.test.ts
  features/media/{speakers,model,scenes,commands}.test.ts
  ui/{commands,overlay-store,optimistic-controller}.test.ts (#215)
test/e2e/media.spec.ts   (extends the existing file)
```

### The provider seam: which player is the television

Two adapters exist today in one function: `tv()` prefers the `samsungtv` platform and then looks for `button.wake_on_lan_*` whose name mentions the TV; any other `media_player` with `device_class` `tv` is the fallback. That is a **strategy** with two concrete strategies, so the seam is real.

```ts
// src/providers/tv-source.ts
export interface TvInputs {
  id: string; // media_player.*
  name: string | null; // the device's name_by_user through the resolver, else the entity's name (generic set); null when there is none
  defaultName: MessageKey; // the catalog message that names a set with no name: 'media.samsungTv' or 'media.tv'; the model says tv.name ?? t(tv.defaultName)
  areaId: string | null;
  wakeButton: string | null; // button.* to press when turn_on fails; null when the house has none (any set, as tv() looks it up)
  state: 'off' | 'on' | 'unavailable'; // 'on' is any state but off
  source: string | null; // the input, cleaned: everything after " - " dropped, "＆" → "&"
  muted: boolean;
}
export interface TvSource {
  readonly name: string; // 'tv-entity', 'samsung-tv'
  /** the players this source would pick, in preference order; the first present wins across sources */
  candidates(states: HassEntities, registries: Registries): string[];
  read(id: string, states: HassEntities, registries: Registries, names: Names): TvInputs;
}
// src/features/media/inputs.ts (the weather precedent: the list sits beside the model, so a provider imports no sibling)
export const TV_SOURCES = [samsungTvSource, tvEntitySource]; // preference order: Samsung first, as the class does
export function findTv(states, registries, names, sources = TV_SOURCES): TvInputs | null;
```

- `samsungTvSource.candidates` returns the visible `media_player.*` with `platform === 'samsungtv'`; its `read` sets `name` to `names.name(deviceId)` when the device has `name_by_user`, else null, with `defaultName` `media.samsungTv` ("Samsung TV"). No adapter calls `t`: the model words the default.
- Every source reads `wakeButton` the same way, as `tv()` does whichever set it chose: the first `button.wake_on_lan_*` whose `friendly_name` matches `/tv/i` (a rule-feeding read of `friendly_name`, allowed by the conventions).
- `samsungTvSource.candidates` keeps the legacy filter: the player must also say `device_class === 'tv'`, as `tv()` does (a Samsung player that does not is no television and no speaker either). `tvEntitySource.candidates` returns the visible `media_player.*` with `device_class === 'tv'`; `read` names it through the resolver (the device's name, else the entity's, else null) with `defaultName` `media.tv` ("TV").
- The two sit in `src/providers/` and import the core only; a hidden player is one whose registry row says `hidden: true` (the display registry Home Assistant's frontend gives), and is never a candidate. `Registries` is `{entities, devices, areas}` from `PanelHass` (spec 12's types).

### The speakers, the scenes and the modes are generic

- `speakers(states, registries, names, tvId)` in `src/features/media/speakers.ts`: every visible `media_player.*` that is not the TV, not on the `unifiprotect` or `samsungtv` platforms, and sits in an area (`store.areaOf`'s rule, over the registries the function is given); the name drops every word that also appears in the area's name as Home Assistant gives it or as the panel shows it ("HomePod mini Kitchen" in the Kitchen is "HomePod mini"); returns `{id, areaId, name}` sorted as `Object.keys` gives them today (insertion order; keep it, the baselines depend on it).
- `sceneTiles` in `scenes.ts`: the visible `scene.*` ordered by `config.scenes` then alphabetically; then the `config.modes` `input_boolean`s that exist; a scene's sub-line is "Done" for four seconds after a run, else "Last {ago}" when its state parses as a date, else "Tap to run"; a mode's is On or Off with `aria-pressed`. The icon rule `sceneIcon(id)` (night, movie, dinner, away, else house) moves here unchanged.
- Ids: `mediaIds(store)` is the TV id, the wake button, every speaker id, every scene id and every mode id; the pane and the scenes row subscribe to the union, and the store's index means a light's change never reaches them.

### Commands and the optimistic overlay (ADR 0023)

The class's three mechanisms become three small kit modules and a feature file that uses them. As built (#215), the held values live in one `OverlayStore` per panel, not in one controller per element: the Home card's TV box and the pane's TV box were to be two elements (user story 6, withdrawn by #219) and two controllers cannot share a map; the pane, its sheet and the tiles still read one store. The shell provides the store by `optimisticContext`, each element's `OptimisticController` is a subscriber that updates its host, and two panels in one page stay independent. ADR 0023 records the choice.

```ts
// src/ui/commands.ts
/** One service call. */
export interface Call { domain: string; service: string; data?: Record<string, unknown> }
export interface Command extends Call {
  /** the toast on success, a message key with values; none for a silent command (volume steps) */
  done?: {key: MessageKey; values?: MessageValues};
  /** the optimistic keys this command set; they are released on failure, and only they */
  holds?: readonly string[];
  /** a second try when the first rejects (the TV's wake-on-LAN button): a bare call, whose success is the command's and says `done` */
  fallback?: Call;
}
export interface CommandRunnerOptions {
  overlay: Pick<OptimisticController, 'release'>;
  t: () => Messages['t']; // lazy: the store arrives when the host connects
}
export class CommandRunner {
  constructor(host: ReactiveControllerHost & HTMLElement, options: CommandRunnerOptions); // takes the client from apiContext
  run(cmd: Command): Promise<boolean>; // throws if the host has not connected yet
}
```

Behaviour: `api.runService(domain, service, data)`; on success dispatch `ToastEvent(t(done.key, done.values))` if `done`; on rejection, if `fallback` run it (once) and treat its result as the command's; on final failure release `holds` from the overlay (not the whole bag) and dispatch `ToastEvent(t('common.failed', {reason}), true)`, the reason being the rejection's `message`, else its `code`, else the value, as the legacy `call` words it. The element makes its runner in its constructor, after its controllers: `optimistic = new OptimisticController(this)`, then `commands = new CommandRunner(this, {overlay: this.optimistic, t: () => this.storeController.store.t})`, and calls `this.commands.run(cmd)`; the runner gets the API from `apiContext`, and `t` is handed in so the catalog does the formatting. The **command** pattern (Gamma et al.): `Command` is the data, `CommandRunner` the invoker, `PanelApi` the receiver; with a **compensating action** on failure (Richardson): the compensation is the release of the keys the command itself set. The header says what it must not do: read the store, format a string, or touch another command's state.

```ts
// src/ui/overlay-store.ts (plain TypeScript, no Lit)
export interface Held { value: unknown; until: number }
export const TTL_MS = 20_000;
export function overlay(held: Map<string, Held>, key: string, current: unknown, now: number): unknown; // the pure rule, tested alone
export class OverlayStore {
  constructor(options?: {now?: () => number});
  readonly now: () => number;                       // the clock, injectable
  readonly size: number;
  hold(key: string, value: unknown, ttlMs?: number): void;   // tells the subscribers
  read<T>(key: string, current: T): T;                        // drops a confirmed or expired key, silently
  release(...keys: string[]): void;                           // tells the subscribers if any key was held
  nextExpiry(): number | undefined;
  sweep(): void;                                              // drops what expired, silently
  subscribe(listener: () => void): () => void;
}
// src/ui/controllers/optimistic.ts
export class OptimisticController implements ReactiveController {
  constructor(host: ReactiveControllerHost & HTMLElement, options?: {store?: OverlayStore; timers?: Timers});
  hold(key: string, value: unknown, ttlMs?: number): void;  // the store's, for the host's convenience
  read<T>(key: string, current: T): T;
  release(...keys: string[]): void;
  readonly size: number;
}
```

The pure `overlay` is the class's `pend` with the string comparison kept (`String(held) !== String(current)`), so a `volume_level` of `0.3` held as `0.3` and reported as `0.30000001` stays held until it expires, as today (the two strings differ). The controller subscribes to the store in `hostConnected` and unsubscribes in `hostDisconnected`, and keeps one timer at the store's earliest expiry (cleared in `hostDisconnected`, set again in `hostConnected` when values are held): when it fires it sweeps what ran out and updates its host, so a held value that Home Assistant never confirms visibly reverts at twenty seconds, which the class only did on the next tick. The clock is the store's (`now`), so one fake clock drives a test. Key names are typed per feature (`media/commands.ts` exports `const K = {on: id => \`${id}:on\`, …}`), so a typo is a compile error.

`src/features/media/commands.ts` is where the feature's intent becomes `Command`s; it is pure (returns a `Command`) and tested as data:

- `tvPower(tv, on)`: hold `K.on(tv.id)`; `media_player.turn_on` with `fallback: {domain: 'button', service: 'press', data: {entity_id: tv.wakeButton}}` when `wakeButton` exists, done `media.tvTurningOn` ("Turning the TV on"); or `media_player.turn_off`, done `media.tvTurnedOff` ("TV turned off").
- `tvVolume(tv, dir)`: `volume_up`/`volume_down`, silent. `tvMute(tv, muted)`: hold `K.mute`, `volume_mute`. `tvPlayPause(tv)`: `media_play_pause`, silent.
- `speakerPlayPause(sp, play)`: hold `K.state(id)` as `'playing' | 'paused'`, `media_play`/`media_pause`, done `media.speakerPlaying`/`media.speakerPaused` with the name. `speakerSkip(sp, dir)`: `media_next_track`/`media_previous_track`.
- `speakerVolume(sp, level)`: hold `K.volume(id)` as the clamped two-decimal level; the element debounces the send by 450 ms through `debounce` in `src/core/timing.ts` (pure factory, injected timers, tested; its `cancel` is what the element calls in `disconnectedCallback` so no send fires after the pane is gone); the command is `volume_set` with the last level, silent.
- `runScene(id, name)`: hold `K.ran(id)` for 4000 ms; `scene.turn_on`, done `media.sceneOn` with the name. `setMode(id, on, name)`: hold `K.on(id)`; `input_boolean.turn_on`/`turn_off`, done `media.modeOn`/`modeOff`.

The class's `pend`/`pending`/`call` are **not** deleted by this spec: the climate, car, lights, purifier and outlet controls still use them; each later move deletes its keys, and the Car move (spec 21) deletes `call` and the bag. The two implementations coexist for a few releases with the same twenty-second rule, which is what makes the move invisible.

### The inputs, the model and the view model

```ts
export interface MediaInputs {
  tv: TvInputs | null;
  speakers: SpeakerInputs[]; // {id, areaId, name, state, available, features: number, title, artist, album, picture, volume}
}
export interface MediaModelDeps {
  t: Translate;
  names: Names; // a speaker's room: its area's name as the panel shows it, else the speaker's own name
  overlay: Overlay; // <T>(key: string, current: T) => T: the controller's or the store's `read`, injected so the model stays pure
}
export function mediaModel(inputs: MediaInputs, deps: MediaModelDeps): MediaViewModel;
export function mediaBrief(inputs: MediaInputs, t: Translate): string; // the More sheet's line (#217): "TV on · 1 speaker playing" | "Nothing playing"

export interface MediaViewModel {
  summary: string; // "TV on · Netflix · 2 speakers playing" | "TV off · 3 speakers · nothing playing" | ""
  tv: TvView | null; // {id, wakeButton (what the box's commands name), name, on, available, muted, sourceLabel, status (the line the pane's and the tile's start from), statusLine (the pane's, with the input), screenLabel, switchLabel, controlsLabel, hint, controls: {volumeDown, volumeUp, mute, playPause}: {text, label}} (#219 dropped the Home card's `cardRight` and icon labels)
  speakers: SpeakerView[]; // {id, room, name, playing, available, loaded, title, artist, subLine, picture, volume: {percent, text, caption, label, downLabel, upLabel, atMin, atMax, down, up (the levels a tap on − and + asks for: a five-percent step through `volumeLevel`, as `mpVol`)} | null (no stepper), playPause: {enabled, label, icon}}
  speakersLine: string; // "2 speakers playing" | "Nothing playing" | "None found"
  tiles: MediaTileView[]; // the phone: {key, kind: 'tv' | 'speaker', title, sheetTitle, description, subLine, on, picture, control: {kind: 'switch', checked, label, disabled} | {kind: 'play', playing, label, disabled}}
  labels: {speakers: string; noDevices: string; noSpeakers: string}; // the words around the cards
}
```

- The model applies the overlay to `on`, `muted`, `state` and `volume` through `deps.overlay`, so the TV box and the tile read one state.
- The `supported_features` bits are named constants in the model (`PAUSE = 1`, `VOLUME_SET = 4`, `PLAY = 16384`) with a comment pointing at Home Assistant's `MediaPlayerEntityFeature`; a speaker has a `volume` (the stepper) when it can `VOLUME_SET` and reports a level, else it is null; the play button is enabled when `(loaded || paused) && can(play ? PAUSE : PLAY)`, as today.
- Strings through `deps.t` (as built in #216, about fifty `media.*` keys: the French is what the rewrite layer made of the English, quirks included, so some sentences are several messages): the pane's sub-line `media.summaryTvOn`/`summaryTvOff`/`summaryPlaying`/`summaryIdle` (a speaker count after a television part, which French words differently from `media.speakersPlaying`, the ICU plural the speakers line says alone), `media.speakers`, `media.nothingPlaying`, `media.noneFound`, `media.noDevices`, `media.playersHint`; the box `media.notResponding`/`on`/`off`/`onMuted`/`onMutedSource`, `media.tvPower` (`{name} power`), `media.volumeAndPlayback`, `media.volumeDown`/`volumeUp`, the pane's `volumeDownShort`/`volumeUpShort` (`Vol −`, `Vol +`) and `volumeDownPane`/`volumeUpPane`, `media.mute`/`playOrPause` (`media.unavailable` and `media.unmute` went with the Home card, #219), `media.noVolumeSlider`, `media.opensControls`; a pod `media.volume`/`volumeOf`/`percent`/`play`/`pause` and `media.speakerState` (`{name} · {state}`, an ICU select); the toasts `media.tvTurningOn`/`tvTurnedOff`/`speakerPlaying`/`speakerPaused`/`sceneOn`/`modeOn`/`modeOff`; the scenes row `media.tapToRun`/`done`/`modeIsOff` and `media.last`, an ICU select on the `Ago` that `fmt.ago` returns (`now`, `minutes`, `hours`, else a date: `Last 5 min ago`, `Il y a 5 min`, `Lancée le 7 nov.`) (French writes "Désactivé" itself); and the names `media.samsungTv`/`tv`, `media.title`, `common.failed`. There is no `media.scenes`, `media.speakerControls` or `media.tvControls`: the legacy panel says none of them. `fmt.ago(instant, now)`, added to the formatters in #216, returns no text: it cuts the span by the legacy rule into `{kind: 'now'}`, `{kind: 'minutes', n}`, `{kind: 'hours', n}` or `{kind: 'date', date}` and the catalog words it, with its own equivalence test.

### The elements

Every element is a humble object with a `StoreController`, an `AppearanceConsumer` and, where it acts, an `OptimisticController` and a `CommandRunner`; the model runs in `willUpdate`.

- **`<hp-media-pane>`**: `active`; `StoreController({ids: s => mediaIds(s)})` and an `OptimisticController`, whose `read` is the model's `overlay`, so a hold in a child draws the pane again; renders `<hp-pane-header icon="tv" color="var(--c-home)">` with `t('media.title')` and `vm.summary`; on the tablet the `#mtv` card as `<hp-tv-box>` and the `#media` card with the "Speakers" top line and the `.pods` of `<hp-speaker-pod>` (`repeat` by id), or the hint when none; on the phone (`:host([compact])`) the `.mtiles` grid of `<hp-media-tile>` (`repeat` by key) or the "No TV or speakers found." hint. The pane never calls the API: its children do. As built in #217 the phone drew the header only and the descriptor's template kept the guest's `#mtiles`, `#mtv` and `#media`; #218 deleted them: on the phone the pane draws the tiles and the sheet a tile opens (`controlsKey`, below).
- **`<hp-tv-box>`**: property `tv: TvView`; the pane's layout, as built in #217 under its own selectors `.tvhead`/`.tvscreen`/`.tvkeys`, copies of the legacy `.mtvhead`/`.mtvscreen`/`.mtvctl` (the `card` variant planned for the Home card was dropped with the card, #219); the switch is `<hp-switch>`; a tap holds the value it asks for (`K.on`, `K.mute`) for the legacy `tvCmd`'s fifteen seconds (`TV_HOLD_MS`, where other controls hold twenty) and runs the feature's command, `this.commands.run(tvPower(tv, on))` and so on.
- **`<hp-speaker-pod>`**: property `speaker: SpeakerView`; the art or the icon, the room, the title, the sub-line, the stepper (`−`, the percent, `+`) when `volume` is set, the play button; each stepper tap holds `volume.down` or `volume.up` at once and goes through `debounce(450)` into `speakerVolume`, so a burst is one `volume_set` at the last level. A send still waiting when the pod leaves the document is **cancelled** in `disconnectedCallback` (`debounce`'s `cancel`) and its held level released, so a pod that comes back never shows a level that was not sent; connecting arms nothing, since a fresh tap starts a fresh wait (#217, tested in `media.spec.ts`). Each pod has its own wait, a change from the legacy panel's one `volT` timer: a tap on one speaker no longer drops another speaker's pending level.
- **`<hp-media-tile>`**: the phone's `.stile.wide.home` tile as a `div[role=button]` with the embedded `<hp-switch>` (TV) or `.pp2` play button (speaker); tapping the tile (not the control) dispatches `SheetRequestEvent('media.controls', {key})`; the sheet is the phone's Media detail, which today is the More sheet's Media section opening the pane as a sheet: in this spec the request opens the pane itself inside `<hp-sheet>` on the phone (today's behaviour: `data-card="mtv"`/`"media"` open the card's content as a sheet through `openCard`; the host's inline rule covers it). As built in #218: the pane draws the card the open tile names (the television's box, or the speakers' card) inside its own `<hp-sheet>`, as `openCard` moved `#mtv` or `#media` into the card sheet; the descriptor binds the open tile's key (`media.controls`, `sheets.ts`) to the pane's `controlsKey`; the sheet opens only from the Media tab, so `overSheets` lists nothing, and the first caller that opens it over another tab adds the id there with the pane's branch that draws the sheet alone, Weather's detail being the precedent; the control stops its click so the tile opens nothing; `<hp-sheet>` draws no sub-line when none is slotted, as the card sheet had none; the tile draws the kit's `.stile` rules, to which the `.pp2` press moved from `motion.css`.
- **`<hp-switch>`** (`src/ui/switch.ts`, #215): a `button[role=switch]` with `checked` (reflected, `aria-checked`), `disabled`, `label` (`aria-label`); a tap, Space or Enter dispatches a composed `change` whose `detail.checked` is the state asked for, and the element does not flip itself: its owner holds the optimistic value and sets `checked` back. Its look is `switch.element.css`, a copy of the legacy `.sw` rules under the class `.switch`; the legacy `.sw` rules stay in `base.css`, `motion.css` and `extra.css` while the TV's switches (#217, #218, #219), the light sheet's (#262) and the Wallbox and precondition switches (#253) are still legacy `.sw` buttons (the purifier draws none), and #263 (Lights move 6, the deletion) deletes them.
- **`<hp-scene-tiles>`**: the Home contribution, placed by the guest (below); the `#hscenes` row of buttons from `sceneTiles` (`repeat` by id), each tap holding `K.ran` for four seconds (`SCENE_RAN_MS`) or `K.on`, and running `runScene` or `setMode` through its `CommandRunner`. As built (#219): its host is `display: contents`, so each tile is an item of the guest's `.hscenes` grid as the legacy buttons were; it subscribes to `mediaIds` and also draws again each minute while connected, so a "Last 5 min ago" line keeps time where the legacy panel redrew the row at every change of the house. The `<hp-tv-card>` this spec planned is not built (user story 6, withdrawn).

### The Home-card bridge (ADR 0024)

The Home pane and the idle screen are the shell's compositions (ADR 0017) and they move last. Until then the guest writes their markup. The rule that lets a feature's card appear there now:

> The guest MAY write a feature element's **tag** into one of its containers, with no attributes but a static `id`, and MUST NOT set a property on it, read inside it, or write anything else into it. The element gets the store, the API client and the appearance from context, which resolves through the shell's provider because the guest's container is inside the shell's shadow root. The shell imports the feature's `index.ts` (the registry already does), so the element is defined before the guest draws.

As built (#219): `build()` writes `<hp-scene-tiles></hp-scene-tiles>` into `#hscenes` once per draw and never again, so the element keeps what it holds, and `renderTabs` no longer calls `renderScenes`. `renderScenes` hid the row when the house had no scene and no mode (`lacking()` and `gateLacking` never knew it), so the element dispatches `hp-empty` with `{empty: boolean}` when that changes and the guest's listener on `#hscenes` toggles `hidden`: the one event the bridge allows upward. The Home TV card is not a use: it was never on screen, and #219 deleted it with `'tv'` of the column packing (`LAYOUT`). The bridge's one use is listed in `src/shell/guest.ts`'s header and in the programme spec, and the Home move (#268, spec 24) deletes it; the French observer sees nothing inside the element.

### Styles

- `src/features/media/styles.css` receives, rule by rule, `.mtvhead`, `.mtvscreen`, `.mtvctl` (`tabs.css` ~705 to 765), `.pods`, `.pod` and its children (`tabs.css` ~766 to 840), `.tvbox`, `.tvctl` (`extra.css` ~1006 to 1050; #219 deleted them with the hidden card instead), `.stepper` (`extra.css` ~454 to 490 and `motion.css` 61; promoted to `src/ui/styles/stepper.css` when Air's fan control, spec 18, becomes its second user), `.pp`, `.pp2`, `.ptile`, `.ptile.scene` and `.hscenes .ptile` (`extra.css` ~1131 to 1230, `tabs.css` ~364 to 410), `.mtiles` (`phone.css` 10 and 338), `.stile.home` (`phone.css` 270 and `glass.css`). `.app.cp` → `:host([compact])`, `.app.gl` → `:host([glass])`.
- As built in #217: the legacy rules stay in the legacy sheet while the phone's tiles (#218) and the Home card (which #219 deleted instead) still draw them, so each element carries a copy in its own `<element>.element.css` (the Weather elements' pattern), under selectors of its own, because the styles-split test lets one file write a selector: `media-pane.element.css` (`.pane-media`'s grid as the host's, `.mcard` for `.card`, its `.top`, `.lbl`, `.hint` and `.pods`), `tv-box.element.css` (`.tvhead`, `.tvscreen`, `.tvkeys`) and `speaker-pod.element.css` (`.player`, `.vol`, `.play` for `.pod`, `.stepper`, `.pp`). Each file's header names the tickets that delete the legacy rules; a computed-style comparison and the baselines proved the copies. #218 deleted the legacy `.mtvhead`, `.mtvscreen`, `.mtvctl`, `.pods`, `.pod`, `.pp` and `.mtiles` rules with the phone's card sheet and copied the phone's `.app.cp .pod` rules into `speaker-pod.element.css`. #219's `scene-tiles.element.css` reads `.ptile`, `.ptile.scene` and `.hscenes .ptile` (with their phone, glass and motion rules) as `.scenetile`, `.scene.active` and `.mode.active`, merged as the cascade left them inside `.hscenes`; #220 deletes the legacy rules, which nothing draws after #219.
- `.sw` stays in the legacy sheet, and `<hp-switch>` carries its own copy (`switch.element.css`, #215): the styles-split test lets an element's file repeat nothing that another kind of file writes, so the copy's selectors are `.switch`, not `.sw`; the duplicate goes with the legacy rules, which #263 deletes once #217, #218, #219, #253 and #262 have moved their `.sw` buttons.

### Strings and formats

About fifty `media.*` keys (#216), French from the map's entries (`'On · muted'`, `Mute`, `'Volume up'`, `'Play or pause'`, `Paused`, `'Not playing'`, `Speakers`, `'TV turned off'`, `'Turning the TV on'`, `'No TV or speakers found.'`, `'Nothing playing'`, `'None found'`, `'TV on'`, `'TV off'`, `'{n} speaker(s) playing'`, `'Media players that sit in an HA area show up here.'`, `'Tap to run'`, `'Last {n}'`, `Done`, `Media`, `"Didn't work:"`), listed in `test/unit/fixtures/moved/media.json` for the equivalence test, deleted from `src/i18n/fr.js` in pull request 2. `plural(n, 'speaker')` becomes the ICU plural `media.speakersPlaying`. The relative time ("Last 2 h ago") goes through `fmt.ago` and `media.last`.

### Deletion (pull request 2) and grep gates

Deleted from `src/home-panel.js` (#219 took `renderTV`, `tvBox`, the whole `#tv` card, `'tv'` of `LAYOUT`, the `'renderTV'` entry of `renderLive` and the `'renderScenes'` entry of `renderTabs`, and `this.cache.tv` with them, being only `set('tv')`'s key; #220 the rest): `tv`, `renderTV`, `tvBox`, `tvCmd`, `speakers`, `renderMedia`, `renderMediaTiles`, `mpVol`, `sceneTiles`, `renderScenes`, `runScene`, the `data-mp` and `data-p` branches of `phoneCmd` and of `wire()` (~2082, 2221 to 2226), the Media line of `renderPaneSubs`, `this.volT`, `this.sceneRan`, `this.cache.tv`, the `'renderTV'` entry of `renderLive`, the `'renderScenes'` and `'renderMedia'` entries of `renderTabs`, the `'mtiles'` entry of the containers loop (~2256), the inner markup of `#mtv`, `#media`, `#mtiles`, `#hscenes` (`#hscenes` stays as the bridge's host), `sceneIcon`. `phoneCmd` keeps its purifier, outlet and Wallbox branches until specs 18, 19 and 21.

Gates: `grep -nE '^  (tv|renderTV|tvBox|tvCmd|speakers|renderMedia|renderMediaTiles|mpVol|sceneTiles|renderScenes|runScene)\(|sceneIcon|data-mp|data-p=' src/home-panel.js` is empty; `grep -nE '\.(pod|pods|mtvhead|mtvscreen|mtvctl|tvbox|tvctl|stepper|ptile|mtiles|sw)\b' src/css/*.css` is empty; `grep -c "TV\|speaker\|Speaker\|playing\|Tap to run" src/i18n/fr.js` drops by the listed count; the class shrinks by about 330 lines, quoted in the pull request.

### Performance, by construction

- The pane and the scenes row subscribe to the media ids only; a thermostat change gives zero mutations in either (the mutation-count test of spec 14, with a tripwire a redraw would show).
- A held value re-renders only the elements subscribed to the panel's store (each element's controller updates its own host), and the overlay's expiry schedules one update at the right instant instead of a one-second tick.
- The volume stepper sends one `volume_set` per burst (the debounce), and the pod's `repeat` by id keeps the stepper's focus through the hass updates that follow.
- `entity_picture` images are `loading="lazy"` as today and keyed by id so a title change does not reload the art.

## Acceptance Criteria

Pull request 1, the pane and the command layer:

1. `src/providers/{tv-source,tv-entity,samsung-tv}.ts`, `src/core/registry.ts`, `src/features/media/{README.md,index.ts,ids.ts,inputs.ts,speakers.ts,model.ts,commands.ts,media-pane.ts,tv-box.ts,speaker-pod.ts,media-tile.ts}` with each element's `<element>.element.css`, `src/ui/{commands.ts,overlay-store.ts,switch.ts,switch.element.css}`, `src/ui/controllers/optimistic.ts`, `src/core/timing.ts` exist with module headers; `FEATURES` has `mediaFeature` in place of `legacyFeature('media')`.
2. Vitest: the two TV sources (Samsung preferred over a generic set when both exist; the wake button found by name; the device's `name_by_user` through the resolver; no TV → null), `speakers` (the TV excluded, the UniFi and Samsung platforms excluded, a player without an area excluded, the area's words dropped from the name), `mediaModel` from the full test house in `en` and `fr` (the pane's lines as literals from the baselines) and from the recorded fixture, the feature bits, every command as data (`tvPower` with and without a wake button), the pure `overlay` (held while different, released when equal, expired after ttl, string comparison) and the `OverlayStore` and `OptimisticController` with a fake host and a fake clock, `CommandRunner` with a fake API (success toasts, failure releases only `holds` and toasts sticky, fallback runs once), `debounce` (the overlay, the store, the controller and `CommandRunner` are #215's); all at 100 percent statements.
3. Playwright `media.spec.ts`: check 7 unchanged (mute and power send their services); five taps on a speaker's `+` within 450 ms send one `volume_set` at the final level; play on a paused speaker shows the pause icon at once and `media_player.media_play` is sent; a failing `media_player.turn_on` (a new harness helper `window.house.failNext('media_player.turn_on')`, a substring of `domain.service`, #215) with a wake button present sends `button.press`, and without one shows the sticky toast and the switch returns to off; a thermostat change causes zero mutations in `hp-media-pane`'s root; axe clean on the tab and the phone's Media sheet.
4. The French equivalence test passes for `test/unit/fixtures/moved/media.json`; every baseline identical; `npm run check`, `npm test -- --coverage`, `npm run lint` green; ADR 0023 (commands and the optimistic overlay) accepted; changeset (patch): "The Media tab is redrawn with the same look. Nothing visible changes."

Pull request 2, the scenes row and the hidden TV card (#219), then the deletion (#220):

5. `<hp-scene-tiles>` exists and is placed by the guest through the bridge; the hidden Home TV card is deleted (`renderTV`, `tvBox`, `#tv`, #219), and `sceneTiles`, `renderScenes`, `runScene` (#220); the `home-*` baselines (eight) and `bare-home-*` identical; the scene's "Done" shows for four seconds after a tap and `scene.turn_on` is sent (a behaviour test with the page clock); a failing command from the row undoes only its own keys.
6. The grep gates hold; the styles-split test passes with the media rules only in the feature's and the kit's files; the French map lost the listed entries; the class's line-count drop is quoted.
7. ADR 0024 (the Home-card bridge: what the guest may write, what the element may dispatch, when it is deleted) accepted; `src/shell/guest.ts`'s header lists the bridge's one use; every baseline identical; all suites green; changeset (patch): "Internal rewiring of the scenes row; the hidden TV card is gone. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: the harness's `failNext` helper (the test's side of the `hass` seam learning to say no, so a command's failure path is a behaviour test, not a unit test of a mock), and the pure `overlay` function as the tested heart of a controller the harness exercises. The providers, the speaker rules, the model, the commands-as-data and the overlay are the pure-function seam; the elements are proven by `media.spec.ts` and the baselines. Prior art: `weather.spec.ts` for the pane style, `lights-sheet.spec.ts` for "one call per drag" (the volume debounce is the same claim).

## Out of Scope

- A media detail sheet with a seek bar or a source list: the pane has none today.
- Moving `pend`, `pending` and `call` out of the class: they leave with the last control that uses them (spec 21).
- The More sheet's Media summary word: it reads the registry's `summary`, which this spec provides from `mediaBrief` (#217), the legacy `moreLines` (`TV on · 1 speaker playing`, the input left out, `Nothing playing` when it says nothing else), because the More sheet's baselines read that line and not the pane's sub-line.
- Promoting `.stepper` to the kit: spec 18 does it when Air's fan is the second user.

## Notes

- **Why the command and the overlay are in the kit and not in the core.** They dispatch events and schedule host updates, which is DOM-side work the core must not do; what is pure in them (`overlay`, `debounce`, the `Command` shape) is tested alone, and `debounce` sits in the core because it has no DOM at all.
- **Why a `fallback` field rather than a try/catch in the element.** The wake-on-LAN retry is a property of the command, not of the button that sent it; as data it is tested without a DOM and shows up in the command's log line in the harness.
- **Why the bridge rather than leaving the scenes row in the class.** A tile's held "Done" and held mode are the panel's `OverlayStore`'s, which the class's bag cannot be. The bridge costs one listed exception to "the guest writes nothing it does not own", deleted by spec 24 (#268). It was to cost two: the TV card, whose box would share the pane's state (user story 6), was deleted instead (#219), since no screen showed it.
- **Why the TV's naming is in the Samsung adapter.** "Samsung TV" as a default name is integration knowledge; the generic adapter's default is "TV". Each adapter names its default by a catalog key (`defaultName`), as the weather sources name a condition, and the model translates it.
- **Reading**: Gamma et al., _Design Patterns_ (command, strategy); Richardson, _Microservices Patterns_ (compensating transactions, for the release-on-failure idea in miniature); Lit docs, _Reactive Controllers_, _Events_; Home Assistant developer docs, _Media player entity_ (`MediaPlayerEntityFeature`), _Scene_, _Input boolean_.
