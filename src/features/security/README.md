# Security

What the Security tab will compute and draw ([spec 17](../../../docs/specs/17-security.md)): the cameras, the door and motion sensors, two sheets and the Home card. This folder holds the pure half and, since #224, #225 and #226, the pane, its two cards, the two sheets and the Home card (`<hp-security-pane>`, `<hp-camera-card>`, `<hp-sensor-card>`, `<hp-camera-sheet>`, `<hp-sensor-history>`, `<hp-security-card>`, each with its `.element.css`, and `mountCameraStream`): the rules that find the cameras and the sensors (in `src/providers/`, because the live pill, the stack and the Home pane read them too, [ADR 0025](../../../docs/adr/0025-shared-reads-live-in-providers.md)), `readSecurity` that composes them, `securityIds` that lists what the pane reads, and the model, the history sheet's rules and the glow rule that word and compute everything the elements place, pinned in Vitest (#222, #223). A tap on a camera or a sensor is a `SheetRequestEvent` the sheet host answers; the pane draws the sheet that is open, and the legacy stack opens the same sheets through the host until #266. The Home card is placed by the guest through the Home-card bridge ([ADR 0024](../../../docs/adr/0024-home-card-bridge.md), [ADR 0026](../../../docs/adr/0026-bridged-card-draws-its-own-box.md)); the files below that do not exist yet are the spec's plan.

## The folder

```
src/providers/
  door-motion.ts           doorMotionSensors(states, registries, names): SensorInputs[]; sensorKind(deviceClass)
  unifi-protect.ts         protectCameras(states, registries, names): CameraInputs[]; the channel, motion and name rules
  camera-source.ts         CameraInputs, CameraSource: the port the adapter imports, so no provider imports a cycle
  cameras.ts               CAMERA_SOURCES = [protectCameras]
src/features/security/
  README.md
  index.ts                 securityFeature; exports <hp-security-card>
  ids.ts                   securityIds(store): cameras, their motion sensors, the door and motion sensors, their battery and lux siblings
  inputs.ts                readSecurity(states, registries, names, sources): SecurityInputs
  model.ts                 securityModel(inputs, deps): SecurityViewModel (the camera tiles, the sensor rows, the summary lines, the Home card's)
  history.ts               segments, stripBars, axisLabels, periodStats, axisTicks, durationText, eventRows, statTiles, sheetTexts: the history sheet's rules
  activity.ts              activeOf(sensors), newlyActive(prev, next): string[] (the glow rule), pure
  sheets.ts                CAMERA_SHEET, HISTORY_SHEET, entityIdOf(detail)
  security-pane.ts         <hp-security-pane>
  security-card.ts         <hp-security-card>: the Home card, placed by the guest through the Home-card bridge
  camera-card.ts           <hp-camera-card>
  sensor-card.ts           <hp-sensor-card>
  camera-sheet.ts          <hp-camera-sheet>
  camera-stream.ts         mountCameraStream(box, {hass, stateObj, alt, offline}): {destroy()}
  sensor-history.ts        <hp-sensor-history>
  *.element.css            each element's own rules, beside it
```

## The providers

`doorMotionSensors` lists every visible, primary `binary_sensor` whose `device_class` is a door class (`door`, `window`, `opening`, `garage_door`) or a motion class (`motion`, `occupancy`, `presence`) and that is not on the `unifiprotect` platform (its motion shows on the camera tile). A hidden sensor is left out, and so is one with an `entity_category`, a diagnostic. Each sensor reads its area from the entity, else from its device; its name from the device through the resolver, else the entity's, without a leading "Détecteur de mouvement "; and its battery and illuminance from the `sensor.*_battery` and `sensor.*_illuminance` of the same device. The list is **doors first, then each kind by name**. The output is inputs, not a view: `on`, `available` and `since` are values, and the model words "Open" and "for 12 min".

`protectCameras` reads the `camera.*` entities of the `unifiprotect` platform, or of no platform when the attribution says Unifi or Protect, and skips a hidden one, a `_radar` and an `insecure` stream. Protect makes a stream per resolution of each device, so **one tile per device**, and the channel rank decides which: `_high` (or `high_resolution`) is 0, `_medium` 1, any other 2, `_low` 3, and the lowest rank is kept, the first one listed on a tie. A camera with no device is its own. The motion sensor is the device's `binary_sensor.*motion*` that is not a `*detection*`, preferring one that ends in `_motion`; it gives `motion` as `{on, since}`, null when it is unavailable, and `motionId` always. The name is the device's through the resolver without the `(High|Medium|Low)( Resolution Channel)?` suffix; the list is by name.

`CAMERA_SOURCES` is a list of one, a hypothetical seam by ADR 0005's reasoning: a generic `camera.*` adapter would show cameras the legacy panel hides, a visible change with its own baseline, and the list makes it a one-file addition. `readSecurity` joins the sources in list order and reads the sensors beside them; `securityIds` lists every camera, its motion sensor, every sensor and its two siblings, once each.

## The model and the sheet's rules

`securityModel` takes the inputs and `{now, t, fmt}` and returns every string and flag the elements place: the pane's summary, the camera tiles (the snapshot with the ten-second stamp `Math.floor(now / 10000)`, the line under the name, the sheet's line), the sensor rows (`main` and the `sub` joined with " · ", the tone), the card's line and the Home card's. `sensorState`'s rules are copied as they were: a door's "for 12 min" is a catalog message over `fmt.ago`'s kind and count (no "ago", and the formatters hold no words), a closed door or an idle sensor says `fmt.ago` through the catalog, a battery under 20 percent is worth a word, and an unavailable sensor is "Offline" whatever else it says. `history.ts` is `sensSheet`'s data half: the on-periods of a sensor's states, their statistics, the axis, the last forty rows and the four tiles. `newlyActive` is `secWatch`'s rule over two readings, and `activeOf` the reading the model puts on the Home card's half as `home.active`. The snapshots, the "ago" lines and the idle clock are redrawn by `TickController` (`src/ui/controllers/tick.ts`).

## The Home card

`<hp-security-card>` is the Home tab's compact card, and the Home-card bridge's second use ([ADR 0024](../../../docs/adr/0024-home-card-bridge.md)): `build()` writes its tag into `#hsec` once per draw, and nothing else. It runs `securityModel` in `willUpdate` and places `home` (the line, the first four cameras, the rows or the hint); it listens to `securityIds` and draws again every ten seconds while connected, which asks a camera for a new snapshot. Its host is `display: contents` and its box is an inner element, so the container takes none and the card is an item of the guest's grid, with the glass on the inner box ([ADR 0026](../../../docs/adr/0026-bridged-card-draws-its-own-box.md)). The header dispatches `tab-select` with `cams`, which the shell's frame hears; a camera or a sensor dispatches a `SheetRequestEvent`.

The glow is element state over `newlyActive`: the card keeps the last `home.active` as `previous`, undefined until its first draw, so the first draw never glows; a non-empty list sets the `glow` class on the box for 2.8 seconds, one timer that a second sensor starts again and that its disconnection clears. Its box, `.lbl`, chevron (`.chev`, the legacy `.go`), hint (`.nosens`, the legacy `.hint`) and `.sic` rules are copies of the legacy sheet's under selectors of their own (named in its `.element.css`), as the styles-split test wants, which the Home move (spec 24, #268) deletes with the bridge. The legacy panel's `cameras()` and `sensorState()` have no caller left and go with #227.
