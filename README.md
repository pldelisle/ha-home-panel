# Home panel for Home Assistant

A dashboard for a tablet on the wall and for your phone, installed as its own page in the Home Assistant sidebar.
It covers energy, climate, lights, weather, the car, air quality, media, security and a timeline of your automations.
It follows the sun between a light and a dark theme, has a frosted-glass look with animated wallpapers, and speaks French
to users whose Home Assistant profile is in French.

![Home tab on a tablet](docs/tablet-home.png)

| Phone                                       | Climate, dark theme                          |
| ------------------------------------------- | -------------------------------------------- |
| ![Home tab on a phone](docs/phone-home.png) | ![Climate tab](docs/tablet-climate-dark.png) |

It's mostly for monitoring. You can control lights, scenes, thermostats, media players, the EV charger and a FordPass car.

## What it uses

Every section is optional. A section shows only when its entities exist, so a house without a car never sees a Car tab.

| Section     | Works with                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weather     | any `weather` entity. Environment Canada's extra sensors are found automatically. The radar needs [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card) from HACS                   |
| Climate     | every `climate` entity, with temperature, setpoint and power history from sensors named like Hilo's (`sensor.<thermostat>_temperature`, `_target_temperature`, `_power`), or set per room              |
| Lights      | one dimmer row per area: slide the row to dim, tap the bulb to switch, tap the row for colour; with [Adaptive Lighting](https://github.com/basnijholt/adaptive-lighting) Auto and Night when installed |
| Energy      | a whole-house power sensor, a water heater, an EV charger, [Hilo](https://github.com/dvd-dev/hilo) rates and Hydro-Québec peaks                                                                        |
| Car         | the [FordPass](https://github.com/itchannel/fordpass-ha) integration                                                                                                                                   |
| Air         | Mila purifiers and air sensors                                                                                                                                                                         |
| Security    | door, window and motion sensors, UniFi Protect cameras                                                                                                                                                 |
| Media       | TVs (Wake-on-LAN), speakers                                                                                                                                                                            |
| Automations | your automations' own traces, drawn as flow charts                                                                                                                                                     |

## Install

1. Download `home-panel.zip` from the [latest release](../../releases/latest), or build it yourself (below).
2. Unzip it into `<config>/www/home-panel/`, so that `home-panel.js` sits at `<config>/www/home-panel/home-panel.js` with the `chunks/` folder beside it.
3. Add the panel to `configuration.yaml`:

   ```yaml
   panel_custom:
     - name: home-panel
       sidebar_title: Home panel
       sidebar_icon: mdi:home-analytics
       url_path: home-panel
       module_url: /local/home-panel/home-panel.js?v=2.7.0
   ```

4. Restart Home Assistant. The panel shows up in the sidebar.

Home Assistant caches files under `/local/` for 31 days. After each update, change the `?v=` number and restart.

## Configure

Without a `config:` block, the panel finds what it can by itself: the weather entity, thermostats, people, lights, sensors and a FordPass car.
Add a `config:` block under the panel to name the rest of your devices, pick the room order or add a picture of your house.
[examples/configuration.yaml](examples/configuration.yaml) lists every option.

```yaml
    config:
      people: [Alex, Sam]
      house_image: /local/home-panel/my-house.webp
      entities:
        grid_power: sensor.house_power
        water_heater_temperature: sensor.water_heater_temperature
        ev_charger_power: sensor.charger_power
      rooms:
        - {climate: climate.living_room, name: Living room, icon: sofa}
        - climate.bedroom
      scenes: [scene.dinner, scene.movie_night]
```

The Lights tab shows one tile per room, the way Apple's Home app does: the bulb switches the room and the rest of the tile opens it. The room's sheet has a brightness slider and a colour temperature slider side by side, and, when the room has an Adaptive Lighting instance, an Auto switch (the schedule) and a Night switch (its sleep mode). Moving a slider by hand takes the room off Auto until Auto is turned on again.

To change the order of the Lights tab, an admin taps Arrange and drags the tiles; the order is saved in Home Assistant and every screen uses it.

An area holding several light groups shows as one card, with a button per group in its sheet. To give each group its own card, list the area under `split_light_areas`, for example `split_light_areas: [living_room]`.

Two rooms can be linked so that one switch, brightness slider or colour slider moves both. An admin picks the partner from the room's sheet ("Linked with", a list of the other rooms), and the pairs are saved in Home Assistant for every screen. Until someone picks there, the panel starts from the pairs listed under `light_links`, by area id or by light entity; a pair with an `input_boolean` counts while that switch is on.

```yaml
      light_links:
        - lights: [light.living_room_lamps, light.tv_lamps]
          switch: input_boolean.living_room_lights_linked
        - [office, hallway]
```

While something runs, a live-activity pill shows in the header (with nothing running and nothing to check, that spot stays empty): the car charging (battery and time to full), the water heater heating (temperature and about how long is left, from its other cycles in the last 24 hours) and a Hilo challenge (phase and countdown, from pre-heat until recovery ends). Tap it for a card per activity above the usual status checks. When FordPass gives no time to full, the panel works it out from the charger's power and `car: {battery_kwh: …}`, the battery's usable size.

### Idle clock and smart stack

On a wall tablet, the panel shows a big clock after 5 minutes without a touch. "Sleep now" in the settings shows it on a phone too. One card sits beside the clock, or under it on a portrait screen, and it changes with the moment. When several cards apply, they take turns every 20 seconds, and small dots show how many there are. Tapping a card wakes the panel and opens what the card is about.

On a tablet the same stack also fills the Home card, under Who's home (without the who's-home card, which the chips above already show).

| Card                                           | When it shows                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| A door open (red, stays until the door closes) | A door sensor open for 5 minutes or more                          |
| Lights unreachable (red, stays until fixed)    | Any light unavailable for 5 minutes                               |
| Weather warning (amber)                        | Environment Canada issues a warning                               |
| Car not plugged in (amber)                     | After 9 pm, the car home, unplugged and under 40%                 |
| Presence not updating (amber)                  | A person's iCloud tracker hasn't updated in 3 hours               |
| Sunrise                                        | The hour before sunrise, with the rooms whose lights are still on |
| Reminders                                      | Before each time listed under `idle_stack.reminders`              |
| Critical peak                                  | A Hydro-Québec critical peak or a Hilo challenge                  |
| Now playing                                    | A speaker is playing                                              |
| Who's home                                     | 30 minutes after someone arrives or leaves                        |
| Today                                          | 6 to 11 am, today's events from your calendar entities            |
| Away                                           | The `away_mode` input_boolean is on                               |
| Room air                                       | A purifier's room reads poor (CO₂, particles, VOC)                |
| Tomorrow                                       | From 5 pm, tomorrow's forecast                                    |
| Car charge                                     | 9 pm to 7 am, while the car is plugged in at home                 |
| Energy today, who's home                       | In the daytime, when nothing else applies                         |

Red cards stay on screen alone, and amber cards come first in the rotation. No card reads camera motion.

```yaml
      idle_stack:
        sunrise_lights_off: true
        reminders:
          - {at: "20:00", title: Bedtime, text: The kids' lamp goes to night mode, lead: 30}
```

Room icons can be `sofa`, `door`, `desk`, `bed`, `bath`, `drop`, `car`, `house` and `therm`.

## Develop

You need Node 22.19 or later (24.5 or later on the 24 line): `size-limit` 14 requires it, and Vitest 5 and Vite 8 need less.

```sh
npm ci
# once per clone: git blame skips the Prettier format commit
git config blame.ignoreRevsFile .git-blame-ignore-revs
npm run build          # Vite: dist/home-panel.js (minified), home-panel.js.map and the vendored libraries
npm run dev            # the same build, redone on every save (vite build --watch)
npm run size           # the main chunk, gzipped, against its budget in package.json (run it after a build)
npm run typecheck      # tsc --checkJs: the config and stack modules strictly, the rest of src/ loosely (tsconfig.legacy.json)
npm test               # unit tests (Vitest): config, stack, French, the built dist/, a scan for personal data
npm run test:watch     # the same, re-run on every save
npm run test:coverage  # the same, with a coverage report in coverage/
npm run changeset      # describes your change for the changelog and the version (see below)
npm run format         # Prettier (run it before committing; CI checks it with npm run format:check)
npm run lint           # ESLint, including an error for an import that does not resolve (CI runs it after format:check)
npm run test:e2e       # builds, then runs the Playwright suite
npm run test:visual:docker           # compares every tab with its screenshot baseline, inside Docker
npm run test:visual:update           # records new baselines, inside Docker
npm run test:visual:container        # the same two, through Apple's `container` CLI (container system start)
npm run test:visual:update:container
```

If `npm run format:check` still fails after one `npm run format`, run `npm run format` again: Prettier settles some chains on the second pass.

`npm run test:e2e` builds, then runs the Playwright suite (the tablet and phone projects, not the screenshots) against the made-up house;
`npm run test:e2e -- test/e2e/lights-sheet.spec.ts` runs one file. The first run needs a browser: `npx playwright install chromium`.
The test server listens on port 4173 unless `E2E_PORT` names another, so several runs can share a machine.

`npm run test:coverage` reports coverage for `src/config.js` and `src/stack.js` (text in the terminal, HTML in `coverage/`, uploaded by CI). Today: 98.82% of statements
over the two files (`config.js` 98.21%, `stack.js` 100%). The two files are imported by their tests like any module.

`npm run test:visual` runs the screenshot project against the baselines in `test/e2e/__screenshots__/`, and only ever inside the Playwright image
(Linux arm64, as in CI): compare with `test:visual:docker` or `test:visual:container` (Apple's `container`, after `container system start`), rewrite with
`test:visual:update` or `test:visual:update:container`. Baselines are only ever regenerated through the Docker or container script, never on the bare host.
The scripts build `dist/` on your machine and only run Playwright inside Linux, because Vite's native bundler is installed for your platform, not for Linux's.

> Screenshots under `test/e2e/__screenshots__/` are the reference for how the panel looks. A pull request that changes one either fixes the code or regenerates the baseline with `npm run test:visual:update` and says in its changelog entry which screens changed and why. Pull requests that only restructure code must not change a baseline.

Run `npm run changeset` in every pull request that changes what the household sees.
Pick patch, minor or major.
Write the changelog line as one paragraph, a sentence about what the household sees (one paragraph keeps the list tight), and never edit `package.json`'s version or `CHANGELOG.md` by hand.
A bot runs `npm run version-packages` on a release branch and keeps one "Release" pull request open. Merging the Release pull request publishes the release.
The release workflow (`.github/workflows/release.yml`, on every push to `main`) then builds that version, tags it `v<version>` and creates the GitHub release with the changelog section as its notes and `home-panel.zip` attached; never tag by hand.
If the run that the Release pull request's merge starts fails, re-run that failed run; do not push another commit to `main` first, because the next push would publish that version from the later commit.
That needs the repository setting "Allow GitHub Actions to create and approve pull requests" on, and because the Release pull request is opened with `GITHUB_TOKEN` it gets no CI checks of its own; they run on `main` after the merge.
The `changeset` CI job (`.github/workflows/changeset.yml` lists the paths it watches) fails a pull request that changes what ships without a changeset; pull requests that only change documentation, tests or CI pass without one, and the `no-changeset` label skips the job when a watched path changed without a release note (a devDependency bump, say).

Renovate (`renovate.json`) opens pull requests weekly, on Monday mornings: the npm minor and patch updates in one, the GitHub Actions in another.
Playwright (the npm package and the Docker image tag together) and lock-file maintenance come monthly, each in its own pull request.
Pull requests that touch devDependencies, Actions or the image tag carry the `no-changeset` label; lock-file maintenance needs none.
Renovate does not re-record screenshots: a person pushes the re-recorded baselines to the Renovate Playwright branch (`npm run test:visual:update`, or its `:container` variant) before it can merge.
Every `uses:` in `.github/workflows/` is pinned to a commit with its version in a comment (Renovate keeps both current), each workflow declares its `permissions:` at the top, and `.github/workflows/codeql.yml` runs CodeQL on pushes to `main`, on pull requests and weekly.
`test/unit/workflows.test.mjs` fails a workflow that breaks the first two rules.

`npm run build` builds `dist/home-panel.js` with Vite from the ES modules under `src/`, minified, with a source map beside it; `npm run dev` rebuilds on save.
`npm run size` checks the main chunk against its budget: its gzipped size (as `size-limit` counts it) must stay under the `size-limit` limit in `package.json`,
and CI fails the pull request that goes over. The budget is the size of the first minified build plus 10 percent, rounded up to the kilobyte.
It may be lowered at any time; raising it needs a changeset that says why.

The source is ES modules under `src/`, built by Vite (`vite.config.ts`). `src/main.js` is the entry and defines the custom element; the `HomePanel` class is in `src/home-panel.js`, with the
Automations tab (`src/auto.js`), the configuration code (`src/config.js`), the smart-stack rules (`src/stack.js`), the French translations
(`src/i18n/fr.js`) and the stylesheet (`src/styles.js`, which joins the files in `src/css/`) imported from it. `src/legacy/globals.js` holds the state
and helpers those files used to share as globals; it goes away in the refactor's second phase. Mermaid is installed from npm and built into lazy chunks
under `dist/chunks/`, which the Automations tab imports when it opens; the libraries still in `vendor/` are copied next to the bundle and loaded when a
tab needs them.
`npm run typecheck` runs `tsc` twice: `tsconfig.check.json` checks the pure modules (`config.js`, `stack.js`) strictly, and `tsconfig.legacy.json` checks every
file under `src/` without `strict`, so a name that does not exist or an import that does not resolve is an error while the untyped class is tolerated.
`src/legacy/dom-scaffolding.d.ts` holds the ambient declarations that second pass needs (only `tsconfig.legacy.json` lists it); the refactor's second phase deletes it.
The source map points a stack trace or the browser's DevTools back at the files in `src/`; it ships in the release zip next to `home-panel.js`.
The test house in `test/e2e/harness.html` is made up. Keep real names, addresses and entity IDs out of the repository:
`npm test` fails if it finds some of them.

## Credits

The colour palette comes from [Origami](https://github.com/hazymorning/origami) by hazymorning.
Charts are drawn by [ApexCharts](https://apexcharts.com), maps by [Leaflet](https://leafletjs.com) and automation flows by
[Mermaid](https://mermaid.js.org). Their licences are in [vendor/LICENSES.md](vendor/LICENSES.md).

## Licence

MIT, see [LICENSE](LICENSE).
