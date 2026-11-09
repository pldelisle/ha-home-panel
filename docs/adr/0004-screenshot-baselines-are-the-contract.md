# 0004: Screenshot baselines are the characterization tests and the contract of the rewrite

Status: accepted (2026-11-07)

## Context

The migration promises that structural changes alter no pixel, but the end-to-end tests only checked that panes appear and that calls leave, not what the panel shows. A reflowed line, a moved CSS rule or a rewritten feature could shift a tile by four pixels and nobody would know until someone looked at the tablet. The logic inside the old class had no tests either, so nothing pinned today's behaviour before it moved (Feathers's characterization tests).

## Decision

Record a reference screenshot of every tab and of the main open states, and compare against them on every pull request. The matrix is viewport (tablet, phone) by theme (light, dark) by language (English, French) by house (full, bare), plus the idle clock, the light sheet, the live-activity popup, the settings popup and Status checks: 81 images. They are recorded and compared on one platform only, Linux arm64 inside the pinned Playwright image, with a fixed clock, reduced motion and no network fonts. The comparison is exact (`threshold: 0`, `maxDiffPixels: 0`). A structural pull request must not update a baseline; a deliberate visual change updates the baseline in the same pull request and states which screens changed and why. The baselines are the contract for phases 0 to 3.

## Consequences

- Any visual drift fails the run with expected, actual and diff images attached, so a restructure is checkable by machine.
- Stability, not tolerance, is the discipline: a flake is fixed in what the panel shows between tasks, never with a wait, a retry or a looser threshold.
- Baseline PNGs are committed without LFS. A viewport image is 115 to 440 KB (about 20 MB for the tab images), so every full re-record adds that much to the history.
- Baselines depend on one platform and one Chromium build. Bumping Playwright or Chromium re-records everything, and a baseline must not be recorded on a bare host or an x86 machine.
- Anything that changes how pixels are drawn (a font, a charting library version, a stylesheet minifier) can re-record baselines; see 0006.
- Baselines pin the look, not the behaviour; behaviour is tested through the seams of 0005.

## Read

`docs/specs/02-screenshot-baselines.md`.
