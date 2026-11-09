# 0013: The panel speaks the language of the user's Home Assistant profile, through formatters, catalogs and a name resolver

Status: accepted (2026-11-09)

## Context

The panel was written in English and formats every date, time and number for Canadian English by hand: `'en-CA'` appeared at 29 sites in the class, the legacy helpers and the Automations module. French was made afterwards by a rewrite layer that watches every text node, parses English dates, times and numbers back out of the text with regular expressions, looks the rest up whole in a 1,700-line map and puts the values back, so a reworded English string silently stayed English (issues #81, #90 and #91). A plural was a string concatenation, and nothing said which strings exist, so nothing could check that French has them all. Home Assistant already knows the user's language, 12 or 24-hour preference, number format and country, and the panel read only the language. The names people gave their rooms and lights (`Salon`, `Cuisine`) were shown as they are in both languages, and the owner decided on 2026-11-08 that an English-speaking guest should read `Living room`.

The alternatives were to extend the rewrite layer (a third language would be a second layer, and it parses its own output), to add a `language:` option to the panel config (a second place to say what the profile already says, and one setting for a whole house where Home Assistant has one per user), to give each feature its own locale handling (the same rules written many times), and to translate names word by word (`Lampe du salon` becomes `Living room lampe`).

## Decision

What the panel shows follows from the signed-in user's Home Assistant profile, `hass.locale` and `hass.config`, read by one pure function at the hass seam, `panelLocale`, and carried by the store. Three pure modules in `src/core/i18n/` are built from it and rebuilt when the language, the time zone, a format or the config changes: the formatters (`Intl`, which carries Unicode CLDR data, the same source Home Assistant's own `formatTime` and `formatNumber` use), the catalogs with `t(key, values)` (ICU MessageFormat through `intl-messageformat`, the library Home Assistant's frontend uses), and the display-name resolver `names.name(key)`.

## Consequences

The rest of the shape follows from the profile being the one source.

- The tag is the profile's language with Home Assistant's country (`fr` and `CA` give `fr-CA`), and `CA` when the country is missing, which is today's behaviour; the region matters because plain `fr` gives `16:07` where `fr-CA` gives `16 h 07`. The 12 and 24-hour and number-format preferences map as Home Assistant's own code maps them. The core never reads `navigator` or the clock: the browser's defaults come in as parameters.
- Three house rules are the only post-processing the formatters do, because the screenshot baselines are the contract of the rewrite (ADR 0004) and one typographic preference is the household's: English `am` and `pm` without periods, a French time on the hour as `16 h`, and a narrow no-break space as the French thousands separator. They are deliberate overrides of CLDR, named in the module header, and they are the one place a phase-3 move reads them from.
- Message keys are typed. The English catalog is the source of keys, `MessageKey` is `keyof typeof en`, and the French catalog is `Record<MessageKey, string>`, so a missing or extra French key fails `npm run typecheck`; a third language is one file and one line in the catalog table. Plurals and placeholders are written in the message (`{n, plural, one {# door} other {# doors}}`) because plural categories differ by language and CLDR carries those rules, so the message does and the code does not.
- Names are data, not strings in the code. The resolution order is the config's `names:` block (an entity id, an area id, a device id or the exact Home Assistant name, each with one name per language), then a built-in dictionary of common room words matched on the whole name in both directions without case or accent, then the name as Home Assistant gives it. A resolved name is passed to `t()` as a value, never as a key. A compound name (`Lampe du salon`) is left alone and needs an override. The dictionary is a table that grows by pull request.
- Home Assistant's own area and entity aliases are not a source: they carry no language tag, so the panel cannot tell which one is English. They are a possible later source if Home Assistant tags them.
- The old class formats and names through the same modules but pinned to English (`fmtEn`) for the formatters, because the rewrite layer parses English until phase 4 deletes it. The display names are not pinned: they follow the profile now, and the layer's skip list holds both the Home Assistant name and the resolved name, so a resolved name is never run through the map.
- The store compares the language and the time zone against what it last saw, not against the previous `hass` object, because a host may change the language on the object it already handed over; the names, like the messages, are rebuilt on that change and on a config change, and read the current `hass` when asked, so a renamed light shows at once.
- The cost: `intl-messageformat` is a production dependency in the main chunk, about 16 KB gzipped with its parser. A name nobody translated reads in the Home Assistant language whatever the profile says. English and French are the only catalogs, so a German profile gets German dates and numbers and English text.

## Read

`docs/specs/11-catalogs-and-formatters.md`, "Locale from the profile", "Display names" and "Catalogs".
