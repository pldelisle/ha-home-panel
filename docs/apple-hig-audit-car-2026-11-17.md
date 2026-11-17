# The Car tab, measured against Apple's guidelines

Nov 17, 2026 · branch `claude/hig-content-opaque` (main at `bc650e0` plus the opaque-cards, Files sidebar and Transparent cards
commits)

**Bottom line: 48/100, the panel's weakest tab.** The Car tab has the most controls (32 on iPad, 42 in the iPhone sheet) and
the least clarity about them: 14 of the 32 are disabled yet most look live, a read-only value is drawn as a control, the
same facts are shown three to five times, and the things people do most (lock, unlock, start the car, see the charge) are
spread across four cards and, on the iPhone, sit 1,900 pt down a 3,000 pt sheet. The fix is mostly structure, not styling:
one summary, one row of actions, the charger, a schedule row that opens its own editor, then history.

## How it was checked

The test house's Car tab on a 1180×820 iPad (light and dark) and a 393×852 iPhone (the tab and the detail sheet its card
opens), with the same Playwright audit as the panel-wide review ([apple-hig-audit-2026-11-17.md](apple-hig-audit-2026-11-17.md)):
every control's size, name, fill, shadow and disabled state, plus full-page screenshots. In the test house the Wallbox is
unavailable and FordPass reports no remote-start entities, which is why so many controls are disabled; a real house will
show fewer, but the rules below hold either way. 🟢 measured, 🟡 seen on screenshots and needs a check on the wall iPad, 🔴
judgement.

## What the tab holds today

| Card               | What's in it                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Battery            | 64.0 %, the range, the car picture, the bar with the charge limit marker, a lone "Plug · Charging" tile                                                                                |
| Car status         | four tire pressures round a top view, a "Locked" capsule, an odometer tile                                                                                                             |
| Home charger       | Power limit (five amperages), Charge limit (six percentages, read-only), a Charging switch, a Lock charger switch, two lines of explanation                                            |
| Comfort and access | Remote start and three heaters as four tiles, a "Locked" row with Unlock, Departure times: a switch, seven day buttons, a time field, Cool/Medium/Warm/Off, a paragraph, Save schedule |
| Charging history   | four tiles (all 0), a chart with no data, a table header with no rows                                                                                                                  |
| From Ford          | "Departure times off · No departure times saved."                                                                                                                                      |
| Last plug-in       | "Ford hasn't reported a charging session yet."                                                                                                                                         |

On the iPhone the tab shows one card (the charge again, the picture again, three tiles, an empty chart) and the whole of the
above opens in a sheet over it.

## Findings, ranked

