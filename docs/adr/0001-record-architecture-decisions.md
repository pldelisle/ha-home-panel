# 0001: Record architecture decisions

Status: accepted (2026-11-08)

## Context

The decisions already taken about the panel (TypeScript and Lit, rewrite in place, ApexCharts frozen at 3.x, screenshots as the contract, the browser floor, HACS deferred) lived in a 49 KB programme spec, a few "As built" sections and chat threads. A new contributor or agent thread had to dig for them and could not tell which were settled. The repository's agent docs (`docs/agents/domain.md`) already tell agents to read `docs/adr/`, a folder that did not exist. The owner also wants the code base to teach the practices it uses, and a decision record is one of them.

## Decision

Record each architecturally significant decision as a numbered file in `docs/adr/`, in Michael Nygard's template: Title, Status, Context, Decision, Consequences, plus one `Read` line naming the source. One decision per record. A record is not edited after acceptance (only its Status changes, to "superseded by NNNN"); a reversal is a new record. Every later spec lands its own ADR in the same pull request as the code. The decisions already taken are backfilled as 0002 to 0011, each with the date it was taken.

## Consequences

- A newcomer reads a two-minute file instead of re-deriving or re-arguing a decision, and the record states its costs next to its benefits.
- The decision and the code that applies it land together, so they cannot drift.
- Writing a record costs time on every decision that qualifies, and "when to write one" is a judgement call.
- An accepted record that turns out wrong stays in the folder, corrected by a later record rather than by an edit. A reader has to follow the "superseded by" chain.
- The template stays at five sections on purpose: an ADR that needs more than two minutes is a spec, and the specs remain the narrative.

## Read

Michael Nygard, _Documenting Architecture Decisions_ (2011); spec 09, "Architecture Decision Records"; `docs/agents/domain.md`.
