# 0006: ApexCharts frozen at the 3.x major for licence reasons

Status: accepted (2026-11-07)

## Context

ApexCharts draws the charts on about 30 of the 81 baselines (Energy, Climate, Car, Air, Weather and the idle stack cards). The earlier plan was to replace it with ECharts. After review on 2026-11-07 the owner dropped that replacement. The programme spec recorded that ApexCharts' later majors are dual-licensed (a free Community tier and a paid Commercial tier for organisations above a revenue threshold) and said the exact major where this started was not confirmed. Spec 07 settled it from npm's `license` field: every release up to and including 5.0.0 is MIT, and from 5.1.0 (July 2025) it is ApexCharts' own licence. The last 3.x release is 3.54.1 (2024-10-14). The only advisory ever filed against `apexcharts` (an XSS) was fixed in 3.24.0 and does not affect 3.45.2. A review of the freeze on 2026-11-08 (issue #84) found it still the best choice, since 3.54.1 and 5.0.0 are both dead ends for MIT releases.

## Decision

ApexCharts stays at its 3.x major, installed at exactly `3.45.2`. Renovate skips its majors and holds it at that version, because even a minor or patch would redraw charts that the baselines pin pixel for pixel. The chart wrapper in the phase-3 UI kit hides the library from features, so a swap stays possible, but none is planned. The question is reopened at the phase-3 Energy move or earlier if an advisory appears, and any upgrade needs a licence review, a changeset and a visual check.

## Consequences

- The repository's MIT licence stays simple, and nothing is bought or negotiated.
- There is no ECharts: it was rejected on 2026-11-07 and stays rejected unless the question is reopened.
- ApexCharts fixes and features after 3.45.2 are not received. For now that costs nothing known: there is no advisory against 3.45.2.
- Unfreezing means re-recording about 30 baselines (0004), possibly twice, plus a licence decision for versions after 5.0.0 or a move to 5.0.0, the last MIT release, with its breaking changes.
- The freeze is held in two places that must be kept in agreement: Renovate's rules and the version asserted by `dist.test.mjs`.

## Read

`docs/specs/production-grade-refactor.md`, "Global decisions" (Charts) and "Further Notes" (ApexCharts licence); `docs/specs/07-npm-packages-replace-vendor.md`, As built (#36); issue #84.
