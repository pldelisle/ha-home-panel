# 0015: Parse, don't validate: one schema types and parses the config, and its problems are values

Status: accepted (2026-11-09)

## Context

The panel's `config:` block was documented in `examples/configuration.yaml`, resolved by a pure function and typed by a hand-written declaration file that carried a `TODO` admitting it should be derived from the code. The resolver took what it recognised and ignored the rest, so `peoples:` instead of `people:` showed every person, `icon: couch` fell back to a guess, `light_links: [[office]]` vanished and `reminders: [{at: 8pm}]` never fired, all without a word. Each check was scattered through the resolver and discarded what it had learned, which is what Alexis King calls shotgun parsing: the type of the result said nothing about what had been checked, and the type of the input was a second copy that could drift. The alternatives were a hand-written checker (the type stays a second copy), JSON Schema with a validator (a schema language beside the code, and a type still to derive), a library that throws on the first problem (one bad room would blank the energy flow, and an admin wants every problem at once), and Home Assistant's own approach, which is a schema per card that throws from `setConfig`.

## Decision

One schema, written with superstruct, is the single source of the config's type and of its parser: `PanelConfig` is inferred from it, and `checkConfig` reads a config against it and returns the problems as values, each with a path, a message key and the message's values, never throwing. `resolveConfig` runs on the config with everything `checkConfig` reported dropped, so the panel is a tolerant reader (Fowler): a bad leaf takes its default, a bad list element is dropped and the others kept, an unknown key is ignored and named, with a "did you mean" when a valid key is within two edits.

## Consequences

- Because the type is inferred from the schema, the type and the parser cannot disagree, and `ResolvedConfig` and the store's `config` are typed from the core instead of `any`; a valid config resolves to exactly what it did before, which the old config tests prove unchanged.
- Because problems are values, one config can report every mistake at once and still run. This is why the checker and the resolver are two functions and not one parse that throws: King's essay wants a parser to return a value whose type proves what was checked, and `resolveConfig` does return one (the pruned config is a `PanelConfig`), but the panel must also say what it dropped.
- superstruct is the library Home Assistant's frontend validates card configs with, about three kilobytes gzipped in the entry (151.45 kB to 154.89 kB with this change), pinned exactly and listed in `LICENSES.md`; the entry's source-map test now names it with intl-messageformat as the libraries built in. The cost is a production dependency for a schema of a few dozen lines.
- superstruct's `union` reports the failures of every branch it tried, which says nothing about the branch the person meant (`rooms: [{climat: climate.office}]` produced a dozen). The schema therefore chooses a branch by what the value is (an object is a room block, a text is a thermostat id, a list is a list), and a failure belongs to that branch. The price is a small helper that the ticket's sketch did not have, and a rule that a bare pair under `light_links` is a list of two texts, not a pair.
- A value of the wrong type is a problem, not a conversion: `"30"` for a number is dropped and the default applies, where the resolver used to coerce it. Home Assistant hands over YAML already typed, so a string there is a typo, and a quiet conversion would hide it. An unquoted `at: 20:00` is a number to YAML 1.1 and is reported as one.
- `_panel_custom`, which Home Assistant adds to every custom panel's config, is part of the schema, or every admin would be told about a setting they never wrote. A reminder's `at` still accepts `8:00` and surrounding spaces, as the resolver always did, so no working config becomes a problem.
- The message values `expected` and `got` are English plain words (`a number`, `text`), as the spec has them, so the French card shows a French sentence with those words in English until a later change gives them catalog entries of their own. The paths and every other word are translated.
- The inferred type is exact only under `strict`: the loose pass over the legacy files (`tsconfig.legacy.json`) reads every optional key as required, so the resolver is written without `{}` fallbacks that pass would reject. Entity keys are checked against the two lists of names beside the schema, not in it, because a record's keys are data to superstruct.
- Whether an entity exists in `hass.states` is still not checked: an entity can be unavailable at startup, and today's dash-or-hidden behaviour stays.

## Read

`docs/specs/13-config-schema.md`, "The schema".
