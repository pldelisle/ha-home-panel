# 0039: Room views: a descriptor's room part, a route string and a Rooms group in the sidebar

Status: accepted (2026-11-18)

## Context

The panel shows the house by subject: one tab each for Lights, Climate, Air and the rest. Apple Home on the iPad also shows it by room: a row for each room in its sidebar, and a tap shows everything the house has there. The household asked for the same. A room is a Home Assistant area, and which subjects have something in an area is a fact only each subject knows, so the shell cannot build a room view itself (ADR 0017: the shell composes at the root and a feature never imports another).

## Decision

- **A room plug-in on the descriptor.** `FeatureDescriptor` gains an optional `room` part (`src/ui/feature.ts`): `areas(env)` lists the areas the subject has a tile in, `part(env, areaId)` draws its tiles for one of them, and `chip(env, areaId)` may give a short reading for the room's header (Air's gives the room's humidity: the mean of its purifiers' readings, rounded). The shell asks a feature nothing else about rooms. `FeatureEnv` gains `room`, the area of the room view shown or null.
- **Which rooms.** Every area that at least one shown descriptor lists in `room.areas`, once, named by the name resolver and sorted by that name with the locale's collation (`roomList`, `src/shell/rooms.ts`). An area with no tile is not a room, and the Lights tab's Other tile (no area) is never one. The list is asked again on every change, as `available` is, and the sidebar is drawn again only when the ids or the names moved.
- **The route is a string.** The `tab` setting may hold `room:<area_id>` (`parseView`, `roomTab`). A room that has no tile any more, or an area the house does not have, shows Home, as a hidden tab does; the setting keeps the string, so the room comes back with its tiles. Selecting a room remembers it as a tab is remembered. `TabSelectEvent` may carry `room`.
- **The room pane.** One `<section class="pane pane-room" id="pane-room">` holds `<hp-room-pane>`, drawn only while a room shows. Its header is the room's name with `guessIcon` of the name and Home's colour; below it come one section per subject with a room part, in registry order, each with the subject's title as a small heading and the feature's own element. A subject with nothing in the room draws no section. A room that has lost its last tile leaves the list on the same change and the view returns to Home (`visibleView`); there is no empty room view.
- **Where it shows.** Here, in the Liquid Glass tablet's sidebar (ADR 0038's gate): a Rooms heading and one row per room after the categories, rows of the same tablist (`role="tab"`, `data-room`), so the keyboard walks sections then rooms. The tablist, not the rail, scrolls when the rows outgrow the height. The phone's bar and Material's rail get their entry in a later ticket of the epic (#512).
- **Sheets over a room.** A tile in a room asks for its subject's sheet as it does in the pane. The subject's pane stays in the page behind the sheet (`overSheets`, and `detailSheet` while a room shows, on a tablet too), and the sheet host opens a detail sheet over the screen instead of changing the tab. A pane behind a sheet that is not its tab listens only while the sheet is open and draws the sheet alone.
- **Lights is the first part.** `<hp-lights-room>` draws the room's tiles with the same `<hp-light-tile>`s, a split area's several and a linked pair side by side when both are in the room; the bulb switches the room through the commands the Lights pane uses, lifted into `LightsCommands`.
- **Climate is the second part.** `<hp-climate-room>` draws the room's thermostat as the Climate tab's phone tile (`climateTile`, worded by `climateItems`), and the chip is the room's temperature. A tap asks for the tab's detail on that room; the pane gets `over` while a room shows and draws the sheet over the screen on a tablet, as it does on a phone.

## Consequences

- A subject joins the room views by adding a `room` part to its descriptor; the shell, the sidebar and the route do not change.
- The room pane listens to every change to know which parts still have tiles: one `areas` call for each subject on each change while a room shows.
- Every Liquid Glass tablet baseline of a house with lights now shows the Rooms group in the sidebar: the room icons under the sections in the strip, the heading and the names when it is open. Material and phone baselines are unchanged.
- The Rooms rows are `.rtab` buttons, so a spec that counts the sections' rows names `.rtab:not(.rroom)`.

## Read

Apple Human Interface Guidelines, Sidebars; WAI-ARIA Authoring Practices, Tabs; ADR 0017 (compose at the root), ADR 0021 (the sheet host), ADR 0038 (the sidebar).
