# 0010: No size budget, size for information

Status: accepted (2026-11-08)

## Context

The programme spec asked for a size budget on the main chunk: `size-limit` would fail a pull request that grew the gzipped entry past the first minified build plus ten percent, and the budget could be lowered, never raised, without a changeset. It was set at 160 kB and lowered to 153 kB in #69 after the stylesheet was minified (the build measured 138.35 kB in CI). The owner has many features coming, and an artificial limit only adds friction.

## Decision

Remove the `limit` on the entry in `package.json`. `npm run size` and the CI step stay and print the entry and the lazy chunks for information, so a jump is still visible in the log. The "Size budget" paragraphs in spec 06 are the history, and the programme spec's budget-based gates and user story no longer apply.

## Consequences

- A pull request is never blocked by the size of the bundle, so adding a feature does not start with a negotiation about a number.
- A size regression no longer fails anything. Noticing it is a reviewer's job, from the figures in the CI log.
- The main chunk can creep, and the programme's goal of a lighter panel is no longer enforced by a machine.
- The tooling stays in place, so a budget can be restored by adding the limit back.

## Read

`docs/specs/06-vite-build.md`, "Amended: no size budget" in "As built (#103)", and "As built (#69)" for the numbers.
