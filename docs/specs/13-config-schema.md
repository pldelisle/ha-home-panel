# Spec 13: The config is parsed, not validated, and a typo shows a card

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 2.
Depends on: [10 entity store](10-entity-store.md) (the store runs the resolver), [11 catalogs and formatters](11-catalogs-and-formatters.md) (the card's text comes from the catalog; the `names:` key is read there). Blocks: nothing in phase 2; phase 3's models take `ResolvedConfig` as typed here.
Ships as: one pull request, a minor release (admins see a new card when the config has a problem; a valid config changes nothing). ADR 0015 lands with it.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The panel's `config:` block is documented in `examples/configuration.yaml` and resolved by `resolveConfig()`, a pure, tested function with hand-written JSDoc types in a declaration file that a comment in it admits should be derived from the code (`TODO(#33)`). The resolver takes what it recognises and ignores the rest: `peoples:` instead of `people:` silently shows every person; `rooms: [{climat: climate.office}]` silently drops the office; `icon: couch` silently falls back to a guess; `light_links: [[office]]` (one entry, not a pair) is silently dropped; `reminders: [{at: 8pm}]` silently never fires. The admin restarts Home Assistant, sees a card missing, and reads the YAML by eye. An adopter in another house has no way to learn which key the panel did not understand. Home Assistant's own cards do better: a card whose config fails its schema shows an error card naming the problem.

This is what Alexis King calls shotgun parsing: checks scattered through the resolver, each discarding what it learned, so the type of the result says nothing about what was checked.

## Solution

**Parse, don't validate.** One schema is the single source of truth for the config: it produces the TypeScript type (`PanelConfig` is inferred from it, the declaration file's hand copy is deleted) and the runtime parser. `checkConfig(raw)` returns a list of **problems**, each with a path and a message key, and never throws; `resolveConfig(raw, states)` runs on the pruned input and returns the same `ResolvedConfig` as today for every valid config, so every existing config test passes unchanged. The panel is a **tolerant reader** (Fowler): a bad leaf is dropped and its default applies, a bad list element is dropped and the rest kept, an unknown key is dropped with a "did you mean" when one is close. An **error card** at the top of the Home tab, shown to admins only, lists the problems in the user's language through the catalog of spec 11. The schema library is `superstruct`, the one Home Assistant's frontend uses for card configs.

## User Stories

1. As an admin, I want a misspelled key in the panel's config named on a card with the path and the accepted spelling, so that I fix it in one minute instead of reading YAML by eye.
2. As an admin, I want a wrong type (`lead: thirty`) named with what was expected, so that I know what to write.
3. As an admin, I want the rest of the panel to keep working when one setting is wrong, so that a typo does not take the tablet down.
4. As an admin, I want the card to disappear when the config is clean, so that the Home tab is the Home tab.
5. As a household member who is not an admin, I want never to see a configuration card, so that the family tablet does not show me YAML.
6. As a French-speaking admin, I want the card in French, so that the panel speaks one language.
7. As an adopter, I want the schema to accept everything `examples/configuration.yaml` documents, both spellings of entity keys, the room shorthand and the long form, so that an existing config needs no edit.
8. As an admin, I want `names:` in the config to give a room, light or scene a name per language, so that the panel can call `Salon` `Living room` in English (spec 11).
9. As a maintainer, I want `PanelConfig` derived from the schema, so that the type and the parser cannot disagree.
10. As a maintainer, I want `resolveConfig` to return exactly what it returns today for a valid config, so that the config tests prove the schema changed nothing.
11. As an agent thread writing a phase-3 model, I want `ResolvedConfig` typed from the core, so that `config.rooms[0].climate` is a `string` and not `any`.
12. As a maintainer, I want the problem list to be values, not thrown errors, so that the panel can show all of them at once and the store can keep the valid parts.
13. As a learner, I want the ADR to explain parse-don't-validate and the tolerant reader with this config as the example, so that I recognise the pattern elsewhere.
14. As CI, I want the schema and the checker at full statement coverage, so that the phase-2 gate is enforced.
15. As a maintainer, I want the error card's two new baselines approved on purpose, so that a visible addition goes through the same gate as everything else.

## Implementation Decisions

### The schema

`src/core/config.ts` (TypeScript, strict) replaces `src/config.js`; the config types leave `src/types.d.ts`, which keeps only the smart-stack types until `stack.js` moves. The header names the patterns: parse, don't validate (King); tolerant reader (Fowler); schema as the single source of truth.

