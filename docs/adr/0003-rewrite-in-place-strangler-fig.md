# 0003: Rewrite in place as a strangler fig, one release per step, pixel-identical structural phases

Status: accepted (2026-11-07)

## Context

The panel is used every day on a wall tablet and on phones, and the house must never lose its dashboard. Almost everything lives in one class, so two threads of work conflict in merges and renumber each other's releases. The production-grade plan weighed a big-bang version 3 against a rewrite in place and recommended the latter, roughly 20 to 25 pull requests over six phases, so that the live panel never goes dark and a stalled migration never leaves two half-finished renderers.

## Decision

Rewrite in place, not as a parallel version 3. `main` stays releasable at every merge and there is no long-lived migration branch. Each phase lands as normal releases and is complete when its gate passes on `main`. A structural phase changes no behaviour and no pixel: phases 0, 1, 2 and each phase-3 move are pixel-identical refactors, and a deliberate visual change is its own pull request with an approved baseline, never bundled with a move. Until a feature has moved in phase 3, its fixes and new work go into the old class and the move pull request rebases on top; after it has moved, work goes into its folder. The move order is fixed and announced, and one feature moves per pull request. Fowler's Strangler Fig and Parallel Change (expand, migrate, contract) name the shape.

## Consequences

- The household keeps a working panel through every release, and a bad step is one small pull request to revert.
- A pull request touches one feature's folder, so threads rarely conflict.
- Two styles of code coexist until the old class is deleted at the end of phase 3: the old class and the new layers. The old renderer only shrinks, and its remaining size is a number in CI output (spec 09).
- New fixes land in code that is about to be moved, and the move pull request must rebase over them.
- No visual improvement can ride along with a restructure, so redesign work waits for its own pull request.
- The migration is slow by design: each step needs a release, a changeset and a green baseline run.

## Read

`docs/specs/production-grade-refactor.md`, "Solution" and "Global decisions" (rewrite in place, gates, no behaviour change inside a structural phase, parallel work rule).
