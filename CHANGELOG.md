# Changelog

## 2.14.1

- The Auto theme now follows your phone or tablet's own light or dark setting, as it changes, instead of the sun. Choose Dark or Light to keep one. The Sky wallpaper still follows the sun. The page behind the panel keeps the wallpaper colour when the panel returns to the page. The little caption under Auto will say it follows the device in a following update.
- The little caption under Auto in the settings now says it follows the device, matching what Auto has done since the last update.
- Labels and roles tidied for screen readers; nothing visible changes.
- Internal tidying of the panel's frame. Nothing visible changes.
- Internal rewiring of the phone's More list. Nothing visible changes.
- Internal rewiring of the idle clock's timer. Nothing visible changes.
- Internal rewiring of the panel's frame. Nothing visible changes.
- Internal rewiring of the phone's More list. Nothing visible changes.
- Internal rewiring of the pane headings. Nothing visible changes.
- Internal rewiring of the panel's tabs. One change: a remembered tab this house has nothing for opens Home instead of an empty pane.
- The settings popup is redrawn with the same look. Nothing visible changes.
- Internal rewiring of the panel's sheets. Nothing looks different. One thing behaves differently: opening a sheet now closes the one already open, so the More list closes when a sheet opens over it by keyboard.
- The weather details are redrawn with the same look; they are now an element of their own, with a chart element the later tabs will share. Two small differences you can see: in a house with only a weather entity (no Environment Canada sensors) the details now show the wind, humidity and pressure that entity knows, where they showed dashes, and the dot for the temperature now on the days appears once a forecast arrives; and the hover text of the charts and the hour labels of the next 24 hours write the time as the rest of the panel does ("4 pm", "16 h").
- Internal tidying of the weather history calculations. Nothing visible changes.
- The weather history views are redrawn with the same look. Nothing visible changes, except that a tile's history now always opens on the week (it used to open on the range you chose last).
- The Weather tab on the phone is redrawn: the summary card, its forecast days and the eight tiles keep the same look. One thing you can see changes: a house with only a weather entity, and no Environment Canada sensors, now shows the wind, the humidity and the pressure that entity knows, where those tiles showed dashes. The tablet's Weather tab looks the same.
- Internal tidying of the weather calculations. Nothing visible changes.

## 2.14.0

- A typo in the panel's configuration now shows admins a card on the Home tab naming the setting and, when it can, the spelling meant. The rest of the panel keeps working with what it understood.
- The panel's configuration is now read by one schema that also types it. Nothing visible changes for a valid configuration.

## 2.13.0

- Room, light and scene names now follow the panel's language: a room Home Assistant calls Salon reads Living room in English, and `names:` in the config sets a name per language.
- Every request the panel makes to Home Assistant now goes through one typed door, so a change in Home Assistant is caught at build time. Nothing visible changes.
- The panel's own wording now lives in message catalogs with French checked at build time. Nothing visible changes.
- Dates, times and numbers are now formatted in one place. Nothing visible changes.
- Two panels on one page no longer share rooms or entities. Nothing visible changes.
- The panel keeps its house in one place inside each copy of itself, ready for the next steps of the rewrite. Nothing visible changes.
- Internal rewiring of the panel's house settings. Nothing visible changes.
- Internal rewiring of how the panel reads Home Assistant. Nothing visible changes.
- Internal rewiring of the panel's settings and French layer. Nothing visible changes.
- The weather history sheet draws its charts again; it had been saying the sensor was missing.

## 2.12.0