| \#  | What departs from Apple's guidelines                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fix                                                                                                                                                                                                                                                                                                                                                                                                                   | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Disabled controls look live.** 14 of 32 controls are disabled 🟢. The four Comfort tiles (Remote start, Heated windshield, Rear defrost, Heated wheel) are drawn as raised, enabled buttons with no disabled look at all (`car-comfort.element.css` has no `:disabled` rule); the Power limit's five options look selectable. Buttons: a control needs a visible state, and something that looks tappable must be tappable.                                                                  | Don't show what can't be used: hide Remote start and the heaters when FordPass has no remote start, and show the charger's controls only when the Wallbox answers; otherwise one line ("Wallbox unavailable · last seen 2 h ago"). Where a control stays disabled, draw it disabled (the kit's 0.45 opacity) and say why in the row.                                                                                  | S      |
| 2   | **The iPhone tab is a card that opens a sheet with the tab's content.** The Car tab shows a summary card; tapping it opens a 3,004 pt sheet that repeats the summary (the charge and the picture again) above everything else 🟢. Sheets: "Use a sheet only as a temporary interruption… Avoid using a sheet to help people navigate your app's content." A tab already is the place for it. The sheet also looked shorter than the screen in the emulator, with the page showing below it 🟡. | The iPhone Car tab shows the content itself, in the order of finding 4, as the iPad does. Keep sheets for the schedule editor (finding 5) and the history (finding 8).                                                                                                                                                                                                                                                | M      |
| 3   | **The same fact, three to five times.** The charge: header pill, the tab's sub-line, the iPhone card, the Battery card (and again in the sheet). The lock: the sub-line, the "Locked" capsule in Car status, the "Locked" row in Comfort. The charge limit: the bar's marker, the Charge limit control, "Limit 90%" on the iPhone card. The departure schedule: in Comfort and again in "From Ford" 🟢. Layout: show each piece of information once, in the place that owns it.                | One summary at the top (charge, range, plugged/charging, locked, parked where) and nothing repeated below it: the lock lives in the actions row, the limit on the bar, the schedule in its row. "From Ford" keeps only Ford's own messages (the tire warning) and disappears when there are none.                                                                                                                     | S      |
| 4   | **No hierarchy: the frequent actions are buried.** Lock/Unlock sits mid-card in Comfort; Remote start is a tile among heaters; on the iPhone both are 1,900 pt down 🟢. Layout and Buttons: put the most likely actions where people look first.                                                                                                                                                                                                                                               | Order the tab by use: **summary** (one card: charge, range, bar with the limit, plugged, locked, location, last update) → **actions** (one row of buttons: Lock/Unlock, Start, Stop charging, each with its state) → **charger** (power limit, lock charger, both only when the Wallbox answers) → **departure** (one value row, finding 5) → **history** (finding 8) → **tires and odometer** (a small status grid). | M      |
| 5   | **The departure schedule is a form spread inline.** A switch, seven day buttons whose state is colour only (40 pt wide on the iPhone), a time field, a cabin setting with no option chosen (Segmented controls: a segmented control "offers a single choice", and here it offers none), a 3-line explanation, and Save, with errors shown only after the tap 🟢. Toggles: "avoid relying solely on different colors".                                                                          | One value row: "Departure · Mon, Wed at 8:00 · Off" with its switch. Tapping the row opens a sheet with Cancel and Save: the days as toggle buttons that fill when chosen (a checkmark list on the iPhone, as Clock's alarms repeat), the time picker, the cabin as a menu with "Choose" until picked, and Save disabled with a one-line reason until a day and a cabin are chosen.                                   | M      |
| 6   | **Charge limit is read-only but drawn as a segmented control** 🟢 (the hint says Home Assistant can't change it). Buttons: something that looks tappable must be tappable. Still open from Nov 7.                                                                                                                                                                                                                                                                                              | Show it on the battery bar's marker only ("Limit 90% · set in FordPass" under the bar); remove the control.                                                                                                                                                                                                                                                                                                           | S      |
| 7   | **Remote start and the heaters are four look-alike tiles with different meanings.** Remote start starts the engine (a consequential action, today guarded by "tap again"); the three heaters are options of a remote start ("With remote start: off"), not actions of their own 🔴. Alerts: confirm a consequential action with a named button and Cancel.                                                                                                                                     | One "Start" button in the actions row. Tapping it opens a confirmation with the heaters as options ("Start the car for 15 minutes" · Heated windshield · Rear defrost · Heated wheel · Start · Cancel). The heater tiles disappear.                                                                                                                                                                                   | M      |
| 8   | **Empty history is drawn in full.** Four tiles of 0, an empty chart with "No history yet", a table header with no rows, and an empty "Last plug-in" card; on the iPhone, an empty chart area with a screen-reader sentence visible under it 🟢. Layout: don't show structure with nothing in it.                                                                                                                                                                                               | With no sessions, one line in the summary ("No charging sessions in the last year"). With sessions, a "Charging history" value row ("12 sessions · 210 kWh this month ›") that opens the chart and the table in a sheet, and the last plug-in as one line of the summary.                                                                                                                                             | S      |
| 9   | **Switch labels that contradict the summary.** "Charging" is off and says "Available while the car is plugged in" while the summary says charging 🟢 (the Wallbox's pause and the car's own charge are two things). Toggles: the label should say what turning it on does.                                                                                                                                                                                                                     | "Pause charging" (on = paused), shown only when the Wallbox answers, so it never contradicts the car.                                                                                                                                                                                                                                                                                                                 | S      |
| 10  | **Long instructions instead of clear controls.** "Sets the Wallbox maximum current. kW assumes 240 V.", "Set in the FordPass app. Home Assistant can read it but has no control for it.", "When the car is plugged in, it warms the cabin and the battery… so pick one before saving." 🟢                                                                                                                                                                                                      | One short footnote per group at most, in the list-footer style; the rest goes once the controls explain themselves (findings 5 and 6).                                                                                                                                                                                                                                                                                | S      |
| 11  | **Small targets and uppercase labels.** The three switches have a 30 pt hit area; the day buttons are 40 pt wide on the iPhone; "POWER LIMIT", "CHARGE LIMIT", "DEPARTURE TIMES", "FRONT LEFT" are spaced uppercase 🟢.                                                                                                                                                                                                                                                                        | 44 pt hit areas; sentence-case group labels ("Power limit"), as iOS grouped lists do.                                                                                                                                                                                                                                                                                                                                 | S      |

## The proposed tab

```
Car                                     Parked at home · updated 1:38 pm
┌──────────────────────────────────────────────────────────────────────┐
│ 64 %   280 km             [car picture]                              │
│ ███████████████████████░░░░░░░|  Limit 90 % · set in FordPass        │
│ Plugged in · charging 7.2 kW · locked                                │
└──────────────────────────────────────────────────────────────────────┘
 [ Unlock ]  [ Start… ]  [ Stop charging ]          (the actions row)

Charger · Wallbox Pulsar Plus
 Power limit            16 A  24 A  [32 A]  40 A  48 A
 Lock charger                                            (switch)
 (or one line: "Wallbox unavailable · last seen 2 h ago")

Departure          Mon, Wed at 8:00 · Off            (switch)  ›

Charging history   12 sessions · 210 kWh this month            ›

Tires   34.8  35.0  34.5  34.7 psi        Odometer 12,000 km
```

On the iPad the same order in two columns (summary, actions and the tires left; charger, then the departure and history rows right). As built: the departure and history are two rows of one grouped list (HIG, Lists and tables), so they stay together in the right column rather than history going below on its own.
On the iPhone the same order in one column, in the tab itself, with no sheet.

## Order of work

1, 3, 6, 9, 10 and 11 are small and change no layout: one PR. 4 and 2 are the restructure: one PR, with screenshots for the
owner first. 5, 7 and 8 each add a sheet or a confirmation and can follow one by one.

## Sources

Apple Human Interface Guidelines, read today: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles),
[Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls),
[Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets),
[Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables),
[Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts). Measurements and screenshots:
`test-results/renderings/car-audit/` (not tracked).
