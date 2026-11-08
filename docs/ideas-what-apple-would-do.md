# Home panel ideas: what Apple would do

> Moved from the Claude artifact [VXi7rtNSbQwPRUzYPeSfCH](https://claude.ai/artifact/VXi7rtNSbQwPRUzYPeSfCH), first published 2026-11-06.

Nov 6, 2026

## Where this comes from

Three rounds of "what would Apple do" for the Home panel on 2026-11-06, after v1.19.5 shipped (Mercury glass, six wallpapers plus Sky, energy flow, lights in their real colour) and while v1.19.6 (idle clock, Security attention glow) was in PR \#14.

Every idea respects the house rules: monitoring only except the car and Home climate, no automation based on camera motion (phones, door sensors and the Premier Étage motion sensor only), one PR per change, nothing private in files served from /local, and simple over clever.

## Round 1: StandBy, Live Activities, Fitness touches

Small things that make the panel feel like an Apple device. Each is a day or less of work and needs nothing new from HA.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 1 | StandBy night mode | When Night mode is on, the idle clock dims and turns deep red like an iPhone on a bedside StandBy, so the wall iPad stops lighting the room | Night mode switch (exists) | Small |
| 2 | Depth-effect clock | On the idle screen the townhouse cut-out sits in front of the bottom of the clock digits, like the Lock Screen subject-in-front effect | The cut-out photo (exists) | Small |
| 3 | Live Activity pill | A glass pill at the top while something is ongoing: car charging (percent, time to full), water heater heating, Hilo challenge countdown. Tap to expand, gone when done | Car, water heater, Hilo entities (exist) | Medium |
| 4 | Smart stack on idle | The idle screen rotates one contextual card beside the clock: tomorrow's weather in the evening, car charge at night, who's home, the sunrise lights-off reminder | Forecast, car, presence (exist) | Medium |
| 5 | Energy rings | Today's heating, water and car energy as three Fitness-style rings against a typical day, filling as the day goes | Recorder statistics (exist) | Medium |
| 6 | Wake on approach | The Premier Étage motion sensor wakes the iPad from the idle clock when someone walks up | Only useful if the iPad is on that floor | Small |
| 7 | Plain-language status | One sentence at the top of Home that reads like Siri: "All good. Car reaches 80 % by 6 am, doors closed, 2 lights on." Built from rules, no AI needed | Nothing new | Small |

## Round 2: keynote features

Bigger pieces that change what the panel shows, not only how it looks. Most are a few days each.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 8 | Floor plan that lives | A drawn plan of the townhouse as the centre of Home: each room tinted by its real temperature, lamps glowing in their actual colour, doors drawn open or closed, the motion dot on the first floor, avatars at the door when someone arrives | A photo or sketch of each floor from the owner | Large |
| 9 | Now Playing takes over | When a HomePod plays, the idle screen becomes the album art blurred full-screen with the title, like the iPhone Lock Screen. Music stops, the clock comes back | HomePod media players (exist) | Small |
| 10 | Photo shuffle idle | When nothing plays, the idle clock sits on a slow shuffle of the family's own photos with a Ken Burns drift, like the Lock Screen and the Apple TV screensaver | A folder of photos in www/home-panel | Small |
| 11 | Door opens, camera answers | When the front door opens, the Security card glows and the entrance camera tile grows to show live for 30 s, like a HomeKit doorbell. Display only, no automation | Door sensor + entrance camera (exist) | Small |
| 12 | Scrub the day | Drag a finger along a timeline on Home and the whole panel replays the last 24 h: temperatures, lights, doors, who was home, car charge | Recorder history (exists) | Large |
| 13 | Good morning brief | The first wake after sunrise shows a one-screen brief (today's weather, inside temps, car charge, Hilo challenge, sunset time) for 10 s, then the dashboard | Nothing new | Medium |
| 14 | Find My card | Who's home becomes a small map with both phones, "the other adult 6 km away, heading home", from the iCloud positions HA already has. Only on the house's own screens, never in files served from /local | iCloud trackers + the proximity integration | Medium |
| 15 | Sleep Focus at night | Once Night mode is on, Home simplifies to doors, car and tomorrow's sunrise in dim red, and the wall iPad stops lighting the room | Night mode switch (exists) | Medium |

## Round 3: moonshots, the homeOS-style hub

The model is the home hub Apple is rumoured to ship: a widget wall that knows who is in front of it, not a dashboard. These change what the iPad on the wall is.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 16 | Ask the house | A Siri-style question bar (tap, or hold the mic on the iPad): "When did the other adult get home?", "Why did the lights go off at 6:39?", "How much did heating cost this week?" Answered from HA history and automation traces through a Claude key, spoken back on the iPad. Read-only, never controls anything | An Anthropic API key in HA secrets, a small HA-side service | Large |
| 17 | Welcome choreography | A phone enters the home zone: the idle screen wakes by itself, "Welcome home", outside temp, who is already in, the entrance camera live for 30 s, then the dashboard. The last person out sees "Doors closed, 2 lights still on" | Presence trackers + entrance camera (exist) | Medium |
| 18 | Family wall | homeOS-style widgets on the iPad: today's shared calendar, the shopping list, a reminder, a sticky note typed on the iPad, beside the house widgets. Drag to reorder, small/medium/large sizes, per-person layout (the other adult's set in French when she is the only one home) | HA calendars and to-do lists (integrated, not on the panel yet) | Large |
| 19 | Money meter | Today's electricity cost counting up live in dollars from Hydro-Québec rates, tomorrow's estimate from the forecast ("cold night, about \$9"), and during a Hilo challenge a live "earned so far ≈ \$1.20" | Hydro-Québec login fixed, Hilo challenge entities | Medium |
| 20 | Today at home | Every evening the panel writes a three-line story of the day (comings and goings, weather, charging, energy) and keeps a scrollable journal, Apple Journal style | Recorder history; optional Claude key for nicer prose | Medium |
| 21 | Immersive idle | The idle screen is a living Apple Weather scene (real rain intensity from the radar, snow, a clear night with stars) with the clock on top; album art takes over when a HomePod plays | RainViewer radar (exists), HomePods | Large |
| 22 | Living floor plan | Same as \#8, listed again because it is the showpiece of any hub | Floor sketches | Large |
| 23 | Scrub the day | Same as \#12 | Recorder history | Large |

## Round 4: what a language model adds

The panel already has every number; a model turns them into words, answers and explanations. All of it runs through Home Assistant's own Anthropic integration (a conversation agent plus the AI Task service) with the key in secrets.yaml: the panel calls an HA service, nothing is stored under /local, and what leaves the house is only what is exposed to the model, entity by entity. Phone locations and camera images stay out unless a line below needs them and the owner says yes. Everything stays read-only: the model gets history, statistics and traces, never a service that controls a device. The HA MCP server planned through the Cloudflare tunnel is the other direction: it lets this chat read the house; the ideas below live on the panel itself.

### Talk to the house

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 24 | Ask the house, with follow-ups | \#16 done properly: a question bar on every screen (mic on the iPad, keyboard on the phone). "When did the other adult get home?" then "and the day before?" keeps the context. Answers in the asker's language from history, statistics and automation traces, spoken back on the iPad | Anthropic key in HA, a read-only tool set (history, statistics, traces) | Large |
| 25 | Point and ask | Long-press any card, tile or chart and ask about it: "why is this higher than yesterday?", "is this normal?" The model gets that entity's last 30 days and answers in two sentences under the card | Same plumbing as \#24 | Medium |
| 26 | Same brain in the HA app | The agent behind \#24 also answers HA Assist in the HA app on both iPhones and the Apple Watch: "is the patio door closed?" from the car. Siri is not replaced | Assist pipeline with the Anthropic agent | Small (on top of \#24) |

### Written for you

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 27 | Morning brief in words | At the first wake after sunrise, a four-line brief written by the model: the weather in plain words, inside temps, car charge and whether it covers the day's calendar, a Hilo challenge if one is coming, sunset. On the idle screen for a minute, kept on Home until noon | Forecast, car, Hilo, calendars (exist) | Medium |
| 28 | While you slept | On the first touch of the day: "Patio door opened 2:10 to 2:12, heat pump ran 4 h 20, car reached 80 % at 3:40, nothing else." | History | Small (on top of \#27) |
| 29 | Today at home, in prose | \#20 with real writing: every evening a three-line entry with the day's comings and goings, weather, energy and one notable thing; a scrollable month | History, statistics | Medium |
| 30 | Weekly report | Sunday evening, a Screen Time style page: energy by group against last week, hours of lights on, doors opened, who was home, the three anomalies of the week with a one-line explanation each | Statistics | Medium |
| 31 | Québec French for everything | Environment Canada's forecast text and weather alerts, which stay English today, rendered in Québec French for the other adult by the model, cached once a day | Forecast text (exists) | Small |
| 32 | Hilo challenge coach | Before a challenge, the plan in words (pre-heat to 22° from 15 h, let it drift to 19° by 21 h, the credit to expect); after, what happened and what the credit should be | Hilo entities, statistics | Medium |

### Explains and diagnoses

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 33 | Why didn't it fire? | On the Automations tab every automation gets a plain-language explanation of its YAML, and each trace a sentence: "Didn't run at 6:39 because Away was on." A Why? button on the Today timeline | Traces (all 26 automations keep 20) | Medium |
| 34 | Smart-home health check | A Diagnose button: the model reads the unavailable-entity history, battery levels, the Thread route task runs and HomePod reconnects, then writes the finding: "Office bulbs dropped 3 times this month, each time 2 min after a HomePod reconnect." The Thread outages explained from data instead of guesses | History of unavailable states, UniFi events | Large |
| 35 | Anomaly notes | A daily pass compares every energy and temperature series with its last 30 days; where something stands out, one line appears under the tile: "Water heater used 3 kWh more than usual." | Statistics | Medium |
| 36 | Comfort advisor | Suggestions, never actions: "The office reaches 20° only at 7:40 on weekdays; starting the schedule 30 min earlier would cost about 0.4 kWh." the owner applies what he likes in the config | Climate history, schedules | Medium |
| 37 | Explain this chart | A button on every chart that writes two sentences about what it shows | Same plumbing | Small |

### Sees

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 38 | Describe the camera | Tap a camera, tap Describe: the model looks at the current snapshot and says what is there ("driveway clear, light snow on the steps"). On demand only, never an automation (house rule) | A snapshot sent to the model, with the owner's OK | Small |
| 39 | Read the bill | Photograph a Hydro-Québec bill or a Hilo statement with the phone; the model extracts the numbers and checks them against the panel's own figures | Phone camera | Medium |

### Behind the scenes, about the panel rather than on it

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 40 | Automation from a sentence | "When both phones leave, lower the heat and close the night modes": the model drafts the package YAML and opens it as a PR for review, from this chat | Nothing new | Small |
| 41 | French kept current | Every new English string of the panel gets its Québec French in fr-map.js at build time, reviewed in the PR | A key at build time | Small |
| 42 | Config reviewer | The reviews of 2026-11-03 and 2026-11-06 run weekly on their own and arrive as a PR comment: dead entities, overlapping scenes, automations that never ran | Nothing new | Medium |

What it costs and what leaves the house: the written pieces (#27 to \#32, \#35) are a few short calls a day on a small model, the questions (#24, \#25) cost per question, and the diagnoses (#34) read a lot of history. Exact figures come with the picks. Every call sends the exposed entities' states and history to the Anthropic API, so the exposure list is the real decision.

## Round 5: what the industry is building, and 43 more ideas

Round 5 comes from 155 pages read on 2026-11-06 and 07: Apple, Google, Amazon, Home Assistant, Samsung and LG, energy companies, and recent research on language-model home agents. Ten brainstorms used that reading, then a check against the house rules dropped 73 candidates that repeated an earlier idea, broke a rule or could not be built here. The 43 that remain are below.

### What the industry is building

- **One shared screen that knows who is in front of it.** [Apple HomeView](https://www.apple.com/newsroom/2026/10/meet-apple-homeview-a-new-way-to-enjoy-entertainment-and-manage-the-home/) (announced 2026-10-13, ships 2026-11-13) recognizes up to six people, gives each a personal Home Screen and shows less detail from across the room. Apple calls simplicity and Siri its main features ([MacRumors](https://www.macrumors.com/2026/10/22/simplicity-and-siri-ai-homeview-killer-features/)).

- **Cameras become text.** [Gemini for Home](https://blog.google/products-and-platforms/devices/google-nest/gemini-for-home-launch/), [Ring Video Descriptions](https://www.aboutamazon.com/news/devices/ring-video-descriptions-gen-ai) and [iOS 27 Home](https://9to5mac.com/2026/10/08/heres-everything-new-for-apples-home-app-in-ios-27/) describe events in words, make clips searchable and send a daily digest instead of motion alerts.

- **Say the outcome, not the device.** [Alexa+ in Canadian French](https://www.aboutamazon.ca/fr/actualites/appareils/alexa-maintenant-disponible-en-francais-amazon-deploie-son-assistant-nouvelle-generation-propulse-par-lia-aupres-dun-plus-grand-nombre-de-canadiens) (2026-06-11) raises the heat on « j'ai froid ». [LG ThinQ Claw](https://channellife.com.au/story/lg-unveils-thinq-claw-ai-agent-for-connected-home-platform) takes plans in plain language instead of preset routines.

- **Memory only when asked.** [Google's Ask Home](https://support.google.com/googlehome/answer/16616424?hl=en) saves a fact only on « Remember that… » and can delete everything it saved.

- **The home opens to assistants through MCP, behind permissions.** [XDA](https://www.xda-developers.com/claude-can-run-my-home-assistant-setup-now-and-it-only-took-one-click-to-set-up/) connected Claude to Home Assistant's MCP server in one click. The [community guide](https://community.home-assistant.io/t/so-you-want-to-ai-in-home-assistant/1021777) puts the rule plainly: packaging is not permissioning.

- **Research says time and current state are the hard parts.** [SimuHome](https://www.alphaxiv.org/abs/2509.24282) (ICLR 2026) finds scheduling the hardest task, and agents miss their own timing mistakes. [Increasing Resilience of Smart Home Agents](https://www.alphaxiv.org/abs/2610.04923) tests outage cases. [HearthNet](https://www.alphaxiv.org/abs/2604.09618) keeps every change in Git. Show your work and dry-run before acting.

- **Energy apps explain decisions and ask before acting.** [ecobee Home Summary](https://investors.generac.com/news-releases/news-release-details/ecobee-introduces-home-summary-simplify-connected-home) explains how the weather moved heating. The [Enphase AI Assistant](https://www.globenewswire.com/news-release/2026/08/20/3348310/20176/en/enphase-energy-launches-ai-assistant-in-the-enphase-app-bringing-agentic-intelligence-to-home-energy-management.html) needs confirmation for every change. [Matter 1.6](https://www.cnx-software.com/2026/06/19/matter-1-6-specification-adds-nfc-based-commissioning-thermostat-suggestions-various-core-enhancements/) weighs utility thermostat suggestions against recent manual changes.

The brainstorm also turned up three things in the repo worth fixing on their own. Away can start during a babysitting evening (#47). The Car tab prices charging at a flat rate with no upper tier or taxes (#62). And vm/compose.yaml still pins Home Assistant 2026.8.3 while the VM runs 2026.11 (#72).

### Talk to the house, family, written for you

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 43 | House memory you control | Claude saves a fact only when someone says « Souviens-toi que… », repeats it back and adds a dated line with who said it to a « Mémoire de la maison » list both adults can edit. « Oublie… » removes a line; codes and passwords are refused. Example: « Filtre de la thermopompe nettoyé le 6 novembre (the owner). » | A Local To-do list exposed to Assist; the agent's built-in to-do tools | Small |
| 44 | Say « j'ai froid » to the house | Say how you feel instead of a number, on the Watch, in the HA app or on the Climate tab. Claude picks the zone that heats that room, asks one bounded script for at most ±2° and says which scheduled step will undo it. It refuses during a Hilo challenge or Away and says why | One script exposed to Assist (±2°, never above 23°); the zone map in the agent's instructions | Medium |
| 45 | Tell the house your plans | « On revient dimanche vers 15 h » writes a return entry in a Plans calendar. Heating goes back to normal 2 h before, a Hilo challenge still wins, and Away heating returns if no phone is home 2 h after. Away still starts and ends only from phones and doors | A Local Calendar, one script exposed to Assist, a calendar trigger | Medium |
| 46 | Ask the history, numbers stay home | A question about the past returns a chart or a list of moments. Claude sees only the question and the sensor names and picks the sensor, period and test; the panel fetches the history and draws it. Example: « Porte patio ouverte plus de 10 min : mar. 15:40–15:52, jeu. 21:14–21:39. » | AI Task structured output over a fixed sensor list; the panel's history calls and charts | Medium |
| 47 | Babysitter night: guard and sheet | Today Away can start while a sitter is alone with the child: no phone home and no Premier Étage motion for 15 min, so lights, TV and heat drop. One PR keeps Away off during a gardiennage event. A second writes a short French « Ce soir » sheet 30 min before (bedtime 20:00, heating 21:00, any Hilo challenge, forecast), read-only on the iPad and sent once to both phones | A gardiennage condition in away.yaml; a calendar trigger, AI Task and a Home card hidden otherwise | Medium |
| 48 | Calendar clash check | At 19:30 Claude checks tomorrow's family, transport and gardiennage entries against work and personal calendars, sent only as busy blocks, for a pickup nobody is free for. On Sunday it checks the week. It notifies both phones, each in its owner's language, only when it finds something | calendar.get_events on five calendars, AI Task, both companion apps | Small |
| 49 | One sentence, right list | « Du lait, des œufs, et rappelle à Gen de payer le camp de jour jeudi » puts the groceries on Shopping and the task on Family with a due date and a name. It skips what is already there and answers in the speaker's language | The lists exposed to Assist; one small script for due dates | Small |
| 50 | Bedtime story on the child's HomePod | « Une histoire pour l'enfant, avec un castor » on the Watch: AI Task writes a 2 to 5 minute French story from tonight's weather and tomorrow's family event, and the child's HomePod reads it. It refuses after 20:00 so it never cuts off Piano Chill | One script with AI Task and French TTS; the child's age and likes in the prompt, never in /local | Small |
| 51 | Change notes for the other adult | When a PR changes something the other adult will see or feel, Claude adds one or two French lines under « Pour the other adult ». The owner edits them before merging, and on merge they reach her iPhone as one quiet notification. Invisible fixes send nothing | A PR-body convention; her notify service called from the Mac mini, token in its Keychain | Small |
| 52 | Manuel de la maison, kept current | A Claude Doc in Québec French explains the house by moment of the day (matin, soir, nuit, absent, défi Hilo, the child) and what undoes a change made by hand. After each merged PR the affected sections are rewritten and a « Quoi de neuf » line is added. The other adult's comments become draft PRs for the owner | Package YAML and comments, merged PRs, a daily routine | Small |
| 53 | Maintenance book from manuals | Drop manuals, receipts and rating-plate photos into this chat once. Claude writes a private « Carnet d'entretien » and puts dated items on Reminders. Example: « Rotation des pneus à 24 000 km, tu es à 22 870 km. Chauffe-eau de mars 2017 : 10 ans en mars 2027. » | The PDFs and photos, todo.reminders, the FordPass odometer; receipts carry the VIN, so the doc stays private | Medium |

### Proactive, voice and cameras

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 54 | Night-before departure check | At 20:30 with the car home, Claude reads tomorrow morning's events and looks up each round trip in a short list of usual places. It compares that with range, charge limit, plug state and any morning Hilo challenge that pauses the Wallbox, and notifies only when something needs doing tonight | Calendars (work and personal as times and places only), FordPass and Wallbox sensors, AI Task, a notification linking to the Car view | Medium |
| 55 | City calendar: bins tonight | At 18:00 the city calendar says what goes out tomorrow, « Demain matin : bac brun et recyclage », on the phones and once on the salon HomePod if someone is home. A « Les bacs sont sortis ? » button sends one Front Parking snapshot to AI Task, only when tapped | calendar.city_collection, an actionable notification, HomePod TTS | Small |
| 56 | FYI notifications wait for 20:30 | Door-open and real warnings still go out at once. Heat pump offline or back and the Hilo steps go into a queue that Claude turns into one quiet evening note per person, in their language, folding each offline and back pair into one line | One notify script replacing six direct calls, a to-do list as the queue, one 20:30 automation | Medium |
| 57 | Don't-forget line at the door | The morning brief (#27) gets one more field: what to bring, wear or do today. The first time Porte Entrée opens before 9:30, the salon HomePod says it once. Example: « Il fait −12 avec le vent : tuque, mitaines et cache-cou pour l'enfant. » | \#27's AI Task call; one automation on the door sensor | Small |
| 58 | Door opens, nobody's phone home | A door opens with no phone home: HA refreshes iCloud and waits 3 min. If nobody shows up, it saves one snapshot and checks the family and gardiennage calendars. A planned visit gets a quiet note (« prévu : Léa, 15 h 30 à 18 h »); anything else gets a time-sensitive one with the snapshot and a Describe button. The door is the trigger, never the camera | Door sensors, icloud.update, a snapshot saved under /media (not /local), calendar.get_events | Small |
| 59 | Snap a letter, get dates | Share a photo of a school letter, a town flyer or an email into the Claude app. Claude lists the dates and to-dos with the calendar for each, and writes them after you approve. Example: « jeu. 12 nov. photo scolaire ; ven. 20 nov. pédago ; jeu. 3 déc. sortie au Biodôme. » | HA's MCP server behind the planned tunnel (blocked until then); one script limited to the four family calendars | Small |
| 60 | Search the cameras' day | On the Cameras tab, ask « Est-ce qu'un colis est arrivé ? ». Claude looks at up to 20 of the day's person, vehicle and package thumbnails from the two outdoor cameras and answers with the time and the thumbnail. Indoor cameras are never searched | The UniFi Protect media source, one AI Task call with thumbnails, an answer card | Medium |

### Energy, money and diagnoses

Every number in these comes from a script or the panel; the model only writes the sentences.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 61 | Hilo, Flex D or winter credit | Before December 1, Claude replays last winter's real hourly consumption under Rate D with Hilo, Flex D, and Rate D with the Winter Credit Option, using the actual peak events and challenges. It writes a one-page French doc with the method and one recommendation | Hourly kWh statistics for December to March (or Hydro-Québec's CSV), the peak and challenge calendars, rates read on the day | Medium |
| 62 | Tariff audit each April | Hydro-Québec changes its rates on April 1. Claude checks every dollar figure on the panel against the new grid and opens a PR for wrong code. First finding: the Car tab prices charging at the Wallbox app's flat price (7 ¢ when missing), with no upper tier and no taxes | The panel source, the rate sensors, Hydro-Québec's Rate D page; a yearly routine | Small |
| 63 | Same month last year, weather-adjusted | When a month starts, the Energy tab shows two sentences comparing it with the same month a year earlier, corrected for heating degree-days and split into heating, water, car and the rest. Example: « Décembre : +12 % sur 2025, mais 9 % plus froid. À météo égale, +3 %, surtout la voiture. » | Monthly statistics with a coverage check, outdoor temperature, one AI Task call a month | Medium |
| 64 | Leakiest room | After about five Hilo reductions, Claude computes how fast each room cools when the heaters are off, against the indoor–outdoor gap, ranks the rooms and says what to check in the worst one. Example: « Chambre de l'enfant : −1,4°/h pour 30° d'écart, deux fois le bureau. » | Hourly room and outdoor temperature statistics, the Hilo calendar | Medium |
| 65 | Hilo season review PR | Each challenge logs one line (kWh, reward, temperatures). On April 1 Claude reviews the winter, mornings against evenings and cold against mild, and opens at most one PR to heating.yaml, or says « no change » with the numbers | A record written by the recovery automation (traces keep only 20 runs), the rewards sensor, a yearly routine | Medium |
| 66 | Heat pump not keeping up | The heat pump runs in heat mode but upstairs stays 2° under its setpoint for 90 min outside a Hilo event. The owner gets one note per episode naming the likely cause: setpoint reset by the FGLair cloud, defrost, cold beyond its range, or snow on the outdoor unit. It suggests and never acts | Heat pump and temperature sensors, Environment Canada observations, AI Task, one automation | Small |
| 67 | Broken integration: page now, cause by morning | When iCloud, FordPass, hydroqc, Hilo, Wallbox, Mila or Environment Canada needs a new sign-in or fails to load, the phone gets one fixed line saying what stops working and where to fix it. Each morning Claude reads yesterday's masked HA log and reports only new or growing errors | Integration state triggers and repair events, a log-masking script, a daily routine | Medium |
| 68 | Thread mesh map before new rooms | Before the kitchen and passage bulbs go in, Claude reads each Matter device's Thread diagnostics (role, parent, neighbours, signal). It draws a map with warnings, like a sensor hanging on one bulb, and says where the next bulbs should go | The Matter server's node dump via Remote Control; a Claude Doc | Medium |
| 69 | Brief for the technician | Before a repair visit, Claude writes a one-page French brief: the model, a chart of the problem from HA history, what was already tried and three questions. Example: « Depuis le 2 nov., le chauffe-eau met 3 h 40 pour remonter de 45 à 55 °C, contre 1 h 50 en octobre. » | Statistics, the device registry, the repo's history | Small |

### Claude as the house's operator

These run from this project chat, through Remote Control, the config share and GitHub. Each ends in a PR the owner merges, or a doc.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 70 | What-if outage drill | Claude walks a fixed list of failures through the YAML: FGLair or a Hilo thermostat unavailable at a scheduled time, Internet down, HA restarting during a défi, a power cut, a HomePod update. It writes what the house would do, opens one PR per real gap and keeps a French « Si ça brise » sheet for the other adult. Two likely gaps already spotted: the heat pump keeps its 5:15 boost if it is unavailable at 6:00, and a restart during a défi loses the Wallbox snapshot | Packages and READMEs, the recorder's unavailable history; reruns after any heating or Away PR | Medium |
| 71 | Predict, then verify each PR | When a merged PR changes an automation, Claude reads its first three real runs, compares them with what the PR said would happen and comments on the PR. A run that did something else gets a fix PR | Automation traces read from the Mac mini with a token in mac/.env; one follow-up per merge | Small |
| 72 | Update pre-flight PR | When HA or an installed integration has a release, Claude reads its breaking changes against this house's YAML. It names which local workaround the release makes useless (FGLair repatch, iCloud refresh) and opens one PR with the new version and a restart window that misses the schedule and any announced défi. Today vm/compose.yaml still pins 2026.8.3 while the VM runs 2026.11 | Release notes, the manifests and .HA_VERSION on the share, a daily routine | Small |
| 73 | Exposure audit before the tunnel | Before the MCP tunnel opens, then every Monday, Claude lists what an AI or a visitor could reach: entities exposed to Assist, the MCP server's write tools, files under /local, and which tunnel paths answer from outside. It compares that with an intended list kept in the repo and names the switches for the owner to flip | The exposed-entities file, read only; the MCP tool list from the Mac mini; one check from outside | Small |
| 74 | Sun versus clock, all year | Claude computes a year of sunrise and sunset and lists every date range where a sun rule and a clock rule swap order. Example: the child's lamp comes on in Night colour after the 20:00 bedtime in summer. It asks whether each is intended | The light and bedtime packages; a sun calculation with town-centre coordinates | Small |
| 75 | New or re-paired device PR | Each morning Claude compares the entity registry with the day before. When a re-paired Matter device comes back as a \_2 twin, one PR swaps every reference. When new bulbs arrive, one PR adds them to Away, Good night, Adaptive Lighting and the French map, with proposed names | The entity registry, read only; packages and panel lists; a morning routine | Medium |
| 76 | Live edits become a PR | Each night sync-from-live.sh runs on a fresh branch from the Mac mini. When something really changed in the HA UI, one PR describes the real edits apart from the editor's key re-ordering. Nothing happens when nothing changed | The existing sync and secret-check scripts, Remote Control, a nightly routine | Small |
| 77 | Schedule tuned from your overrides | Every Sunday Claude counts the changes people made by hand from the panel, the HA app or a thermostat. When one comes back on 3 days, or an automation is undone within the hour 3 times, it asks one question here. Example: « Heating 21:00 undone 4 times in 7 days (salon 18° → 21°). Move the drop to 22:00? » A yes edits the automation already covering that moment; a no is never asked again | A copy of the recorder database, Hilo history, a declined-suggestions file in the repo | Medium |
| 78 | Monthly backup restore drill | Once automatic backups run, the first Sunday of each month Claude restores the newest one into a throwaway, offline HA container on the Mac mini at the same version and reports what loaded. A one-page restore plan lists what no backup holds, like the Matter server's data | The backups, the key in the Mac's Keychain, a container on the Mac mini | Medium |
| 79 | One heating schedule, proven unchanged | One PR moves the heating schedule into a single table read by one automation, so each setpoint is written once instead of four times. The PR shows the setpoint every thermostat gets at every scheduled minute of a week, before and after, under normal, Away, door-paused and Hilo | heating.yaml and a small comparison script | Medium |
| 80 | Dry run before special days | A section of the Sunday review (#42): Claude replays each unusual day of the coming week (sitter, guests, a trip) against the automations and lists what the house will get wrong. Example: « 21–22 nov., chalet : le coucher de l'enfant à 20 h n'a pas de condition de présence, Piano Chill jouera dans la maison vide. On garde ? » | \#42's routine; the family, transport and gardiennage calendars through MCP | Small |

### Claude as the panel's developer

Once the panel moves to its own repository (another thread is extracting it), these land there.

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 81 | House-rules check on every PR | Every PR gets one comment checking its diff against the six house rules: controls outside Car and Climate, camera-triggered automations, secrets or a VIN under www, two changes in one PR, scenes overlapping automations, the NAS on a dashboard. The first run is a baseline: the panel already calls light, switch, fan, media, scene and Adaptive Lighting services, so rule 1 needs its exceptions written down | The rules as one file in the repo; the PR diff | Small |
| 82 | Panel errors and French gaps become PRs | The panel writes its uncaught errors and each untranslated French string to HA's log, deduplicated and capped. A weekly routine reproduces each error in the test harness and opens one PR with a failing test, and one PR with the missing French | system_log.write from the panel, the log through Remote Control, the harness | Medium |
| 83 | Report a problem from the panel | A « Signaler un problème » row in the gear popup saves a typed sentence with the tab, screen size, theme, text size, language and version to a to-do list. Claude reproduces each report and opens one PR with before and after screenshots. Example: « Les chiffres de l'énergie sont coupés » → a PR wrapping the Sankey labels at Larger text | A Local To-do list; todo.add_item from the panel | Medium |
| 84 | Screenshot review in WebKit and real outages | For each panel PR Claude runs the harness in Chromium and WebKit, the engine of the iPad and iPhones, plus three outage scenarios: Thread bulbs down, Hilo offline, FGLair down. It comments with pixel diffs and any NaN, undefined, empty card or English text in French mode. The v1.19.6 overlay that blocked every tap is the kind of bug it catches | Playwright WebKit, a pixel-diff tool, fixture files kept outside /local | Medium |

### Moonshot

| \# | Idea | What it does | Needs | Effort |
|---|---|---|---|---|
| 85 | Replay last week on PRs | Every incident fixed so far becomes a regression test with its expected outcome, including « nothing should happen »: the false Away of Nov 2, camera motion ending Away on Nov 3, the Bilresa replay, the sunrise relight, the 6:00 office fan. The tests run on HA's own automation engine with a simulated clock on every PR that touches an automation. On request Claude also replays the last 7 days with main and with the PR and lists what would differ | HA's test harness pinned to 2026.11, one GitHub Actions file; history stays on the Mac mini | Large |

What leaves the house: most of round 5 sends YAML, PR diffs or masked log lines, not live data. \#46 sends only sensor names, never values. The camera ideas (#55, \#58, \#60) send a snapshot or thumbnails only when someone taps or asks. The calendar ideas send event titles and times, with work and personal calendars reduced to busy blocks.

## Picks and what each needs

Claude's picks, in the order they would ship: \#16 Ask the house, \#17 Welcome choreography, \#18 Family wall, then \#8 the living floor plan once the floor sketches exist. The quick wins that fit in an afternoon are \#1, \#7, \#9 and \#11. Among the model ideas, \#27 the morning brief and \#33 Why didn't it fire? give the most for the least, and \#34 the health check is the one that would have saved the Thread evenings.

From round 5, start with \#47: its first PR fixes a real gap, because Away can start tonight with a sitter alone with the child. After it, \#43 house memory and \#51 change notes for the other adult are an afternoon each. \#70 the outage drill is the one most likely to prevent the next bad evening.

- [ ] The owner picks the ideas to build (numbers)

- [ ] For \#8: a photo or sketch of each floor with the room names

- [ ] For \#10: a folder of photos to shuffle

- [ ] For round 4 (#24 to \#39): an Anthropic API key in secrets.yaml and the list of entities the model may see

- [ ] For \#19: the Hydro-Québec login in HA fixed first
