# The idle clock

The big clock the idle screen shows after a few minutes without a touch ([spec 26](../../../docs/specs/26-idle-clock.md)): the time, the date, the temperature inside and outside, the condition's icon beside the time, and the next sunrise or sunset. The clock is no tab, so the folder has no descriptor: the shell's `<hp-idle-screen>` composes `<hp-clock>` beside the smart stack. #276 moved it out of the legacy panel (`renderIdle`, `sunDay` and the clock's interval).

## The folder

```
src/features/clock/
  README.md
  index.ts             the feature's export: HpClock and CLOCK_TICK_MS (importing it defines <hp-clock>)
  ids.ts               clockIds(store): the temperatures, the sun and the condition sensor
  inputs.ts            readClock(states, config, place, {now, isoDay}): ClockInputs
  model.ts             clockModel(inputs, {t, fmt, isFrench}): ClockViewModel
  clock.ts             <hp-clock>: the view model drawn, every twenty seconds while active
  clock.element.css    its own rules (ADR 0019)
```

## The inputs

`readClock` reads the house's temperatures through the `home-temperatures` provider (the greeting's line reads the same), the sun's state, today's and tomorrow's sunrise and sunset (`sunTimes` at the house's place), and the condition: the config's condition sensor, else the weather entity's state. Nothing in it reads the clock: `now` is given.

## The model

`clockModel` words everything: the time in the panel's language (24-hour in French, as the legacy clock was), the long date, "20.8° inside · -3.1° outside" (`clock.inside`, `clock.outside`), the icon's label, and the next sun event: the sunrise before it, the sunset during the day, tomorrow's sunrise after dark (`clock.sunrise`, `clock.sunset`).

## The element

`<hp-clock>` subscribes to `clockIds` only while `active` (ADR 0012) and redraws every twenty seconds while active (`CLOCK_TICK_MS`). `beside` makes it the smaller clock that sits next to the stack. The drift that keeps the screen from burning in is the idle screen's (`src/shell/drift.ts`), not the clock's.
