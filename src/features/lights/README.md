# Lights

What the Lights tab reads and computes ([spec 23](../../../docs/specs/23-lights.md)): the house's lights grouped into one tile per area, the Adaptive Lighting switch that runs each, the linked rooms and the order an admin saved, what a tile's lights are doing, and the Adaptive Lighting strip. This folder holds the pure half of the first move (#258), the model (#259), the commands (#261), the pane with its tiles (#260), the room's sheet (#262) and Arrange's move into the kit (#263).

## The folder

```
src/core/
  fold.ts                  fold(text): case and accents dropped, for comparing names
  color.ts                 gains kelvinRGB(kelvin): a colour temperature as the white it looks like
src/providers/
  light-areas.ts           lightAreas(states, registries, names, config): LightArea[]; lightGroups(states); shortNames(names)
  adaptive-lighting.ts     alSwitches(states); adaptiveSwitch(area, states, registries, alAreas); alMode(area, switchId, states): AlMode;
                           sleepSwitchOf(id); alCurve(configurations, sun) (null with no switch); curveKelvin(curve, t); hasManualControlService(services)
src/features/lights/
  README.md
  ids.ts                   lightIds(store): every light, the Adaptive Lighting switches and their sleep modes, the config pairs' switches
  inputs.ts                readLights(states, registries, names, config, systemData): the tiles, linked and ordered, each with its state,
                           mode, switches and bulbs; the pairs, the saved order and the house's Adaptive Lighting
  model.ts                 lightsModel(inputs, deps): the pane's line, the card, the tiles, the strip, the Arrange bar;
                           sheetModel(key, inputs, deps): a room's sheet and its "Link with" picker
  order.ts                 linkPairs(systemData, configLinks, states); applyLinks(tiles, pairs); applyOrder(tiles, order)
  state.ts                 areaState(area, states): AreaState; tintOf(on, states)
  al-strip-layout.ts       alStripLayout(curve, now, fmt): the gradient's stops, now, the sun's marks, the hours
  commands.ts              pairOf, allOff, toggleOne, toggleArea, isAuto, setAuto, isNight, setNight, setBrightness, setColorTemp, link:
                           each intent as the service calls to run, in order (CommandRunner.runAll runs them)
  index.ts                 lightsFeature: the registry's descriptor (on the phone's bar, so no More word)
  lights-pane.ts           <hp-lights-pane>: the header with Arrange and Reset order, the strip, the rows or the phone's grid, a pair
                           side by side; runs the commands and saves the order and the links
  light-tile.ts            <hp-light-tile>: one room; the bulb asks the pane to switch it (`area-toggle`), the rest opens its sheet
  sheets.ts                ROOM_SHEET ('lights.room'), the room sheet's id, and roomKeyOf(detail): the room it is asked to show
  light-sheet.ts           <hp-light-sheet>: a room's sheet: power and Done, the two pills, Auto and Night, the bulbs, Linked with
  light-slider.ts          <hp-light-slider>: one tall pill; the finger's height is the value, sent once on release
  link-picker.ts           <hp-link-picker>: the "Link with" list, None and every other room as radios, with Back
  sheet-rows.css           the sheet's grouped rows (an iOS inset list), which the sheet and the picker both adopt
  al-strip.ts              <hp-al-strip>: the Adaptive Lighting card and its strip
  *.element.css            each element's own rules, moved from the legacy sheets
src/ui/
  commands.ts              CommandRunner gains runAll(cmds): a list in order, stopped at a failure
  icons.ts                 gains chev, grip, link (#260) and chevl, lsun, lpow, lsnow, lflame (#262)
src/ui/controllers/
  system-data.ts           SystemDataController(host, deps, key): one key of the house's frontend system data, read and written through
  store-controller.ts      gains `held` and `release()`: a change while held waits, and the release draws it once (#262)
  drag-reorder.ts          DragReorderController(host, {enabled, keys, keyOf, onReorder}): the kit's drag and drop, Arrange's (#263)
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

## The model and the system data

`lightsModel(inputs, deps)` words what the pane shows: its line (the lit lights and how many Adaptive Lighting switches are on, or how to drag while arranging), the card's title and right-hand words, the phone's line when the house has no light, the All off button, one `TileView` per tile (its line, short on a phone, its accessible name, its tint and its place in a pair), the strip (`null` without a switch: the live kelvin of the first lit switch, else the curve's at now) and the Arrange bar (an admin's, with two units or more; Reset while arranging a saved order). `sheetModel(key, inputs, deps)` words a room's sheet: the power button, the brightness and colour sliders (the colour's words are Night's, else warm to 3000 K, cool from 5000 K, neutral between), the Auto and Night rows from the switches' readings, the chips for a room of two buttons or more, the Linked with row (an admin's to change) and the picker, which says who a room is now with. Its `deps` carry the clock, the sun, the screen and whether the viewer is an admin, so the model reads none of them.

The order and the links are one key, `home_panel`, of Home Assistant's frontend system data: one value for every screen, which only an admin may write. `SystemDataController` reads it with `stale: false` (the value does not depend on the config) when the config changes and each time the pane is shown, since another screen may have rearranged meanwhile; `set(patch)` changes the value at once, tells the host and saves it, and a refused save puts the old value back and rejects, for the caller's toast.

## The pane

`<hp-lights-pane>` reads the tiles with `readLights` over its store controller (the lights and their switches only, paused while another tab is shown) and the system data, and `lightsModel` words them; the template places each unit (a room, or a linked pair drawn as two tiles side by side) keyed by its first tile. A bulb's `area-toggle` runs `toggleArea` on the room's pair, All off runs `allOff`, and a tap elsewhere on a tile asks for the room's sheet with its key (`SheetRequestEvent('lights.room', {key})`). While an admin arranges (the kit's `DragReorderController`, enabled while `editing`), the units jiggle, a drag moves one (the unit under the pointer gives way and the page scrolls near the edges), an arrow key moves the focused one, and the order is saved when it changed; taps neither switch nor open.

## The sheet

The sheet is over the screen (`overSheets`): the descriptor binds the room the sheet host was asked for to the pane's `roomKey`, and the pane, the system data's one owner, words it with `sheetModel` and draws `<hp-light-sheet>` while it is set; Escape, the scrim, Done and the phone's swipe close it through the host (`SheetDismissEvent`), and Done takes focus as it opens. The sheet draws the kit's chrome (`sheet.css`: the scrim, the panel, the grabber, the header) itself rather than `<hp-sheet>`, because that element's badge and ✕ cannot be the power button and the Done of the sheet as it looks; a room the house no longer lists closes it. What it asks comes back to the pane as events: the power button's `area-toggle`, a pill's `slider-change`, the Auto and Night rows' and the chips' `sheet-intent` (the pane turns Auto or Night the other way from what the pair is in, as the legacy panel did), and the picker's `link-pick`, which saves the pairs and then sends the copy calls without waiting for the save's answer.

A pill (`<hp-light-slider>`) captures the pointer: the finger's height is the value (the top is the most; brightness in whole percent, colour in 50 K steps between the room's range), painted by the pill itself while the finger moves, and sent once on release; a cancel sends nothing, and an arrow key steps ten percent or 100 K and sends at once. Meanwhile the pane's store controller is **held**: a change of the house waits, and 60 ms after the release (the legacy settle) one update draws what came, so nothing moves the pill under the finger. "Linked with" pushes `<hp-link-picker>` in the body's place: Back takes focus, and Back gives it to the Linked with row again; a pick leaves the list up with its check mark moved, as the legacy sheet did.

## The commands

Each intent is a pure function returning the calls to run, in order, which the element hands to `CommandRunner.runAll`: it sends each after the last was accepted, stops at a failure (releasing the list's holds and saying why) and says the last `done` once. A linked pair acts as one room (`pairOf`). The rules are the legacy `lightCmd`'s: a tile's bulb switches the pair off when the tile's own lights are on; **Auto on** turns each switch on when it is off and, when the house has `adaptive_lighting.set_manual_control`, lets go of the lights held by hand, and **Auto off** turns the switch off and Night with it; **Night on** turns each sleep mode on and hands the room back to Auto, **Night off** only turns it off. **By hand**, a room under Auto or Night first leaves it (Night off, then its lights held by hand, or the switch off without the service, and the toast "Set by hand, Auto off"), then the brightness goes to the lit lights (all of them when none is lit), or all of them off under one percent, and a colour temperature only to the lights that take one. **Linking** returns the pairs to save (the two rooms' old pairs gone), the toast to say once they are saved, and the calls that make a new partner match: dark when this room is, else at this room's brightness, with its colour temperature too when it was set by hand. None of the commands holds a value: like the legacy panel, a tap waits for Home Assistant's reply.
