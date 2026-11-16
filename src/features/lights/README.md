# Lights

What the Lights tab reads and computes ([spec 23](../../../docs/specs/23-lights.md)): the house's lights grouped into one tile per area, the Adaptive Lighting switch that runs each, the linked rooms and the order an admin saved, what a tile's lights are doing, and the Adaptive Lighting strip. This folder holds the pure half of the first move (#258); the model and the system data (#259), the commands (#261), the pane and the tiles (#260), the sheet (#262) and Arrange (#263) follow.

## The folder

```
src/core/
  fold.ts                  fold(text): case and accents dropped, for comparing names
  color.ts                 gains kelvinRGB(kelvin): a colour temperature as the white it looks like
src/providers/
  light-areas.ts           lightAreas(states, registries, names, config): LightArea[]; lightGroups(states); shortNames(names)
  adaptive-lighting.ts     alSwitches(states); adaptiveSwitch(area, states, registries, alAreas); alMode(area, switchId, states): AlMode;
                           alCurve(configurations, sun); curveKelvin(curve, t); hasManualControlService(services)
src/features/lights/
  README.md
  ids.ts                   lightIds(store): every light, the Adaptive Lighting switches and their sleep modes, the config pairs' switches
  inputs.ts                readLights(states, registries, names, config, systemData): the tiles, linked and ordered, and the pairs
  order.ts                 linkPairs(systemData, configLinks, states); applyLinks(tiles, pairs); applyOrder(tiles, order)
  state.ts                 areaState(area, states): AreaState; tintOf(on, states)
  al-strip-layout.ts       alStripLayout(curve, now, fmt): the gradient's stops, now, the sun's marks, the hours
```

## The tiles

Every `light.*` sits in its entity's area, else its device's. A light group (a light with an `entity_id` list) owns its members: the group gives the area (its own, else its first member's), and the members are what the tile switches; a light in two groups belongs to the first. A tile's buttons (`units`) are its groups and its loose lights, by name, and `labels` are their names without the words they all share. A diagnostic or config light is left out, and a hidden one unless a group owns it (hidden members are the usual way to tidy a group). An area listed in `split_light_areas` gives one tile per button, kept together where the area sorts; the lights with no area share the Other tile, last, which the provider leaves unnamed (`area` and `name` are `''`) for the model to word.

## Adaptive Lighting

The integration's switches are `switch.adaptive_lighting_<name>` without the `_sleep_mode`, `_adapt_color` and `_adapt_brightness` twins. The switch that runs a tile is found by four rules, each winning over the next: a switch whose lights (`configured_lights`, else its `configuration.lights`, a group with its members) include one of the area's lights (`areaLights`, so a split tile keeps its area's switch); the switch the config's `adaptive_lighting_areas` names for the area, when it exists; a switch the registry places in the area; a switch whose instance name (its name without "Adaptive Lighting:", folded) is in the name of a light group the registry places in the area. The second rule is there because the integration hides its light list unless `include_config_in_attributes` is on.

The mode is the room's: **Auto** while the switch is on and none of the tile's lights or buttons is in its `manual_control` list; **Night** while its sleep-mode twin is on as well; **Manual** for a tile with a switch otherwise; none without one. `hasManualControlService` says whether the house can take a room off Auto by `adaptive_lighting.set_manual_control` rather than by switching it off.

The strip draws today's curve as Adaptive Lighting does: the warmest colour temperature (the lowest `min_color_temp` of the switches, 2000 K unset) at sunrise, sunset and all night, the coolest (the highest `max_color_temp`, 5500 K unset) at solar noon, a parabola between. `alStripLayout` turns it into 49 half-hour stops over the local day (a night stop mixed 35 percent into the card's colour), the now mark, the sun's marks and the four hours, each a percentage.

## Linked rooms and the order

The pairs in force are the system data's `light_links` once someone has picked a partner in a sheet, else the config's `light_links`, a pair with a switch counting while it is on. A pair's key is a tile's key, else one of its buttons or lights. `applyLinks` moves the second tile of a pair beside the first and marks both; a room in two pairs keeps the first. `applyOrder` sorts by the system data's `light_order`, a pair as one unit under its first tile's key, a tile the order does not name after the named ones; no order leaves the tiles by area.

## What a tile's lights are doing

`areaState` is the lit lights, whether any light answers, the mean brightness in percent (at least 1 while one is on), the colour-temperature range in 50 K steps (the overlap of the tunable bulbs' ranges, 2000 to 6500 K where they give none; none when they do not overlap) with the lit bulbs' mean or the range's middle, and the tint: the first lit light's `rgb_color` when it is in a colour mode, else its colour temperature through `kelvinRGB`.
