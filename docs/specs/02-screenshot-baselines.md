# Spec 02: Screenshot baselines

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 0.
Depends on: [01 Playwright Test](01-playwright-test.md). Blocks: [03 lint and format](03-lint-and-format.md), every later spec.
Ships as: one pull request, a patch release, no visible change.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The migration promises that structural changes alter no pixel, but nothing enforces it. The end-to-end tests check that panes appear and that calls leave, not what the panel shows. A reflowed line, a moved CSS rule or a rewritten feature could shift a tile by four pixels or lose a colour, and no one would know until someone looked at the tablet.

## Solution

Record a reference screenshot of every tab and of the main open states, on both viewports, both themes and both languages, and compare against them on every pull request. Any difference fails the run and attaches the expected, actual and diff images. A difference is either fixed or deliberately approved by updating the baseline in the same pull request. These baselines are the contract for phases 0 to 3.

## User Stories

1. As a household member, I want a release that only restructures code to look exactly like the release before, so that I never see drift I did not ask for.
2. As a maintainer, I want a visual change to be visible in the pull request as a before-and-after image, so that I approve what the household will see.
3. As a maintainer, I want the baselines stable across my laptop and CI, so that a passing run means the same thing everywhere.
4. As an agent thread, I want a command that regenerates the baselines for the feature I changed on purpose, so that an approved change is a one-line step.
5. As a maintainer, I want French and dark-theme screens covered, so that a regression in the translation layer or the theme is caught too.
6. As a maintainer, I want the idle clock, the light sheet, the live-activity popup and the settings popup covered, so that the states a person sees most are protected, not only the tabs.

## Implementation Decisions

### Where screenshots run

- Screenshots are rendered by text, fonts and anti-aliasing that differ between operating systems and CPU architectures. Baselines MUST therefore be recorded and compared on one platform only: Linux arm64, inside the official Playwright image (`mcr.microsoft.com/playwright:v1.63.0-noble`, multi-arch) for the pinned Playwright version. CI runs on GitHub's arm64 runners (`ubuntu-24.04-arm`) with a job-level `container:` of that image, so every job, behaviour suite included, uses the same image and Chromium. A maintainer on an Apple Silicon Mac runs the same image natively, through Docker or Apple's `container` CLI; no emulation is involved. A baseline MUST NOT be recorded on the bare host or on an x86 machine.
- The update scripts pass `--update-snapshots=all`, because the default (`changed`) skips a difference inside a tolerance. `npm run test:visual` runs the visual project and is what the image executes (CI runs it in the container; on a laptop it never runs on the bare host). `npm run test:visual:docker` and `npm run test:visual:container` compare through Docker and Apple's `container`; `npm run test:visual:update` and `npm run test:visual:update:container` run it with `--update-snapshots` the same two ways and write the new baselines. Both runners produce byte-identical PNGs.
- The snapshot path template MUST NOT include the platform or browser name, so one set of files is the truth: `test/e2e/__screenshots__/{testFilePath}/{arg}{ext}`, where `{arg}` is the name the test gives.
- Until spec 08 bundles the font, Montserrat is blocked and the fallback is whatever the Docker image's `sans-serif` resolves to. That is stable within the image and is accepted as the baseline look for now; spec 08 updates every baseline once.

### The matrix

The visual project is a third Playwright project, `visual`, that reuses the `house` fixture and runs only the files under `test/e2e/visual/`. It MUST cover:

| Set                          | Viewports     | Theme       | Language | House                                | What is captured                                        |
| ---------------------------- | ------------- | ----------- | -------- | ------------------------------------ | ------------------------------------------------------- |
| Tabs                         | tablet, phone | light, dark | en, fr   | full                                 | every tab the viewport shows (10 on tablet, 4 on phone) |
| Bare                         | tablet, phone | light       | en       | bare                                 | every tab the bare house shows                          |
| Idle clock with a stack card | tablet, phone | light, dark | en       | full, time 2026-11-07T23:30:00-05:00 | the idle overlay after five minutes, first card         |
| Light sheet                  | tablet, phone | light, dark | en       | full                                 | the Office sheet open                                   |
| Live-activity popup          | tablet, phone | light, dark | en       | full                                 | the pill tapped, popup open                             |
| Settings popup               | tablet        | light, dark | en       | full                                 | the gear menu open                                      |
| Status checks                | tablet        | light       | en       | full, front door open 20 min         | the attention pill tapped                               |

