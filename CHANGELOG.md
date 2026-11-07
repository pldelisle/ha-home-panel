# Changelog

## 2.9.0

- On a tablet, the Home card fills the space between the house and Who's home with the smart stack from the idle clock. It shows the same cards in the same 20-second turns, such as a door left open, the car charging overnight, energy used today or what's playing, with dots for how many there are. A tap opens what the card is about. Who's home is already listed right under it, so the who's-home filler card is left out there. With nothing to show, the slot hides. `idle_stack: {enabled: false}` turns this off too.

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
