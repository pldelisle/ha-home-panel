# Changelog

## 2.15.1

- Energy's detail drops the Totals card; Where it went now stands alone under the main chart.

## 2.15.0

- The Car tab is rebuilt around what you do most. At the top, the charge, the range and the limit Ford sets, with what needs a look (a door open, unlocked) said once. Under it, one row of actions: Unlock, Start…, Pause charging and Honk & flash, shown only when the car or the charger can do them; unlocking and starting ask first. The charger shows its power limit and lock, or one line while it does not answer. The departure schedule is one row that opens an editor with Cancel and Save, and the charging history one row that opens the sessions. On a phone the tab shows all of it directly, with no extra sheet. The charging history opens as a sheet like the panel's other histories; the start question says the heaters are saved as you switch them; and a Wallbox that stops answering says since when.
- With the glass look on, cards and everything inside them are now near-opaque, as Apple's guidelines ask: only the sidebar, the phone's tab bar, the header's buttons, popups, messages and sheets stay glass. Text and buttons are easier to read over the wallpaper, and what floats above the page is clearly what you navigate with.
- The panel now draws in Manrope, with configuration paths in JetBrains Mono, both shipped with the panel so tablets still never call Google. Everything you can tap now looks raised and everything that only shows a value looks flat, so the Car's comfort buttons, the weather readings that open a history, the door and motion rows and the TV keys read as buttons. The on/off switch has a shape of its own, the header's weather is plain text beside the buttons, the Home line no longer repeats the date, and "Tap to run" is now "Never run".
- The Automations tab's flow charts are drawn with a newer drawing library: the shapes have slightly thicker outlines and wider rounded boxes; the colours and the reading order are the same.
- Settings has a new Transparent cards switch under the glass choices: turn it on to have the cards glass again, as they were before, over the wallpaper. It's off by default, and it gives way to the device's Increase Contrast setting.
- Internal tidying of the air cards. Nothing visible changes.
- The Air detail is redrawn with the same look; its controls answer at once. Nothing else changes.
- Internal groundwork for the Air tab in your language. Nothing visible changes.
- The Air tab's card is redrawn with the same look and numbers in your language. Nothing else changes.
- On a phone the Air tab now shows the purifier, the charts and the outside air right in the tab, instead of a card that opened a sheet.
- Internal tidying of how the panel finds the purifiers and rates the air. Nothing visible changes.
- Internal tidying of the volume buttons. Nothing visible changes.
- Each Air reading (PM2.5, CO₂, VOC, CO, PM1, PM10, humidity) is now a tile that opens its own history, like Weather's tiles, and the separate metric control above the chart is gone.
- Air's outdoor history is two charts, the US AQI and the AQHI, each on its own scale with room for its highest reading, and its block sits a regular gap below the pollen.
- Internal tidying of the automation flow charts. Nothing visible changes.
- The Automations tab is redrawn with the same look. Nothing visible changes.
- On the phone, Automations shows Today's card and then the list, and each automation opens its flow in a sheet; the dots on Today's line have a small legend.
- Internal tidying of the Automations tab. Nothing visible changes.
- On Automations, the timeline's dots are easy to hit with a finger, every automation is a plain list you can select a row from, and the "tap one" hints are gone.
- Internal tidying of the Car controls, with three things you can see. Saving a departure schedule with the time cleared no longer sends a broken time to the car: it says "Pick a departure time first". A few words the French screens left in English or got wrong are French now (a current outside the usual steps, an open door, the remote start's cabin setting, the saved schedule's message), and the charger's status reads in lower case in its line. Everything else looks and works as before.
- The Car's departure row is now one button that opens the editor and says what is saved and whether it is on; the switch moved into the editor.
- The Car detail is redrawn with the same look, and it no longer redraws every second: it changes when something it shows changes. A few words change: the battery line has no leading dot when the car gives no battery temperature (nor Ford's battery line when it is partial), one charging session or one day is singular ("1 charging session", "1 session" in French), a last plug-in with no plug-in or plug-out time shows a dash for what the Wallbox delivered where it showed 0.0, and a dash for each missing time in its window ("– to –"), a tire Ford calls low reads "Faible" in French, and the words the French screens left in English are French: the alarm and gear states ("Alarme activée", "Rapport drive"), Ford's saved departure line, a dated message ("Service due, 6 nov." with the month once), the last plug-in's title and its "Ford hasn't reported…" line, and the sessions chart's tooltip. The charging history's bars are described to a screen reader (the title and the sentence), in the language. The charging history says "History didn't load: …" in the place of its sentence when the recorder does not answer. A photo of the car that fails to load gives way to the drawing on the card and in the detail alike, and is not tried again until the panel is reloaded.
- The Car's charging history shows the end date of a session that runs past midnight, draws its 30 days as a chart with day labels and a kWh axis, calls the card under it Sessions, and names the tab 30 days.
- The Car's charging history sheet opens on Month, the sessions of the last 30 days with their tiles and table, and a Year tab in its header shows the year with the months chart, as before. The history row on the tab still says the year.
- Internal groundwork for the Car tab in your language. Nothing visible changes.
- The Car tab is redrawn with the same look and loads its history when you open it. A few words and figures change: the card no longer starts its line with a dot when the car reports no range, counts "1 charging day" in the singular, and describes its bars and its drawn car in French for screen readers; the card's own description ("Open car details") is French in French; the charger's status on the card comes from the translated catalog; and the card's daily line groups its thousands as the language does ("1,107 kWh" in English, "1 107 kWh" in French), which moves the number in the four phone Car baselines. A history that does not load is said on the Car card, not at the top of the screen; a failure of the history the Home stack and tile, the live pill and the header share is now only logged (Energy and Car show their own lines, other tabs log it).
- Internal tidying of how the panel reads the car and the charger. Nothing visible changes.
- Climate's Set all and All off now ask in a dialog ("Set every room to 21.0°?", "Turn every room off?") with a named button and Cancel, instead of changing their label for a second tap.
- The climate charts are redrawn with the same look and load when you open them. Nothing visible changes.
- Internal tidying of the Climate controls. The French messages for the heat pump, its fan and its louvers now read correctly; nothing else visible changes.
- Internal groundwork for the climate charts. Nothing visible changes.
- Internal groundwork for the Climate tab in your language. Nothing visible changes.
- The Climate tab no longer draws a separate "Outside, last 24 hours" chart under the heatmap: the outside temperature is already a line on the room chart above it.
- The Climate tab is redrawn with the same look. Nothing visible changes.
- Internal tidying of the thermostat and heat-pump readings. Nothing visible changes.
- The Car's departure editor dims the time, the cabin and the days while departure times are off, writes the time the way the rest of the panel does, and lets a tap anywhere on the time or cabin row open its picker.
- A chart with no history yet says so once, "No history yet. It fills in as Home Assistant records the next hour.", instead of drawing empty axes, a donut of 0 kWh and tiles of dashes, and Home's Energy and Water heater tiles say "No reading" in small type instead of a big dash.
- Internal tidying of the energy readings. Nothing visible changes.
- The Energy detail is redrawn with the same look. Nothing visible changes.
- Internal groundwork for loading the energy history when it is shown. Nothing visible changes.
- Internal groundwork for the Energy tab in your language. Nothing visible changes.
- Energy has one range at the top (Now, Today, Week, Month, Year) and every card follows it, so "Where the power goes" and "Where it went" no longer have a range of their own.
- The Energy tab is redrawn with the same look and loads its history when you open it. Nothing visible changes.
- On a phone the Energy tab shows the range, the power flow, the hourly chart, where the power goes and the totals right under its header, instead of behind a card that opens a sheet.
- Internal tidying of the live power readings. Nothing visible changes.
- Energy's Now tab shows only the live power flow, Today keeps the hourly chart, the bars sit on whole hours, the axis labels never tilt, and the "Tap a bar" hint is gone.
- The phone's Energy tiles say "No reading" instead of a big dash when their sensor has no value.
- Energy's numbers now agree with each other (the busiest hour matches the tallest bar, Totals and "Where it went" match the chart, and devices that outrun the meter are called out), and Home, Lights and Weather show the same sunrise and sunset for today.
- The sidebar and the phone's tab bar now look like the Files app's: every icon in the same blue, and the open section on a darker grey instead of its own colour. The icon beside each section's title has no coloured square behind it any more.
- The greeting, the date and who's home show on Home only; every other tab opens with a slim top row and its own title as the page's large title.
- The last of the old code is gone: the shell draws the whole panel. The one visible change is a fix: in Chromium the glass's lens no longer drops out after a redraw (#198).
- The battery, the temperatures, the powers and the money now read the same on every tab: 64% for the battery, 4.2° for the outside air, 850 W or 3.2 kW for a power.
- The clock, the weather and the gear stay in the same place on every tab, Home has the greeting as its only title with Who's home shown once, and the line under the clock appears only when the statistics are out of date.
- Media: the TV has the same power button on the phone as on the iPad, a speaker's tile on the phone has its volume slider with − and +, the TV's play button shows ▶ or ❙❙ for what it will do, and the toast after a play or pause names the room ("Living room paused").
- A tile with no reading now says "No reading" instead of a dash beside its unit, and the Automations Then tile is left out when nothing follows Next.
- On the iPad, VoiceOver now calls the Car, Weather, Air and Home energy tabs regions instead of dialogs.
- The Settings popup now has one Light / Dark / Auto control, shows the glass themes as colour swatches, and on the phone has a Settings title and a Done button.
- Small fixes: the water heater's chart text and the live activity's time marks are easier to read, "Motion now" is plain text with a dot instead of blue, the Car's top view of the tyres takes the car's colour, and the More sheet's captions are shorter so they are no longer cut.
- Internal rewiring of the header. Nothing visible changes, except that in French the Home heading now says how many items need attention in French.
- On the iPad's Home the weather, Who's home and the stack are each their own card, and the tiles' chevron is a plain "›" without a box.
- The Home tab is redrawn with the same look. In French, a few words on the Home tiles and the weather card that stayed in English are now French, and a house without air purifiers no longer shows an empty Air tile.
- Internal groundwork for the Home tab's tiles. Nothing visible changes.
- Internal: the Car's Unlock and Start questions are now a shared dialog that other tabs can use. Nothing visible changes.
- The idle clock is redrawn with the same look. Nothing visible changes.
- Labels are written in sentence case, as iOS 26 writes them: Warmest, Rain or snow, Text size, Grid, Water heating.
- Internal tidying of the Lights controls. Nothing visible changes.
- Internal groundwork for the light controls. Nothing visible changes.
- Internal groundwork for the Lights tab in your language. Nothing visible changes.
- On the Lights tab, a room whose lights are off is a dimmed grey tile, as in Apple Home, so the lit rooms stand out at a glance.
- The Lights tab is redrawn with the same look. In French, the empty tab's line and the Adaptive Lighting lines are now in French.
- Internal tidying of how the panel groups the lights. Nothing visible changes.
- The room's light sheet is redrawn with the same look. Nothing visible changes.
- Internal tidying of the Status checks. Nothing visible changes.
- Internal groundwork for the header's live pill. Nothing visible changes.
- The header's pill and Status checks are redrawn with the same look. After Pause charging, the message now says "Charging off" (and "Charging on" after Resume), as the Car tab does.
- On the Media tab, the TV's power is a round power button, the speakers' volume is a slider with − and + at its ends, and the grey box that only said "Netflix" is now a "Now on Netflix" line under the TV's name.
- VoiceOver and Switch Control now find one control with one name wherever a row has a second action (Lights, the phone's Media), and the Now playing and weather cards on Home are named buttons.
- Internal tidying of the header chips. Nothing visible changes.
- Internal tidying of who's home and the calendar. Nothing visible changes.
- Phase 3 is finished: the last leftovers of the old panel are gone and every sheet and popup is checked for accessibility. Nothing visible changes.
- On a phone, the tab bar's last button always says More, even while you are on Weather, Energy, Air, Media, Security or Automations.
- On a phone, a sheet opened from a tab (a room on Climate or Lights) covers the whole screen again, instead of stopping half-way down with the header and tab bar showing.
- Media's speaker rows show the room name whole, with the volume on a row under it. Chart axes land on whole hours or whole days ("12 am, 2 am, 4 am"), and a chart within one day never prints a date. Every tab has one hidden heading naming the panel. The Automations flow writes its node tags in sentence case, Air's empty history says what the other charts say, and the automations list is called a list.
- Internal tidying of the door and motion sensors. Nothing visible changes.
- Internal rewiring of the Home security card. Nothing visible changes.
- Internal groundwork for the Security tab's texts in your language. Nothing visible changes.
- The Security tab is redrawn with the same look. Nothing visible changes.
- Internal tidying of how the panel finds the cameras and the door and motion sensors. Nothing visible changes.
- A door or motion sensor's history shows times and dates in your language. Nothing else changes.
- The option buttons can be moved between with the arrow keys. Nothing else changes.
- Climate's selected room is a quiet filled row, the iPhone Weather card no longer repeats what the tiles say, and "Add UniFi Protect" looks like a button.
- Internal rewiring of the smart stack and Who's home. Nothing visible changes, except two words in French: the evening card names tonight's sky with the Weather tab's word, and a car with no name is « Voiture ».
- Internal tidying of the smart stack's rules. Nothing visible changes.
- Facts such as a run's date and outcome, Air's ratings and who is home read as plain text with a coloured dot, no longer as capsules that look like buttons.
- Climate's Warmest and Coolest tiles show that room's chart, and Energy's totals set the tab to the range that holds their period.
- Times and dates read the same everywhere: 12-hour with am and pm in English, 24-hour in French, on Automations and on every chart's axes and tooltips.
- The error message at night is now a deeper red, so its white text is easy to read.
- Internal tidying of the notifications. Nothing visible changes.
- On a phone the Weather tab now shows the forecast, the sun and the radar right in the tab, and Home's weather card takes you to it, instead of opening a sheet.

## 2.14.2

- Internal groundwork for the controls that send commands. Nothing visible changes.
- Internal tidying: the old Media code is gone. Nothing visible changes.
- Internal groundwork for the Media tab. Nothing visible changes.
- The Media tab is redrawn with the same look. Nothing visible changes.
- The Media tiles on the phone are redrawn with the same look. Nothing visible changes.
- Internal rewiring of the scenes row; the hidden TV card is gone. Nothing visible changes.
- Internal tidying of how the panel finds the TV and the speakers. Nothing visible changes.

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