That is 81 images: 66 tabs and 15 states (the idle clock, light sheet and live popup each 4, the settings popup 2, the Status checks 1). On a phone the idle clock is started with "Sleep now" in the settings, because phones never go idle on their own. Each MUST be a full-page viewport capture (`fullPage: false`) so the image size is the viewport.

### Determinism rules

- Every visual test MUST install the fake clock at `2026-11-07T14:00:00-05:00` unless the row above says otherwise, so greetings, sun position, "ago" texts, history curves and the day's calendar are fixed.
- Installing the fake clock is not enough: it lets time keep flowing from the fixed instant, so a chart axis or a history curve drawn from "now" moves by a sub-pixel between runs (seen on the Climate tab). Visual tests also freeze `Date` with the fixture's `frozen: true`; timers still run.
- The idle clock is the exception to `frozen`: it reads "now", so a frozen `Date` would show 11:30 pm after five minutes. Its tests MUST pause the clock a minute after load and `fastForward` it (on a phone, which never goes idle by itself, "Sleep now" follows, so both viewports show the same time and the first card), which fixes the time and the card the stack turns to, and MUST pin `Math.random` to its middle, because the panel nudges the clock block by a random offset on every tick (burn-in protection).
- `reducedMotion: 'reduce'` is inherited from the project; `toHaveScreenshot` MUST pass `animations: 'disabled'` and `caret: 'hide'`.
- Before capturing a tab, the test MUST wait for the pane to be visible and then for the page to settle; `toHaveScreenshot` already waits for two consecutive identical frames, which covers chart draw-in.
- The Automations tab draws with Mermaid; the test MUST wait for the flow SVG to exist before capturing.
- The Weather sheet's radar region shows the "Weather Radar Card didn't load" note in the test house. That is deterministic and acceptable.
- Comparison tolerance: exact, `threshold: 0` and `maxDiffPixels: 0`, set once in the config. With the clock frozen and one image on one architecture, re-renders are byte-identical (Docker and `container` agree), so a tolerance would only hide change: at `threshold: 0.2` a 2 px `.tile` radius change and a 1 px line-colour change both passed unnoticed. If the CI runner ever differs from the laptop, diagnose why rather than loosening this.

### Process rule

- A pull request whose run fails on a screenshot MUST either fix the code so the baseline passes or update the baseline with `test:visual:update` and state in its changelog entry which screens changed and why. The reviewer MUST look at the diff images in the PR.
- A structural PR (anything from this parent spec other than an approved visual change) MUST NOT update a baseline.
- CI MUST upload the Playwright HTML report and `test-results/` on failure so the expected, actual and diff images are one click away.

### Git

- Baseline PNGs are committed. They are not tiny: a viewport PNG is 115 to 440 KB (about 20 MB for the 66 tab baselines), so every full re-record adds that much to history. LFS is NOT used, so a clone stays simple. Bumping Playwright or Chromium re-records everything, so it SHOULD be its own Renovate pull request on a slow schedule (spec 05).
- A `.gitattributes` entry marks `*.png` under the screenshots directory as binary.

## Acceptance Criteria

1. `npm run test:visual` passes on `main` in CI and through the Docker script locally, with the matrix above present as named tests.
2. Running the visual project twice in a row in CI produces no diff (stability).
3. Moving one CSS rule (for example the tile radius by 2 px) on a branch makes the visual run fail with diff images uploaded.
4. The README's Develop section documents `test:visual` and `test:visual:update` in two sentences.
5. No file under `src/` changed.

## Testing Decisions

This spec is itself the regression net for the harness seam. Its verification is criteria 2 and 3: stable when nothing changed, loud when one thing changed.

## Out of Scope

- Screenshots against a real Home Assistant.
- Per-component or per-element screenshots.
- WebKit rendering.
- Accessibility (axe) checks, which start with the Lit shell in phase 3.

## Notes

- The order of phase 0 is deliberate: this spec lands before the lint reflow so that the reflow is verified against baselines recorded on untouched code.
- The baseline count grows with each state added later; keep each new state justified by a real regression risk.
