# Changelog

## 2.5.0

- Smart stack on the idle clock: one card beside the clock (under it on a portrait screen) that follows the moment. It covers tomorrow's weather in the evening, the car charging overnight, who just came home, the hour before sunrise, reminders, critical peaks, now playing, today's calendar, Away, poor room air and energy used today. A door left open or lights that stop answering pin a red card until fixed, and a weather warning, an unplugged car low at night or a frozen iCloud tracker go first in amber. Cards take turns every 20 seconds, and a tap opens what the card is about. New options: `idle_stack` (`enabled`, `sunrise_lights_off`, `reminders`) and `entities.away_mode`.

## 2.3.0

- New `light_links` option: two light cards that move together. While linked, the switch, brightness and colour of either card reach both, and the cards are drawn as one with the other card's name in each subtitle. On a tablet, a chain button on the seam links and unlinks them; on a phone, a switch in the light's sheet does. Linking copies the tapped card's lights onto the other card. The state lives in an `input_boolean`, so every screen agrees.

## 2.2.0

- The idle clock shows an icon for the current outdoor condition (sunny, rain, snow and so on) beside the time, using the same condition and day or night icon as the Weather tab. It's left out when the weather entity is unavailable.

## 2.1.0

- New `split_light_areas` option: the areas it lists show one light card per light group (or per light outside a group) instead of one card for the whole area. The cards keep the area's Adaptive Lighting Auto and Night buttons and stay together in the list.

## 2.0.0 (unreleased)

The panel moves out of a personal configuration repository into its own project.

- Everything that belonged to one house now comes from the panel's `config:` block or is found automatically: entities, rooms, people, scenes, routine switches, Adaptive Lighting areas, the house picture and the car's name and colour.
- Sections without their entities stay hidden: the water heater and Hilo cards, the Car and Climate tabs and the heat pump row.
- The time zone and location come from Home Assistant, with no built-in fallback city.
- `[hidden]` always hides, so an invisible overlay can't block taps again.
- A chart with nothing to draw no longer breaks the Climate tab.
- The TV card's power and mute buttons work again (from 1.19.9), and a test now fails on any call to a method that no longer exists.
- History that was loading when the config changed is thrown away instead of being shown.
- A Node build (`build.mjs`), unit tests, a browser smoke test, CI and tagged releases.

Before 2.0.0, versions 1.0 to 1.19.9 lived in a private repository.
