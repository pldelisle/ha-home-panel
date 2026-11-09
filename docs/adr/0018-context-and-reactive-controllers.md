# 0018: Context and reactive controllers, not properties down the tree and not signals

Status: accepted (2026-11-09)

## Context

Home Assistant's dashboard hands `hass` to every card as a property on every state change, and each card decides whether to redraw. The panel's store (ADR 0012) already decides that per entity id, so a feature element three levels down needs the store, the API client and the settings without receiving `hass` from its parent and without importing a module that holds them (a singleton, which ADR 0012 rules out). The shell is the composition root and builds the services; the question is how they reach the elements below it. Three mechanisms were on the table: properties passed down the tree (each level must know about, and forward, what the levels below need), `@lit-labs/signals` (a labs package at 0.3 when this was written, wrapping a store that is already an observer in a second mechanism for the same thing), and the context protocol with reactive controllers, both of which are Lit's own supported way of doing this. A shared behaviour such as "re-render when my ids change" could in turn be a mixin or a controller.

## Decision

The shell provides the store, the API client and the settings through `@lit/context`, Lit's implementation of the W3C Community Group's Context Protocol: one typed context per service, declared once in `src/shell/contexts.ts` with a `Symbol` key, and one `ContextProvider` each on the shell. A consumer resolves a service by a DOM event when it connects, so a test or a harness provides a fake by providing a context value. Shared lifecycle behaviour is written as Lit reactive controllers, objects an element owns, and not as mixins: an element can hold as many controllers as it needs without a class hierarchy, and a controller is where the store's subscription mechanics are touched. The controllers (`StoreController`, `MediaQueryController`) arrive with their first user, in step C; this step provides the contexts. Signals are not used.

## Consequences

- No level of the tree forwards a service, and a card redraws only when an entity id it subscribed to changes, because the store tells it, not because a parent passed a new `hass`.
- A consumer learns its store when it connects and never again (a store does not change for a given tree), so a store is per element tree, which is what ADR 0012 wants.
- The guest gets the same three services through its `GuestContext` argument and does not use context itself: it is not an element and is deleted with the guest.
- Context is resolved by an event that bubbles through shadow boundaries, so a feature element in its own shadow root (a later step) reaches the store with no wiring.
- A consumer resolves its service when it connects. The shell's providers are created in its constructor and listen from the shell's own connection, and every consumer sits below the shell in its shadow root, so a provider is always there before a consumer asks.
- Signals beside the store would be a second mechanism for the same job, so they stay out. The condition to revisit: the package leaves labs.
- The cost is a runtime dependency, `@lit/context`, in `LICENSES.md`; with Lit itself the main chunk grew from 155.76 to 161.74 KB gzipped (information, by ADR 0010).

## Read

`docs/specs/14-lit-shell.md`, "How the store reaches an element: context and reactive controllers"; Lit docs, _Context_ and _Reactive Controllers_; the W3C Community Group's _Context Protocol_.