- This release makes the panel modern-browser only (Safari and iOS 26, current Chrome, Edge and Firefox) and changes how it is packaged: the release now has a `chunks/` folder, a `fonts/` folder and compressed copies of the scripts, so when updating by hand replace the whole `home-panel` folder rather than one file.
- Charts now load from the ApexCharts package instead of a copied file; nothing visible changes.
- The charts' stylesheet was packed twice into the charts download; it is packed once now, so the first tab with a chart loads about 13 KB less. Nothing looks different.
- The attention pill in the header no longer draws a square tinted box behind its warning mark when the glass look is on; the mark is the same round badge as in the solid look. The Status checks screenshot was re-recorded.
- The Montserrat font now ships with the panel, so tablets no longer call Google and the font works offline. Screenshots were re-recorded with it; the layout is unchanged. When updating by hand, copy the new fonts/ folder too.
- In French, the line under a camera's name in its sheet now reads "dernier mouvement il y a 5 min" instead of "last : mouvement il y a 5 min", a camera that is recording says "Enregistrement", and an offline camera's note is in French too.
- The copied Leaflet files, which the panel never used, are no longer shipped; the licence list is now generated. When updating by hand, leaflet.js and leaflet.css can be deleted.
- In French, a sensor's low-battery note, the empty Cameras card's explanation, a motion older than a day on a camera tile, and the Home tab's "kWh today" and "rate unknown" fragments are now in French. The French Home and Security screenshots were re-recorded.
- In a house without thermostats, a car, a water heater or Hilo, their tiles no longer flash up while the panel loads or come back after a change (on a phone, the Energy screen's Water heater and Hilo rows too). The tablet screenshot of the bare test house's Home was re-recorded: the old one had captured the Air and Water heater tiles after that flash had moved them.
- Versions and the changelog are now produced by Changesets; each pull request states its change.
- The panel is now built for Safari 26, iOS 26 and current Chrome, Edge and Firefox; older browsers are no longer supported. Nothing looks or behaves differently on a supported browser, and the download is a few hundred bytes smaller.
- Labels that were cut off with "…" now show in full. On a phone, a light tile's name wraps to a second line ("Living room"), and the Home tab's Security line wraps to two lines in French. A light tile's sub-line ("2 of 3 on · 59% · 3000 K") wraps to a second line on a tablet and up to three on a phone, and the phone no longer lists the colour temperature there (the tablet and the light's sheet still do). The Home tab's tile values are a little smaller (24 px on a phone, 32 px on a tablet), so "4 allumées" fits. In French, a light tile now reads "2 sur 3 allumées" instead of the half-English "2 of 3 : activé", a scene reads "Il y a 2 h" instead of "Lancée il y a 2 h" and "Lancer" instead of "Toucher pour lancer", and the music card on the tablet's Home tab and on the idle screen says "En lecture".
- The library that draws the automation flow charts was updated (Mermaid 11.4 to 11.17), which brings its security fixes. The flow charts may look very slightly different along the edges of the boxes and arrows; the four Automations screenshots were re-recorded. The new library is larger, so the first time the Automations tab draws a flow it loads about 200 KB more (35 KB more when compressed). An automation step whose name has text between double dollar signs (like $$this$$) now shows it as typed instead of turning it into a formula.
- Automation flow charts now load from the Mermaid package instead of a copied file. When updating by hand, copy the whole release (with its chunks/ folder), not only home-panel.js; mermaid.min.js can be deleted.
- In the Automations flow charts, a percent sign at the end of a step's name or of a choice label now shows as "%" instead of "#37", and a "#" followed by digits shows as typed.
- The panel's stylesheet is now minified for current browsers (Safari and iOS 26, Chrome, Edge, Firefox), so the panel is about 40 KB smaller (7 KB when compressed); nothing visible changes.
- The release zip now carries a compressed copy of each script beside it. Home Assistant sends that copy to browsers that accept it, so the code behind the Automations flow charts arrives about four times smaller (about 200 KB instead of 770 KB), which shows on a slow connection. When installing by hand, replace the whole `home-panel` folder rather than one file.
- With Reduce Motion on, sheets on the phone now appear at once instead of sliding up.
- With Reduce Motion turned on in the device's settings, tabs, buttons and tiles no longer fade, shrink or slide when tapped: they change in one step, as the rest of the panel already does under that setting. Nothing looks different once the tap is done.
- With Reduce Transparency turned on in the device's settings, the header's tinted pills (the Hilo challenge, the attention pill) are now solid like the plain pill, instead of staying see-through over the wallpaper.
- In French, the Security card's line under its title no longer mixes English and French or shows a stray colon ("all doors closed · : mouvement en cours" becomes "toutes les portes fermées · mouvement en cours"). The French Home and Security screenshots were re-recorded.
- The panel's build is now size-checked and fully type-checked behind the scenes; nothing visible changes.
- The panel is now built with Vite from ES modules, minified, with source maps. Nothing visible changes.

## 2.11.1

- Linked rooms are two ordinary tiles again, each with its own rounded corners, instead of one glued card. They still sit side by side so Arrange moves them together, and each tile's subtitle names its partner.
- Light tiles show a chevron (and a ring under a mouse) so it is clear that a tap opens the room's sheet.

## 2.11.0

