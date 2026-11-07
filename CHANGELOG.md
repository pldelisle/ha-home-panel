# Changelog

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
