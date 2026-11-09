# 0007: The HACS integration is deferred

Status: accepted (2026-11-07)

## Context

The production-grade plan recommended shipping the panel inside a small custom integration installed from HACS, as the only option that removes the `?v=` edit and the YAML block. It was the plan's phase 5: an integration of about a hundred lines of Python, a config flow with no fields, HACS and hassfest validation, and a nightly job running a real Home Assistant (stable and beta) in Docker. At the 2026-11-07 review the owner chose not to schedule it. For one house, a script that bumps `?v=` and restarts Home Assistant is enough.

## Decision

Defer phase 5. It is not scheduled and is kept in the programme spec only for the record. The install stays the release zip plus the `panel_custom:` block. Revisit if another house adopts the panel or if the `?v=` edit becomes a real chore.

## Consequences

- No Python code, no second ecosystem of validation (HACS, hassfest) and no new release asset to maintain.
- Installing and updating remain manual: copy the folder, edit `?v=`, restart Home Assistant. Another adopter would have more to do than a HACS user.
- The nightly job against a real Home Assistant is deferred with it, so a change in Home Assistant's frontend is not caught before an update reaches the house. The tests cross only the fake `hass` (0005).
- The panel's configuration stays in the `panel_custom:` block; storing it in an integration and editing it from the gear menu is a later spec.

## Read

`docs/specs/production-grade-refactor.md`, "Phase 5 (deferred)" and "Out of Scope".
