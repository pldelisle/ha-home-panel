# 0025: A reading two features need lives in a provider, and the legacy panel may import the providers

Status: accepted (2026-11-14)

## Context

Until now a provider served one feature: the weather sources the Weather pane, the TV sources the Media pane. Security is the first reading others need. "Which binary sensors are the house's doors and motion sensors" is asked by the Security pane, the live pill's Status checks (spec 22), the smart stack and the Home pane (spec 24) and, until those move, the legacy panel.

ADR 0011 forbids a feature importing another feature, and ADR 0017 composes what mixes features at the shell. A rule exported by the Security feature is unreachable from the live feature, and a copy in each would drift. The core is not the place either: it knows no domain, and a door class is one.

The legacy panel is the second difficulty. ADR 0011 lets it import the core only, so it would keep its own `sensors()` beside the new rule until its last reader moved: two implementations for the length of a phase.

## Decision

**A reading two or more features need lives in a provider, and the provider's output is the contract.** The output is inputs, not a view: no string a person reads, no clock. A provider need not name an integration: `src/providers/door-motion.ts` is named after the device classes it reads.

**The legacy panel MAY import `src/providers/`**, as it may the core, so a shared read never has two implementations: its Status checks, stack and More sheet call `doorMotionSensors(...)` and its own copy is deleted. `.dependency-cruiser.cjs` gains that one allowance, and `test/unit/architecture.test.mjs` pins it: the legacy set imports only the core, the providers and itself (its sheet also the kit's stylesheets, ADR 0019). A provider still imports the core and its sibling providers only, so the allowance reaches no feature, kit or shell.

The camera sources are a list of one (`CAMERA_SOURCES`), a hypothetical seam by ADR 0005's reasoning: a generic `camera.*` adapter is a later visible change, and the list makes it a one-file addition.

## Consequences

- One rule for "which sensors count", pinned by tests before the code that draws them moves; the pill, the stack and the Home pane read it without importing Security.
- The next shared read (Air's ratings, Energy's live power) has a home.
- The legacy panel now depends on a layer that is not the core. The legacy set only shrinks, so the cost ends with it, and the architecture test keeps the allowance from widening to a feature.
- A provider with no integration in its name blurs the line between an adapter and a rule; its header says which it is.
- The contract is larger, since it carries what every reader wants, and a field added for one reader is read by all of them.

## Read

`docs/specs/17-security.md`, "The shared provider"; ADR 0011; ADR 0017; Martin, _Clean Architecture_ (the Dependency Rule).