- `superstruct` is a production dependency, pinned exactly, in `LICENSES.md`. Why superstruct: Home Assistant's frontend validates card configs with it (`assert(config, struct)` in every card's `setConfig`), it is about 3 KB gzipped, its `Infer<>` gives the type, and its failures carry the `path` to the bad value. Why not a hand-written checker: the type would be a second copy again.
- The schema encodes `examples/configuration.yaml` in full: `people` (string or list), `house_image` (string or `{day?, night?}`), `car` (`{name?, color?, battery_kwh?}`), `entities` (a record whose keys are the snake_case aliases **or** the camelCase keys, values a string or `null`), `rooms` (a climate entity id, or `{climate, name?, icon?, key?, temperature?, target?, power?}` with `icon` in the room-icon list; one or a list), `scenes`, `modes`, `adaptive_lighting_areas` (record of strings), `split_light_areas`, `light_links` (a pair of strings, or `{lights: pair, switch?}`; one or a list), `idle_stack` (`{enabled?, sunrise_lights_off?, reminders?}` with `reminders` of `{at: 'HH:MM', title?, text?, lead?: number}`), and the new `names` (record of `Partial<Record<language, string>>`, spec 11). Scalar-or-list keys are one struct used everywhere. `PanelConfig` is `Infer<typeof panelConfig>`.
- `checkConfig(raw: unknown): ConfigProblem[]`, pure, never throws. A `ConfigProblem` is `{path: string, key: MessageKey, values: Record<string, string | number>}`: the path in the YAML (`rooms[1].icon`, `entities.grid_powr`, `idle_stack.reminders[0].at`), the catalog key of the message, and its values. The kinds and their messages (English catalog text; French in `fr.ts`):

  | Kind                    | When                                                                | Message (en)                                                            |
  | ----------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
  | `config.unknownKey`     | a key the schema does not have, at any level                        | `{path}: unknown setting.`                                              |
  | `config.unknownKeyHint` | same, when a known key is within edit distance 2                    | `{path}: unknown setting. Did you mean {hint}?`                         |
  | `config.unknownEntity`  | a key under `entities` that is neither an alias nor a camelCase key | `{path}: not an entity the panel reads. See the example configuration.` |
  | `config.wrongType`      | a value of the wrong type                                           | `{path}: expected {expected}, got {got}.`                               |
  | `config.notOneOf`       | `icon` outside the list                                             | `{path}: {got} is not one of {options}.`                                |
  | `config.notAPair`       | a `light_links` entry without exactly two cards                     | `{path}: a link needs exactly two cards.`                               |
  | `config.notATime`       | `at` not `HH:MM`                                                    | `{path}: {got} is not a time like 20:00.`                               |
  | `config.missingKey`     | a room object without `climate`                                     | `{path}: {missing} is required.`                                        |

  `expected` and `got` are plain words (`a number`, `a list`, `text`, `yes or no`), not type names. The hint uses Damerau-Levenshtein over the keys valid at that level, as `git` and `npm` do for commands.

- **Pruning.** `resolveConfig(raw, states)` first drops what `checkConfig` reported (the bad leaf, the bad element, the unknown key) and resolves the rest exactly as today; the function's signature and output shape are unchanged, and discovery (the weather entity, Environment Canada sensors by town, the Hilo gateway, thermostats, people, the FordPass car) keeps every current rule, now typed. A top-level value that is not an object counts as empty, as today.
- The store (spec 10) calls both and exposes `config` and `configProblems`; the `generation` bumps when either changes.

### The error card

- Rendered by the legacy class at the top of the Home tab's pane, before the Home card, on tablet and phone, only when `store.configProblems` is non-empty **and** `store.isAdmin`. A non-admin tablet shows the panel as it does today, since the person who can fix the YAML is the admin. The strings come from `t()`: a heading (`config.title`: "Check the panel's configuration"), a lead line with a plural (`config.intro`: `{n, plural, one {One setting} other {# settings}} could not be used and {n, plural, one {was} other {were}} ignored:`), one line per problem with the path in `<code>` and the message, and a footer (`config.footer`: "Fix configuration.yaml and restart Home Assistant."). Values are escaped by the legacy string renderer as every legacy string is; the card moves into the shell in phase 3 and becomes a Lit template.
- The card is an aside with `aria-labelledby` its heading; no live region (it is there from the first paint).
- Two new baselines in the states project: `config-error-tablet-light-en` and `config-error-tablet-light-fr`, from a config with one problem of each kind. No existing baseline changes.

