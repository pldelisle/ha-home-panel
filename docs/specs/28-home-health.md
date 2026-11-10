# Spec 28: Home health in the header. The health rules' issues in the Status checks, maintenance as a live activity, outages and recoveries in the smart stack

Parent: follows [27 Network](27-network.md). Issue: #279. It extends [22 Live](22-live.md)'s chain of Status checks and its activities, and [24 Home](24-home.md)'s smart-stack rules, with rules over spec 27's `homeHealth` and `unifiNetwork` providers. No new element, no new seam and no new ADR: this is ADR 0017's "share reads in providers" applied a third time.
Depends on: spec 27's #281, #282, #287 and #289; #254 (the checks as a chain), #255 (the activities and `liveModel`), #256 (the pill and the popup as elements), #265 (the stack's rules) and #266 (the stack's elements). Until those land, the checks, activities and stack rules live in the legacy class, and this spec adds nothing to it: the legacy class only shrinks.
Blocks: nothing.
Ships as: five pull requests, the tickets of "The moves".

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

**The household.** The attention pill and the Status checks cover energy, heating, the car, the doors and the sensors, but not the internet, the network's equipment or the home server. When the internet drops, a NAS drive runs hot or the switch goes offline, the pill stays quiet. The only place that knows is a dashboard nobody at home opens. The idle clock's smart stack doesn't say "the internet is back after 12 minutes" either, which is the question everyone asks after an outage.

