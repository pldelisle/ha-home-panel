# Live

The header's live-activity pill and its Status checks ([spec 22](../../../docs/specs/22-live.md)). This is the one feature without a tab: it has no `FeatureDescriptor`, because the pill is not a pane. The shell places its elements in the header (#256), and the folder keeps the dependency rule: it reads the providers and the kit, never another feature. This first move (#254) holds the Status checks as pure rules; the activities and the model come in #255, the elements in #256, the peak chip and the deletion in #257.

## The folder

```
src/providers/
  hilo.ts                  gains hiloGateway(states, config): {on, disconnected} | null
  environment-canada.ts    gains warningCount(states, config): number | null
  hydro-quebec.ts          gains balancePresent, balanceUpdated and peakReporting on its inputs
  power.ts                 a room gains present (its thermostat is in the states)
  fordpass.ts              the car gains lockState and tireStatus (the sensors' own words)
  wallbox.ts               gains statusPresent
src/core/i18n/
  format.ts                gains durationShort(ms): `52 min`, `1 h 50`, `3 h`
src/features/live/
  README.md
  inputs.ts                readLive(states, registries, config, names, now): LiveInputs, the providers composed
  checks.ts                the fourteen checks, CHECKS (the chain) and runChecks(inputs, deps)
  ids.ts                   liveIds(store): every id readLive reads
```

## The Status checks

Each check is a named `Check`: a key and `run(inputs, deps)`, which returns `null` when the check does not apply to this house (its integration is absent, so a house without Hilo has no Hilo line at all), else what it says: an `item` (`crit` or `warn`, a title and a line), `items` (one per sensor, for the open doors, the offline sensors and the low batteries) and the phrase it says when all is well (`clear`, such as "Car locked"). `CHECKS` lists them in the legacy `attention()`'s order, which is the popup's list order, and `runChecks` folds the chain: the items in chain order, then the phrases in chain order. This is Chain of Responsibility in its collecting form (Gamma et al., _Design Patterns_): every link is asked and none stops the chain.

The thresholds are the legacy panel's, compared the same way: the Hydro-Québec balance is stale after more than 36 hours, a door is a warning after more than ten minutes open, a sensor's battery under 15 percent. A fifteenth check is one function, one line in `CHECKS` and one test.

| Check                     | Applies when                                 | Item                       | Phrase                                         |
| ------------------------- | -------------------------------------------- | -------------------------- | ---------------------------------------------- |
| `hydroQuebecStale`        | the balance sensor is in the states          | warn, stale or unavailable | Hydro-Québec updating                          |
| `heatPumpOffline`         | the heat pump is in the states               | crit, with its maker       | Heat pump online                               |
| `hiloGatewayOffline`      | the gateway sensor is in the states          | crit, off or disconnected  | Hilo gateway online                            |
| `thermostatsNotReporting` | a room's thermostat is in the states         | warn, the rooms' names     |                                                |
| `criticalPeak`            | Hydro-Québec is there                        | crit now, warn coming      | No critical peak (the peak sensor has a value) |
| `weatherWarnings`         | the warnings sensor reads a number           | warn                       | No weather alerts                              |
| `tirePressureLow`         | a car                                        | warn                       |                                                |
| `carUnlocked`             | a car                                        | warn                       | Car locked                                     |
| `carNotReporting`         | a car                                        | warn, no charge reading    |                                                |
| `doorOpenTenMinutes`      | a door sensor                                | warn, one per door         |                                                |
| `sensorOffline`           | a door or motion sensor                      | warn, one per sensor       |                                                |
| `sensorBatteryLow`        | a door or motion sensor                      | warn, one per sensor       |                                                |
| `doorsClosed`             | a door sensor                                |                            | Doors closed                                   |
| `wallboxOffline`          | the charger's status sensor is in the states | warn                       |                                                |

The legacy `attention()` keeps drawing the popup until #256 switches the header to these rules.
