# Spec 11: Catalogs, formatters and display names from the Home Assistant profile

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 2.
Depends on: [10 entity store](10-entity-store.md) (the store's `language`, `timeZone` and `config`). Blocks: [13 config schema](13-config-schema.md) (the config-error card is the first new text; the `names:` key is read here and parsed there).
Ships as: one pull request, a minor release (a house whose Home Assistant names are not in the display language sees them translated). ADR 0013 lands with it.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The panel is written in English and formats every date, time and number for Canadian English by hand: `'en-CA'` appears at 29 sites in the class, the legacy helpers and the Automations module, with a post-processor that turns the locale's `p.m.` into the house's `pm`, and five more sites pick `'fr-CA'` or `'en-CA'` from the French flag for the idle clock. French is produced afterwards by the rewrite layer: a MutationObserver finds every text node, parses English dates, times and numbers back out of the text with twelve regular expressions (so `Nov 7, 4:07 pm` becomes `7 nov. 16 h 07` and `1,234.5` becomes `1 234,5`), replaces them with `{n}`, looks the rest up whole in a 1,700-line map, and puts the values back. A reworded English string silently stays English (issues #81, #90 and #91 were each one of those). A plural is a string concatenation (`plural(n, 'door')`). Nothing says which strings exist, so nothing can check that French has them all. A third language would be a second rewrite layer. Home Assistant knows the user's language, 12- or 24-hour preference and number format, and the panel reads only the language.

Names are the other half. The names people gave in Home Assistant (`Salon`, `Cuisine`, `Lampe du salon`) are shown as they are in both languages: the rewrite layer keeps a list of them precisely so it never touches them. So an English-speaking guest reads `Salon` on the Lights tab, and the owner's decision of 2026-11-08 is that this is wrong: the panel should read `Living room` in English and `Salon` in French, uniformly, for every name it shows.

Phase 3 moves one feature at a time into Lit templates, where strings are written once in a template; those strings need a catalog to come from, a formatter to format with and a resolver to name things with, and all three must exist before the first move.

## Solution

Three small modules under the core, all pure, all built from the user's Home Assistant profile and the house's config, carried by the store and rebuilt when the language or time zone changes:

- **Formatters**: one factory that, given a locale (language tag, time zone, 12/24-hour and number-format preferences), returns the dozen date, time and number functions the panel uses, built on `Intl` (Unicode CLDR data, the same source Home Assistant's own `formatTime` and `formatNumber` use) and carrying the three **house rules** the rewrite layer applies today (English `pm` without periods, French `16 h` for a time on the hour, narrow no-break space as the French thousands separator).
- **Catalogs**: an English catalog that is the source of message keys, a French catalog the compiler requires to have every one of them, ICU MessageFormat messages with plurals and placeholders through `intl-messageformat` (the FormatJS library Home Assistant uses), and a `t(key, values)` with typed keys.
- **Display names**: one resolver every Home Assistant name passes through: the house's own `names:` overrides from the config, then a built-in dictionary of common room words, then the name as given. Names are domain data, not code strings (Evans's ubiquitous language applies to the house too), so they live in the config, not in the catalog.

In this phase the old class formats through the formatter module **pinned to English**: the rewrite layer needs English text to work from until phase 4 deletes it, so switching the class to French output now would break every templated lookup in the map. The `'en-CA'` literal leaves the class and lives in one place. The class does adopt the display-name resolver now, since the layer is told to leave resolved names alone. One string moves to the catalog as the tracer bullet (the charts-failed toast), so the path from key to French text is exercised on the tablet by a release that changes no pixel in the test house.

## User Stories

1. As a maintainer, I want every date, time and number the panel shows to go through one module, so that a format decision is made once and not 34 times.
2. As a maintainer, I want the English output of that module to be byte-identical to today's, so that this release changes no pixel in the test house and phase-3 moves do not either.
3. As a French-speaking user, I want a time on the hour to read `16 h`, a date to read `7 nov.` and a thousand to read `1 234`, as today, so that the move away from the rewrite layer changes nothing I see.
4. As a household member whose Home Assistant profile says 24-hour time, I want new panel code to show `16:07` in English, so that the panel follows the preference I already set.
5. As an adopter with a German Home Assistant, I want dates and numbers in German format, so that `7. Nov.` and `1.234,5` come from `Intl`, not from a map written for one house.
6. As an English-speaking household member, I want the room Home Assistant calls `Salon` to read `Living room`, so that the panel speaks one language at a time.
7. As a French-speaking household member, I want that same room to read `Salon`, so that the names I gave my house are the names I see.
8. As an admin, I want to name a room, light or scene per language in the panel's config, so that `Lampe du salon` can read `Living room lamp` in English without renaming it in Home Assistant.
9. As an admin, I want common room names translated without configuring anything, so that `Cuisine` reads `Kitchen` out of the box.
10. As a maintainer, I want a message key that French does not have to be a compile error, so that French cannot lapse behind English again.
11. As a maintainer, I want plurals and placeholders expressed in the message, so that `one door open` and `2 doors open` are one key and no `if`.
12. As a maintainer, I want a test that the French message has the same placeholders and plural categories as the English one, so that a typo in `{n}` is caught before it ships.
13. As an adopter, I want to add a language by adding one catalog file, so that the panel can speak Spanish without a rewrite layer.
14. As an agent thread, I want the formatters, catalogs and name resolver tested in Vitest with fixed instants and a fixed time zone, so that a test passes on any machine in any country.
15. As an agent thread, I want the formatters to be the one place that knows the three house rules, so that a phase-3 move can read the rule and not rediscover it from a screenshot diff.
16. As a maintainer, I want one legacy string moved to the catalog in this release, so that the whole path (key, French text, the tablet) is proven before phase 3 relies on it.
17. As a learner, I want the ADR and module headers to say why ICU MessageFormat and CLDR are the standard and what the house rules override, so that I learn where locale data comes from.
18. As CI, I want the catalogs, formatters, locale derivation and name resolver at full statement coverage, so that the phase-2 gate is enforced.
19. As a maintainer, I want the fallback when Home Assistant has no country to be today's behaviour, so that a house that never set a country sees no change.

## Implementation Decisions

### Locale from the profile

`src/core/i18n/locale.ts` exports a pure function from `PanelHass` to a `PanelLocale`:

- `tag`: the BCP-47 tag `Intl` is given. `hass.locale.language` when it already carries a region (`pt-BR`, `en-GB`); otherwise the language plus `hass.config.country` (`fr` + `CA` → `fr-CA`, `de` + `DE` → `de-DE`); when the country is missing, `CA`, which is today's behaviour. The region matters: plain `fr` gives `16:07` where `fr-CA` gives `16 h 07`.
- `timeZone`: `hass.config.time_zone`, else the store's default.
- `hour12`: from `hass.locale.time_format`: `language` → undefined (the tag decides), `12` → true, `24` → false, `system` → the browser's default, passed in by the shell (the core does not read `navigator`).
- `numberLocale` and `useGrouping`: from `hass.locale.number_format` as Home Assistant's own `formatNumber` maps it: `language` → the tag, `system` → the browser's locale (passed in), `comma_decimal` → `en-US`, `decimal_comma` → `de`, `space_comma` → `fr`, `none` → the tag with grouping off.
- `language`: the bare language (`fr`), which picks the catalog and the name column.

The store (spec 10) exposes `locale`, `fmt`, `t` and `names`, rebuilt when `setHass` reports a locale or config change. The harness's `hass.config` gains `country: 'CA'`.

### Formatters

`src/core/i18n/format.ts` exports `createFormatters(locale: PanelLocale)`. Every function passes the time zone to `Intl` explicitly; none reads the clock or the DOM. The set is what the class, the legacy helpers and the Automations module do today, and each row names the sites it replaces so the rewrite is mechanical:

| Function                      | English (en-CA, house rules)  | French (fr-CA, house rules) | Replaces                                                                                             |
| ----------------------------- | ----------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `time(d)`                     | `4:07 pm`, `4:00 pm`          | `16 h 07`, `16 h`           | `fmtTime` (legacy globals), the two departure-time sites, the fr-CA idle-clock and lock-screen times |
| `hour(d)`                     | `4 pm`                        | `16 h`                      | `fmtHour`                                                                                            |
| `time24(d)`                   | `16:07` (`00:…`, never `24:`) | `16:07`                     | `auHM`                                                                                               |
| `time24s(d)`                  | `16:07:09`                    | `16:07:09`                  | `auClock`                                                                                            |
| `date(d)`                     | `Nov 7`                       | `7 nov.`                    | `fmtDate`, `fmtDay`, the chart month-day labels                                                      |
| `dateWeekday(d)`              | `Sat, Nov 7`                  | `sam. 7 nov.`               | the sessions table, the Automations "today" pill                                                     |
| `dateLong(d)`                 | `Saturday, November 7`        | `samedi 7 novembre`         | the header date, the idle clock, the lock screen                                                     |
| `weekday(d, 'long'\|'short')` | `Saturday`, `Sat`             | `samedi`, `sam.`            | the heat-map and calendar weekday labels (the call site keeps its French capitalisation)             |
| `month(d, 'long'\|'short')`   | `November`, `Nov`             | `novembre`, `nov.`          | the energy month labels (the call site keeps composing `Nov '26`)                                    |
| `isoDay(d)`                   | `2026-11-07`                  | `2026-11-07`                | `localDay` (today it relies on en-CA's numeric date being year-month-day; now `formatToParts`)       |
| `dayParts(d)`                 | `{day, h, wd}`                | same (`wd` localised)       | `localParts` and its hour-bucket cache, which moves inside the formatter instance                    |
| `hourNow(now)`                | `16.12` (fractional hour)     | same                        | `hourNow`                                                                                            |
| `integer(n)`                  | `1,234`                       | `1 234` (U+202F)            | the 7 `Math.round(v).toLocaleString('en-CA')` sites                                                  |
| `number(n, maxFraction)`      | `12.5`                        | `12,5`                      | the 6 `toLocaleString('en-CA', {maximumFractionDigits})` sites, chart labels included                |

The three house rules, carried from the rewrite layer so that a phase-3 move changes no pixel, and the only post-processing the module does:

1. **English day period**: `a.m.`/`p.m.` from `en-*` tags become `am`/`pm` (today's `ampm()`); applies to every `en-*` tag, since the house style is the panel's, not Canada's.
2. **French time on the hour**: `16 h 00` becomes `16 h`, and `hour()` for `fr-*` adds ` h` (`Intl` gives a bare `16`), as the rewrite layer's `frH` renders today.
3. **French thousands separator**: `Intl`'s U+00A0 becomes U+202F (narrow no-break space), the character the rewrite layer writes today; applies to `fr-*` tags.

Other locales get `Intl`'s output as is. `number()` MUST clamp `maxFraction` to 2: the rewrite layer's bare-number rule would otherwise mangle a French number with three decimals, and nothing in the panel shows more than two. The module header says the rules are deliberate overrides of CLDR and names them; the ADR says why each exists (a pixel contract with the baselines, and one typographic preference).

### Display names

`src/core/i18n/names.ts` exports `createNames(config, language, hass)` returning `name(key)`, where `key` is an entity id, an area id or a device id. Resolution, first match wins:

1. The house's `names:` block in the panel config (parsed by spec 13; read here as `Record<string, Partial<Record<language, string>>>`): the key is an entity id, an area id, or the exact Home Assistant name, and the value gives one name per language. `names: {Salon: {en: Living room}, light.lampe_salon: {en: Living room lamp}}`.
2. The built-in dictionary, `src/core/i18n/room-names.ts`: common room and zone words in English and French, matched on the **whole** name, case- and accent-insensitive, in either direction (`Salon` ↔ `Living room`, `Cuisine` ↔ `Kitchen`, `Chambre` ↔ `Bedroom`, `Chambre principale` ↔ `Main bedroom`, `Bureau` ↔ `Office`, `Salle de bain` ↔ `Bathroom`, `Salle à manger` ↔ `Dining room`, `Salle de lavage` ↔ `Laundry room`, `Sous-sol` ↔ `Basement`, `Entrée` ↔ `Entrance`, `Couloir` ↔ `Hallway`, `Garage`, `Extérieur` ↔ `Outside`, `Cour` ↔ `Backyard`, `Terrasse` ↔ `Deck`, `Vestibule`, `Grenier` ↔ `Attic`, `Buanderie` ↔ `Laundry`; the list ships as data and grows by pull request). A compound name (`Lampe du salon`) does not match; it needs an override, since word-by-word substitution produces `Living room lampe`.
3. The name as Home Assistant gives it: the entity's `friendly_name`, the area's `name`, the device's `name_by_user` else `name`.

The class's reads of `friendly_name`, area names and device names (about twenty sites: light tiles, climate rooms, scenes, sensors, cameras, media players, air purifiers, the car, the heat pump) go through `this.store.names.name(…)`. The room name that `resolveConfig` derives from the thermostat keeps its rule and is then resolved like any name. The French layer's skip list is built from both the Home Assistant names and the resolved names, so a resolved `Living room` is not re-translated to anything and a resolved `Salon` is left alone. The test houses use English names, so no baseline changes; the owner's house changes in English, which is the point of the minor release.

### The old class formats in English, through the module

The class holds two formatter sets: `this.fmt` is the store's locale-aware one, for new code; `this.fmtEn` is `createFormatters` of the English locale with the store's time zone, for every existing site, because the rewrite layer parses English. The 34 `toLocale*` and `Intl.DateTimeFormat` sites and the legacy helpers are replaced by `this.fmtEn.x()` per the table; the five sites that already branch on the French flag to pick `fr-CA` (idle clock, lock screen, heat-map weekday) use `this.fmt` instead, since their output was already French and already passed through the layer unchanged. The `ampm` and the time-dependent legacy helpers are deleted. The Automations module's `auClock` and `auHM` become calls on `this.fmtEn`. `this.fmtEn` is deleted in phase 4 with the rewrite layer and `isFrench`.

### Catalogs

- `src/core/i18n/en.ts` exports `en` as a `const` object of `namespace.key` → ICU message; `MessageKey` is `keyof typeof en`. `src/core/i18n/fr.ts` exports `fr` typed `Record<MessageKey, string>`, so a missing or extra French key fails `npm run typecheck`. A third language is a third file and one line in the catalog table.
- `src/core/i18n/messages.ts` exports `createMessages(locale, catalogs?)` returning `t(key, values?)`: compiles each message once with `intl-messageformat` for the locale's tag, caches by key, falls back to the English message when the language has no catalog. Keys are typed; values are `Record<string, string | number | Date>`. `catalogs` defaults to the shipped ones and exists so a test can pass its own.
- Messages use ICU plurals (`{n, plural, one {# door open} other {# doors open}}`) and named arguments; the Québec French forms in the current map are the reference text when a string moves. Why ICU MessageFormat and not `{n}` templates: plural categories differ by language (French has `one` for 0 and 1; Polish has four), and CLDR carries those rules so the message does, not the code.
- Resolved display names are passed to `t()` as values, never as keys.
- **Tracer bullet**: the charts-failed toast (`Charts library failed to load`, a constant in the class with an entry in the French map) becomes `charts.failed` in both catalogs, the toast calls `this.store.t('charts.failed')`, and the map entry is deleted. The French text is the map's text, so the toast reads the same in both languages.
- `intl-messageformat` is a production dependency, pinned exactly, listed in `LICENSES.md` by `npm run licenses`. It enters the main chunk (about 16 KB gzipped with its parser); the size is quoted in the PR.

### Tests

- Formatters, in Vitest, with `timeZone: 'America/Toronto'` passed in and instants written as ISO strings, for `en-CA`, `fr-CA` and `de-DE`: every row of the table at 16:07 and 16:00; `isoDay` of an instant that is the next day in UTC; `hourNow`; `integer` of 1 234 567 asserting U+202F in French; `number` with 1 and 2 fraction digits and the clamp of 3 to 2; `time_format` `24` in English giving `16:07`; `number_format` `decimal_comma` in English giving `12,5`; `none` giving no grouping. Expected strings are written out as literals, never built by code under test. The test file asserts at start that `Intl.DateTimeFormat('fr-CA').resolvedOptions().locale` is `fr-CA`, so a Node without full ICU fails loudly instead of passing on English.
- **Equivalence with the rewrite layer**: for each sample instant and number, the French formatter's output equals `createFrench(store).text(fmtEn.x(v))`, the layer's translation of the English output. This is the proof that phase-3 moves can switch a feature to `this.fmt` without a pixel change; it is deleted with the layer in phase 4.
- Names: an override by entity id, by area id and by exact name; the dictionary in both directions, case- and accent-insensitive; a compound name left alone; a name with no match returned as given; a missing `names:` block; the French layer leaving a resolved name alone in both languages.
- Catalogs: every English key is in French (also a compile error); the ICU argument names and plural categories of each pair match, parsed with the parser `intl-messageformat` depends on; no message is empty; `t` renders a plural in both languages from a test catalog; an unknown language falls back to English text.
- Locale: the tag for `fr` + `CA`, `de` + `DE`, `pt-BR` + anything, `en` + no country; each `time_format` and `number_format` value.
- Screenshot baselines unchanged; Playwright suites unchanged; a new behaviour spec opens the full house with `names: {'Living room': {fr: 'Salon'}}` in French and expects `Salon` on the Lights tab, and in English expects `Living room`. The French unit tests keep passing (the map lost one entry).

## Acceptance Criteria

1. `grep -rnE "toLocale(Date|Time)?String|Intl\.(DateTimeFormat|NumberFormat)" src/ | grep -v '^src/core/i18n/'` returns nothing; `grep -rn "en-CA\|fr-CA" src/ | grep -v '^src/core/i18n/'` returns nothing; `grep -rn "friendly_name" src/home-panel.js src/auto.js` matches no display site (reads that feed the name resolver or a non-display rule are listed in the PR).
2. `grep -n "Charts library failed to load" src/` returns nothing; the toast in both languages is the same text as before (the French unit test asserts `t('charts.failed')` in French equals the map's former text, written out).
3. The visual project passes with no baseline updated; the behaviour suites pass; the new names spec passes.
4. Vitest covers `src/core/**` at 100 percent statements; the tests listed above exist and pass; the equivalence test covers every row of the formatter table.
5. Deleting one key from `fr.ts` fails `npm run typecheck` (checked once in the PR and reverted).
6. `intl-messageformat` is pinned in `package.json`, present in `LICENSES.md`, and `npm run licenses` changes nothing after the PR.
7. `docs/adr/0013-locale-catalogs-and-names.md` exists (accepted); the four modules open with the header convention; `CONTEXT.md` gains "house rule", "display name" and "message key" if not already there.
8. `npm run size` before and after is quoted in the PR.
9. A changeset (minor) says: "Room, light and scene names now follow the panel's language: a room Home Assistant calls Salon reads Living room in English, and `names:` in the config sets a name per language. Dates, times and numbers are formatted in one place, ready to follow each user's Home Assistant time and number settings as features move."

## Testing Decisions

Formatters, catalogs, the locale derivation and the name resolver are pure functions and are tested as the config and stack modules are: literal inputs, literal expected strings, no mocks. The equivalence test uses the existing rewrite layer as an oracle for French, which is the one time a test may compute an expectation, because the thing being pinned is "the same as the layer" and the layer is itself tested with literals. The names spec in Playwright is the user-level proof of the visible change. Prior art: `config.test.mjs`, `stack.test.mjs`, `i18n.test.mjs`, the tabs spec.

## Out of Scope

- Moving any legacy string other than the charts-failed toast to the catalog (each phase-3 move carries its feature's strings; phase 4 deletes the map).
- Deleting the rewrite layer, `isFrench` or `fmtEn` (phase 4).
- Reading Home Assistant's own area or entity aliases as names: they are not tagged by language, so they cannot say which is English. Noted in the ADR as a possible later source.
- Word-by-word translation of compound names.
- `date_format` from the profile (`DMY`, `MDY`, `YMD`): it governs numeric dates, which the panel never shows. `first_weekday` (no calendar grid).
- Translating unit symbols or chart library strings (`frApex` stays until the Energy and Climate moves).
- A German catalog: the test proves `de-DE` formatting works; no German text is written.

## Notes

- Why the class cannot format in French yet: the map's templated entries are matched after the layer has parsed English dates, times and numbers out of a text node (`Live · history 4:07 pm` → `Live · history {n}`). French output from the class (`16 h 07`) would not parse, the template would not match, and the string would stay half English. Hence `fmtEn` until phase 4. The programme spec's "the `en-CA` hard coding is removed" is read as "leaves the class for one module"; the programme records the amendment, as it records the reversal of "names are never translated".
- `Intl` results checked on Node 24 with full ICU, 2026-11-08: `en-CA` gives `Nov 7`, `4:07 p.m.`, `1,234.5`, `Sat, Nov 7`, `2026-11-07`; `fr-CA` gives `7 nov.`, `16 h 07`, `16 h 00`, a bare `16` for hour only, `1 234,5` with U+00A0, `sam. 7 nov.`, `samedi 7 novembre`; plain `fr` gives `16:07`; `de-DE` gives `7. Nov.`. `en-CA` with `{month: 'short', year: '2-digit'}` gives `Nov ’26` with a curly apostrophe, which is why the energy label keeps composing `Nov '26` at the call site from `month()`.
- Chromium and Node share ICU; the tablet's kiosk browser is Chromium. Safari's ICU may differ in a space or a period for some locale; the French baselines run in Chromium, and WebKit joins the smoke run in phase 3, where a difference would show as text, not as a failed test.
- The month-of-year date parsing with `T12:00:00` (local noon, to dodge a day shift) stays at the call sites that parse a `YYYY-MM-DD` key; the formatters take an instant and format it in the panel's time zone.
- Reading: Unicode CLDR (the data behind `Intl`); ICU MessageFormat and the FormatJS docs for `intl-messageformat`; Home Assistant frontend `src/common/datetime/format_time.ts` and `src/common/number/format_number.ts` for the profile mapping; Evans, _Domain-Driven Design_, on ubiquitous language (why names are data).