**The owner.** The health rules already decide what is a Problem, a Warning, Unknown (monitoring can't verify), Recovering or Maintenance (a routine storage job such as a data scrub). A panel that showed Maintenance as a fault would cry wolf every month. A panel that re-derived the thresholds would drift from the rules.

**The maintainer.** Spec 22 made each check one named pure function and spec 24 did the same for each stack rule. The house's health must enter the same chains as more links, not as a side channel.

## Solution

Three additions, all as rules over the providers, drawn by the elements specs 22 and 24 already build:

1. **The Status checks** gain five checks, one per health area: Internet, DNS, Network, Ad blocking and Home server. Each folds its area's issues into the popup's items:
   - **Problem** is a red item; the pill turns red.
   - **Warning** is an amber item.
   - **Unknown** is one amber item for the area, "Can't check {area} right now".
   - **Checking** shows nothing; the rules are still confirming.
   - **Recovering** shows no item and gives the area's clear phrase "recovering".
   - **Maintenance** shows no item; it is a live activity (below).
   - **Healthy** gives the clear phrase "Internet OK".

   An area the house's rules lack yields nothing, neither an item nor a clear phrase. Each item's line comes from the issue's catalog message and its age ("Down for 4 min").

   Without the bridge, a sixth check, **`unifiDeviceOffline`**, reads the integration directly: a gateway or switch offline is red, an access point offline is amber. With the bridge, the rules' `unifi_devices` issue covers it and this check yields nothing, so there is one source and no duplicates.

2. **The live-activity pill** gains a **maintenance activity**: while an issue is in Maintenance (a data scrub or another storage job), the pill shows an indeterminate ring with "Data scrub · 2 h". Its popup card says what runs, since when, and that nothing needs doing. When it ends, the ten-minute check shows "Data scrub done".
3. **The smart stack** gains five cards:
   - **Internet down**: red, so it pins itself. "Internet down · 4 min".
   - **On the backup line**: amber, "On the backup line since 14:02". The house is online, so this is not "down".
   - **Internet back**: no tone, for 30 minutes after the end of an outage that lasted more than a minute. "Internet back after 12 min".
   - **Firmware waiting**: a filler, in the evening only. "2 network updates waiting".
   - **Speed below plan**: amber, when the last speed test in 24 hours was under half the plan's speed.

   Each card's `go` is the Network tab.

The header gains no chip. The idle clock inherits the stack's cards.

## User Stories

1. As a household member, I want the pill to turn red when the internet is down, so that I know before I try to stream.
2. As a household member, I want the Status checks to say what is wrong in plain words with how long it has lasted ("Internet down · Down for 4 min"), so that I can judge whether to act.
3. As a household member, I want the pill to stay quiet while the rules are still confirming a blip, so that a two-second hiccup never alarms the house.
4. As a household member, I want "Can't check the network right now" rather than "Internet down" when the monitoring itself is down, so that the tablet never claims an outage it cannot see.
5. As a household member, I want a data scrub on the NAS to show as an activity and not as a problem, so that routine maintenance never looks like a fault.
6. As a household member, I want "Data scrub done" for ten minutes when it ends, so that I see it finished, as with a charge or a challenge.
7. As a household member, I want a red card on the idle clock while the internet is down, so that the wall tells the whole house.
8. As a household member, I want "Internet back after 12 min" for half an hour after an outage, so that I know it's over and how long it lasted.
9. As a household member, I want to know when the last speed test was under half the plan's speed, so that I know when to call the provider.
10. As a household member, I want the evening stack to mention waiting network updates, so that the admin hears about them without an alarm.
11. As a household member, I want a drive at 50 °C, a degraded storage pool or a missing container to appear in the Status checks, so that the home server's trouble is not silent.
12. As a household member, I want tapping a network item or card to open the Network tab, so that I can see the details.
13. As a household member, I want a recovering area to read "Internet recovering" among the clear phrases, so that I see it is getting better.
14. As a French-speaking user, I want every new item, activity and card in French from the first paint, so that the header is as good as the rest.
15. As an adopter without the bridge, I want only the UniFi device check, so that the panel uses what my house has.
16. As an adopter without UniFi or the bridge, I want no network check, activity or card at all, not even a clear phrase, so that the panel fits my house.
17. As the owner, I want the panel to show exactly what my rules decide, with their confirmation and recovery, so that the thresholds live in one place.
18. As the owner, I want one item per issue, with no duplicates between the rules and the integration, so that the popup stays short.
19. As a maintainer, I want each new check, activity and stack card as one named pure function with its own test, so that the chains grow by links and not by special cases.
20. As a maintainer, I want the header and the stack to read the providers and never the Network feature, so that the dependency rule holds.
21. As a maintainer, I want the existing pill and stack baselines unchanged, because the full test house is healthy, and the Status checks' baselines to change only by the five new clear phrases, re-recorded once as a deliberate visual change (#298), so that every visual change of this spec is named.

## Implementation Decisions

### The inputs

- `LiveInputs` (spec 22) gains `health: HealthInputs | null` (`homeHealth`) and `unifi: Pick<UnifiInputs, 'devices'> | null` (`unifiNetwork`). `liveIds` gains both providers' ids, through the providers' exported id functions, never the feature's.
- `StackInputs` (spec 24) gains the same two, plus the Internet scope's 24-hour history for the "back" card, read by `StackHistory` through the statistics cache when the Internet scope sensor's state changes. The cache key is the sensor and the day, so the card's rule stays pure over the rows.

### The checks

The five health checks follow spec 22's interface (`Check.run(inputs, deps): {item?, clear?} | null`) and come after `wallboxOffline` in `CHECKS`, so the popup's existing order is unchanged:

- `internetHealth`, `dnsHealth`, `networkHealth` (the `unifi` scope), `adBlockingHealth` (the `pihole` scope) and `homeServerHealth` (`synology` and `containers` merged).
- Each returns `null` when its scope is absent. In the other states it maps as follows:

  | The scope's issues      | The check returns             |
  | ----------------------- | ----------------------------- |
  | Problem                 | one `crit` item per issue     |
  | Warning                 | one `warn` item per issue     |
  | Unknown                 | one `warn` item for the area  |
  | Checking or Maintenance | nothing                       |
  | Recovering              | the clear phrase "recovering" |
  | Healthy                 | the clear phrase "OK"         |

- An item's `title` is the area's word. Its `line` is `t('network.issue.<id>', params)` with the age through `fmt.durationShort`, and its `key` is `health:<issue>:<component>`, unique and stable for the list's `repeat`.
- `unifiDeviceOffline`: one item per offline gateway or switch (`crit`) or access point (`warn`), with the device's display name. It returns `null` when `health?.scopes.unifi` exists, and also when `unifi` is null.
- `CheckItem` gains an optional `go: {tab: 'network'}`. The popup's item becomes a button when `go` is set: the popup closes and dispatches `tab-select`. Spec 22's existing items carry none, so their rendering is unchanged.

### The activity

- `Activity['key']` gains `'maintenance'`, with priority 4 (after the water heater).
- `maintenanceActivity(inputs, deps)`: the oldest Maintenance issue gives the pill text from `network.activity.<id>` ("Data scrub" for `nas_pool_scrubbing`, "Storage job" for `nas_pool_operation`, the component otherwise) and the age. The ring's `progress` is `null`, which `<hp-ring>` draws as a slow indeterminate sweep, or a still ring under reduced motion. The pill colour is the Home server chip's.
- `ActivityCardView` gains `{kind: 'maintenance'; title; right; meta; note}`. The note says "Nothing to do; the NAS runs this on a schedule." `<hp-activity-card>` gains that card shape and no button.
- `done.ts`: when the maintenance activity vanishes and no Problem appeared in the Synology scope, the result is "Data scrub done" (or "Storage job done") for ten minutes.

### The stack cards

These are spec 24's `StackRule`s, appended to `RULES`:

- `internetDown`: tone `red`, for `internetState`'s `down` only (the rule is the provider's; see the note below). Body `big` is the duration. The card disappears the moment the state is no longer `down`.
- `onBackupLine`: tone `amber`, for `backup`. Body: "since {time}", the moment the primary line went down.
- `internetBack`: tone `null`, from the Internet scope's history rows: the last span at Problem that ended within 30 minutes and lasted over a minute. Body: "back after {d}".
- `firmwareWaiting`: a filler, 18:00 to 22:00, when `firmwareCount > 0`.
- `speedBelowPlan`: tone `amber`, when `speedtest.at` is within 24 hours and `downMbps < 0.5 × plan.downMbps`.

