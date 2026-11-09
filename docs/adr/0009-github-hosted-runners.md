# 0009: GitHub-hosted runners

Status: accepted (2026-11-07)

## Context

The pull-request pipeline runs lint and type checks, unit tests, the build, then end-to-end tests, screenshots and accessibility checks. The production-grade plan states that CI stays on GitHub-hosted runners, "as decided on 7 Nov", and the programme spec lists self-hosted runners as out of scope. The repository does not record the alternatives that were weighed or the reasons beyond that.

## Decision

Continuous integration runs on GitHub-hosted runners. There are no self-hosted runners. The screenshot baselines are recorded and compared on GitHub's Linux arm64 runners (`ubuntu-24.04-arm`) inside the pinned Playwright container, so the runner and the maintainers' Docker or `container` runs use the same image.

## Consequences

- There is no runner to provision, patch or keep online, and the workflows run the same way for any contributor.
- The pipeline depends on the runner images and on GitHub's availability and usage limits, none of which the project controls.
- The baselines (0004) are tied to the arm64 image. Moving to x86 runners would mean re-recording every image.
- New checks join the existing jobs on the hosted runners (the architecture checks of spec 09 run in the lint job), with no new runner to add.

## Read

`docs/production-grade-plan.md`, "Tooling, tests and CI"; `docs/specs/production-grade-refactor.md`, "Out of Scope".
