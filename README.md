# Home panel for Home Assistant

A dashboard for a tablet on the wall and for your phone, installed as its own page in the Home Assistant sidebar.
It covers energy, climate, lights, weather, the car, air quality, media, security and a timeline of your automations.
It follows the sun between a light and a dark theme, has a frosted-glass look with animated wallpapers, and speaks French
to users whose Home Assistant profile is in French.

![Home tab on a tablet](docs/tablet-home.png)

| Phone | Climate, dark theme |
|---|---|
| ![Home tab on a phone](docs/phone-home.png) | ![Climate tab](docs/tablet-climate-dark.png) |

It's mostly for monitoring. You can control lights, scenes, thermostats, media players, the EV charger and a FordPass car.

## What it uses

Every section is optional. A section shows only when its entities exist, so a house without a car never sees a Car tab.

| Section | Works with |
|---|---|
| Weather | any `weather` entity. Environment Canada's extra sensors are found automatically. The radar needs [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card) from HACS |
| Climate | every `climate` entity, with temperature, setpoint and power history from sensors named like Hilo's (`sensor.<thermostat>_temperature`, `_target_temperature`, `_power`), or set per room |
| Lights | one dimmer row per area: slide the row to dim, tap the bulb to switch, tap the row for colour; with [Adaptive Lighting](https://github.com/basnijholt/adaptive-lighting) Auto and Night when installed |
| Energy | a whole-house power sensor, a water heater, an EV charger, [Hilo](https://github.com/dvd-dev/hilo) rates and Hydro-Québec peaks |
| Car | the [FordPass](https://github.com/itchannel/fordpass-ha) integration |
| Air | Mila purifiers and air sensors |
| Security | door, window and motion sensors, UniFi Protect cameras |
| Media | TVs (Wake-on-LAN), speakers |
| Automations | your automations' own traces, drawn as flow charts |

## Install

1. Download `home-panel.zip` from the [latest release](../../releases/latest), or build it yourself (below).
2. Unzip it into `<config>/www/home-panel/`, so that `home-panel.js` sits at `<config>/www/home-panel/home-panel.js`.
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

| Card | When it shows |
| --- | --- |
| A door open (red, stays until the door closes) | A door sensor open for 5 minutes or more |
| Lights unreachable (red, stays until fixed) | Any light unavailable for 5 minutes |
| Weather warning (amber) | Environment Canada issues a warning |
| Car not plugged in (amber) | After 9 pm, the car home, unplugged and under 40% |
| Presence not updating (amber) | A person's iCloud tracker hasn't updated in 3 hours |
| Sunrise | The hour before sunrise, with the rooms whose lights are still on |
| Reminders | Before each time listed under `idle_stack.reminders` |
| Critical peak | A Hydro-Québec critical peak or a Hilo challenge |
| Now playing | A speaker is playing |
| Who's home | 30 minutes after someone arrives or leaves |
| Today | 6 to 11 am, today's events from your calendar entities |
| Away | The `away_mode` input_boolean is on |
| Room air | A purifier's room reads poor (CO₂, particles, VOC) |
| Tomorrow | From 5 pm, tomorrow's forecast |
| Car charge | 9 pm to 7 am, while the car is plugged in at home |
| Energy today, who's home | In the daytime, when nothing else applies |

Red cards stay on screen alone, and amber cards come first in the rotation. No card reads camera motion.

```yaml
      idle_stack:
        sunrise_lights_off: true
        reminders:
          - {at: "20:00", title: Bedtime, text: The kids' lamp goes to night mode, lead: 30}
```

Room icons can be `sofa`, `door`, `desk`, `bed`, `bath`, `drop`, `car`, `house` and `therm`.

## Develop

You need Node 20 or later.

```sh
npm ci
npm run build          # dist/home-panel.js plus the vendored libraries
npm test               # unit tests: config, build, French, a scan for personal data
npm run test:e2e       # builds, then runs the Playwright suite
npm run test:visual:docker           # compares every tab with its screenshot baseline, inside Docker
npm run test:visual:update           # records new baselines, inside Docker
npm run test:visual:container        # the same two, through Apple's `container` CLI (container system start)
npm run test:visual:update:container
```

`npm run test:e2e` builds, then runs the Playwright suite (the tablet and phone projects, not the screenshots) against the made-up house;
`npm run test:e2e -- test/e2e/lights-sheet.spec.ts` runs one file. The first run needs a browser: `npx playwright install chromium`.
The test server listens on port 4173 unless `E2E_PORT` names another, so several runs can share a machine.

Screenshots are compared with baselines in `test/e2e/__screenshots__/`. They are rendered in the Playwright image for the pinned
version (Linux arm64, which is also what CI runs on), so fonts and anti-aliasing match everywhere: `npm run test:visual:docker` (or
`:container`) compares, `npm run test:visual:update` (or `:container`) rewrites them. Run the one for the tool you have: Docker Desktop, or
Apple's `container` after `container system start`. Baselines are only ever regenerated through the Docker or container script, never on the bare host.

The source is one custom element in `src/home-panel.src.js`. `build.mjs` splices in the CSS (`src/css/`), the French
translations (`src/i18n/`), the Automations tab (`src/auto.js`) and the configuration code (`src/config.js`).
The test house in `test/e2e/harness.html` is made up. Keep real names, addresses and entity IDs out of the repository:
`npm test` fails if it finds some of them.

## Credits

The colour palette comes from [Origami](https://github.com/hazymorning/origami) by hazymorning.
Charts are drawn by [ApexCharts](https://apexcharts.com), maps by [Leaflet](https://leafletjs.com) and automation flows by
[Mermaid](https://mermaid.js.org). Their licences are in [vendor/LICENSES.md](vendor/LICENSES.md).

## Licence

MIT, see [LICENSE](LICENSE).