Each `go` is `{tab: 'network'}`.

**Note: `internetState` lives in the provider.** The header and the stack may not import the Network feature, so `internetState` and `activeLine` live in `src/providers/home-health.ts` from spec 27's #289 on (with `unifiNetwork`'s latency as a parameter), and spec 27's feature imports them from there. This is the two-adapters rule: the second user is already named, so the rule starts where both can read it.

### Strings

About thirty keys:

- `live.check.health.*`: the five areas' words, "Can't check {area} right now", "{area} recovering" and "{area} OK".
- `live.check.unifiOffline`.
- `network.activity.*` and `live.done.maintenance`.
- `stack.internetDown`, `stack.onBackupLine`, `stack.internetBack`, `stack.backAfter`, `stack.firmwareWaiting` (plural) and `stack.speedBelowPlan`.

They are in both catalogs. The issue lines reuse spec 27's `network.issue.*` keys.

### Performance, by construction

- The pill's `StoreController` gains the bridge's issue and scope sensors, eight ids, not the network feature's forty. The tracker and port sensors are not in `liveIds`.
- The "back" card's history loads only when the Internet scope sensor changes state, through the statistics cache, so it costs one call per outage, not one per tick.

### The moves

Each ticket is a sub-issue of #279 with its blockers as native edges.

| Ticket | What it delivers                                                                                                                    | Blocked by             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| #298   | The network in the Status checks: five area checks and unifiDeviceOffline as links of the chain, with their baselines               | #281, #287, #254, #256 |
| #299   | A Status-checks item that opens the Network tab: CheckItem.go and the popup's item as a button                                      | #282, #298             |
| #300   | NAS maintenance as a live activity: the pill's indeterminate ring, its card, and "Data scrub done" for ten minutes                  | #287, #255, #256       |
| #301   | The internet in the smart stack: the red "Internet down" card, the amber "On the backup line" card and "Internet back after 12 min" | #289, #265, #266       |
| #302   | Firmware waiting and speed below plan in the smart stack: the evening filler and the amber card                                     | #283, #289, #265, #266 |

### Implementation notes

1. **Pitfall: clear phrases for absent areas.** A house without the bridge must get neither "Internet OK" nor "Can't check": the check returns `null`, not a clear phrase. The bare-house baselines prove it.
2. **Pitfall: duplicates.** The rules' `unifi_devices` issue and `unifiDeviceOffline` describe the same thing. The integration check yields nothing whenever the bridge's `unifi` scope exists, even if it is Healthy.
3. **Pitfall: Recovering is not Healthy.** It must not end the "Internet down" card before the rules confirm recovery. The card ends when the scope leaves Problem; the "back" card starts when it reaches Healthy.
4. **Pitfall: the live house.** Today's rules report a Problem in the Containers scope (a `home-assistant` container they expect on the NAS). Once this spec ships, the pill would be red until the rules are corrected, so correct them before deploying move 1 to the live Home Assistant.
5. **Privacy**: test houses and baselines use the made-up names of spec 27's test house, never the real equipment, networks or hosts.

## Testing Decisions

- **What a good test is here**: as in spec 27, observable behaviour at the two seams of ADR 0005. A rule is called with literal `LiveInputs` or `StackInputs` at a known instant; the pill, popup and stack are driven through the harness's `hass`. No Lit internals and no test-only methods.
- **Modules tested**:
  - `checks.test.ts` gains each health check's table (each of the seven phases, an absent scope, the merged Home server) and `unifiDeviceOffline` with and without the bridge.
  - `activities.test.ts` gains `maintenanceActivity`'s texts and its null progress.
  - `done.test.ts` gains the maintenance done rule and its ten minutes.
  - `cards.test.ts` (the stack) gains the five rules at known instants: down for 4 minutes; on the backup line since a time; back 10 and 31 minutes after a 12-minute outage; a 40-second blip; firmware at 17:59 and 18:00; a speed test 23 and 25 hours old.
  - `home-health.test.ts` (the provider) gains `internetState` and `activeLine` after the move.
- **Prior art**: spec 22's `checks`, `activities`, `done` and `model` tests; spec 24's `cards` and `rotation` tests; `live-pill.spec.ts`, `smart-stack.spec.ts` and the `status-checks-*` baselines.

## Out of Scope

- **Push notifications or sounds for an outage**: the panel draws and never notifies.
- **Acknowledging, snoozing or hiding an issue in the panel**: the panel shows what the rules decide, and a stale expectation is fixed in the rules.
- **Filtering issues by area in the config.**
- **Grafana links from an item.**
- **The rules' English `detail`, `next` and `badge` labels**: never shown (spec 27).
- **An outage as a live activity**: an outage is a problem, so it belongs to the attention pill and the red stack card.

## Further Notes

- **Patterns**: Chain of Responsibility in its collecting form (Gamma et al.) for the checks and the stack rules, as in specs 22 and 24; the two-adapters rule (`docs/architecture.md`) for `internetState`'s move to the provider.
- **Reading**: specs 22, 24 and 27; ADRs 0005 and 0017.