### Tests

- Vitest, `config.test.ts` (the existing tests, unchanged in substance, on the TypeScript module) plus `config-check.test.ts`: every kind in the table with a literal expected `path`, `key` and `values`; the hint for `peoples`, `climat` and `grid_powr`; no hint for a far key; pruning keeps the other rooms when one is bad and keeps a valid `light_links` pair beside a bad one; a valid `examples/configuration.yaml` (parsed with the YAML parser the repo already has in `node_modules`, or a literal copy) yields zero problems; a non-object config yields zero problems and the defaults; `names` parses and reaches the resolver.
- Playwright, behaviour: the full house with `cfg: {peoples: ['Alex']}` as an admin shows the card with `peoples` and the hint; the same as a non-admin shows no card; a valid config shows no card; a bad icon still shows the room with a guessed icon. States project: the two new baselines.
- Type-level: `ResolvedConfig` is exported and used by the store's type; a test file that assigns a wrong shape to `PanelConfig` is not needed, since `npm run typecheck` on the module itself covers inference.

## Acceptance Criteria

1. `src/config.js` is gone; `src/core/config.ts` exports `panelConfig` (the struct), `PanelConfig`, `ResolvedConfig`, `checkConfig`, `resolveConfig`, `DEFAULT_ENTITIES`, `ENTITY_ALIAS`, `ROOM_ICONS`, `guessIcon`; `src/types.d.ts` holds only the smart-stack types.
2. Every pre-existing config test passes with no change to its expected values.
3. `checkConfig` of the `config:` block in `examples/configuration.yaml` returns `[]`; each kind in the table has a test with a literal expected problem.
4. The visual project passes with exactly two new baselines and no updated one; the behaviour suites pass including the new config-error spec.
5. Vitest covers `src/core/**` at 100 percent statements.
6. `superstruct` is pinned, in `LICENSES.md`, `npm run licenses` changes nothing after the PR; every `config.*` key is in both catalogs (the compiler checks).
7. `examples/configuration.yaml` documents `names:` with one example; the README's configuration section names the error card in one sentence.
8. `docs/adr/0015-parse-dont-validate-config.md` exists (accepted); `src/core/config.ts` opens with the header convention.
9. `npm run size` before and after is quoted in the PR.
10. A changeset (minor) says: "A typo in the panel's configuration now shows admins a card on the Home tab naming the setting and, when it can, the spelling meant. The rest of the panel keeps working with what it understood."

## Testing Decisions

The schema, the checker and the resolver are pure functions tested with literal inputs and literal expected outputs, as the config tests always were; the existing tests are the characterization of "a valid config changes nothing". The card is tested at the `hass` seam in Playwright, through what an admin and a non-admin see, and pinned by two approved baselines. Prior art: `config.test.mjs`, the states visual spec, the tabs spec's `cfg` option.

## Out of Scope

- Editing the configuration from the panel (the deferred phase-5 note).
- Coercing types (`"30"` to `30`): Home Assistant hands the YAML already typed; a string where a number is expected is a problem, not a conversion.
- Validating that an entity id exists in `hass.states` (an entity can be unavailable at startup; today's dash-or-hidden behaviour stays).
- Schema-driven editors (`ha-form`), JSON Schema export, or documentation generated from the struct (a later nicety the single source of truth makes possible).
- Moving `stack.js` to TypeScript.

## Notes

- King's essay argues that a parser returns a value whose type proves what was checked; `checkConfig` and `resolveConfig` split that into problems and a typed result because the panel must show every problem and still run, which a single throw cannot do. Fowler's tolerant reader is the other half: accept what you understand, ignore what you do not, say so.
- The "did you mean" hint is deliberately limited to distance 2 and to keys valid at that level, so `peoples` → `people` and `climat` → `climate`, but `foo` gets no false hint.
- Home Assistant's own error card throws from `setConfig`; the panel cannot, because one bad room must not blank the energy flow. Hence a card and a pruned config rather than an exception.
- Reading: King, _Parse, don't validate_ (2019) and _Names are not type safety_; Fowler, _Tolerant Reader_ (bliki); the superstruct README; Home Assistant frontend `src/panels/lovelace/cards/*` for `assert(config, cardConfigStruct)`.
