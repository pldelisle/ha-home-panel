# Automation traces

Fixtures in the shape `scripts/record-fixture.mjs --traces` writes (see `docs/architecture.md`, §5 Coding conventions, "Recorded fixtures"): one file per automation, `{recordedAt, source, automation, config, list, traces}`, where `config` is the `automation/config` reply's config, `list` the automation's `trace/list` rows (oldest first, as Home Assistant keeps them) and `traces` one `trace/get` reply per run, keyed by run id. The installation's ids are fakes: `item_…`, `run_…`, `context_…`, `user_…`, `device_…`. The graph's tests (#272) fold `config` with a run of `traces`.

All six are made up (written on 2026-11-16, `recordedAt` being the made-up instant they describe) in the reply shape of Home Assistant's _Automation trace_ (`trace/list`, `trace/get`, the path keys such as `action/0/choose/1/conditions/0`), with the test house's entity ids; `source` says so after the version. Replace them with recorded ones by running the recorder with `--traces` and the same automation shapes. One line per file: the case it covers.

- `lights_off_at_sunrise.json`: a plain run, one trigger and one service call.
- `heating_evening.json`: two runs, a finished one and, the next day, one stopped by its condition (`failed_conditions`).
- `entrance_light_until_closed.json`: a running run, waiting on a `wait_for_trigger` (`last_step` `action/1`, no finish).
- `heating_morning.json`: two triggers and a `choose` whose two options fail, so its `default` runs.
- `office_light_blink.json`: a `repeat` of three passes over a two-step sequence.
- `purifier_night_speed.json`: an error on the first service call (`script_execution` `error`).