- On a tablet, the Home card fills the space under Who's home with the smart stack from the idle clock. It shows the same cards in the same 20-second turns, such as a door left open, the car charging overnight, energy used today or what's playing, with dots for how many there are. A tap opens what the card is about. Who's home is listed right above it, so the who's-home filler card is left out there. With nothing to show, the slot hides. `idle_stack: {enabled: false}` turns this off too.

## 2.10.0

- The Lights tab's sideways dimmer rows are gone. Each room is a tile in the style of Apple's Home app, four to a row on a tablet and two on a phone: the bulb switches the room and the rest of the tile opens it. The tile is bright while the room is on, tinted with its colour, and says its brightness and whether Auto, Night or Manual is in charge.
- The room's sheet has two tall sliders side by side, brightness and colour temperature (warm at the bottom, cool at the top, within what the bulbs can do). Drag, tap a spot to jump there, or use the arrow keys. Dragging brightness to the bottom turns the room off. A power button sits beside the room's name and Done closes the sheet.
- Auto and Night are switches in a list under the sliders, each with a line saying what it does. Moving a slider by hand takes the room off Auto (Adaptive Lighting's manual control) and ends Night; turning Auto on hands the room back to the schedule. Night turns Auto on, and Auto off ends Night.
- "Linked with" is a row in the sheet that opens a list of the other rooms with a check mark on the current partner, the way iOS picks a value. Any two rooms can be linked; picking a room that is already linked moves it, None unlinks. The pairs are saved in Home Assistant's frontend system data for every screen (admins only), and `light_links` is now only the starting point. The chain button between linked cards is gone.
- Single bulbs stay as chips in the sheet, with a check mark when on. Every control is at least 44 points.

## 2.8.1

- The Home card no longer has a Status block with "All clear" and the list of checks under Who's home, since the header pill already says when something needs attention. The Home tab's subtitle drops "all clear" too. The checks are still one tap away in the pill when something needs attention.

## 2.8.0

- No more "All clear" chip in the header. With nothing running and nothing to check, that spot stays empty. The live-activity pill appears while something runs, and a status problem shows as its own amber pill (red when critical) that opens the Status checks.

## 2.7.0

- Arrange the Lights tab: an admin taps Arrange, drags rows into the order they want (a linked pair moves as one block), and taps Done. The order is saved in Home Assistant's frontend system data, so every screen in the house shows the same order. Lights added later go at the end. Reset order goes back to the order by area. The arrow keys move a focused row while arranging.

## 2.6.0

- Live activities: while something runs, the "All clear" status chip turns into a glass pill. The car charging shows its battery and time to full, the water heater its temperature and about how long is left, and a Hilo challenge its phase and countdown from pre-heat until recovery ends. A second or third activity sits beside the pill as a small ring, and a status problem as a "!".
- Tapping the pill opens one card per activity above the usual Status checks: the car's battery toward its limit, full time, energy and cost so far, with Pause charging and Open Car; the water heater's curve for this cycle; the challenge's pre-heat, reduction and recovery bar with the energy used so far.
- When the car reaches its limit or a challenge ends, the pill shows a check for 10 minutes, then the chip says "All clear" again. On a tablet the weather chip shows only the temperature while a pill is up.
- New `car: {battery_kwh: …}` option, used for the time to full when FordPass doesn't report one.

## 2.5.0

- Smart stack on the idle clock: one card beside the clock (under it on a portrait screen) that follows the moment. It covers tomorrow's weather in the evening, the car charging overnight, who just came home, the hour before sunrise, reminders, critical peaks, now playing, today's calendar, Away, poor room air and energy used today. A door left open or lights that stop answering pin a red card until fixed, and a weather warning, an unplugged car low at night or a frozen iCloud tracker go first in amber. Cards take turns every 20 seconds, and a tap opens what the card is about. New options: `idle_stack` (`enabled`, `sunrise_lights_off`, `reminders`) and `entities.away_mode`.

## 2.4.0

- The Lights tab is compact: each light card is now a dimmer row, two columns on a tablet and one on a phone, so about 16 lights fit on one tablet screen. The row fills to the brightness in the lights' own colour. Slide across it to dim, tap the bulb to switch, tap the row or its chevron for the sheet with colour, single groups and linking (now a narrow panel on a tablet). On a tablet, Auto and Night stay on the row. Arrow keys dim a focused row by 10 %.
- A linked pair is drawn as one block of two rows on both screens, with the chain button on the seam by the bulbs on a tablet. Sliding either row moves both.

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
