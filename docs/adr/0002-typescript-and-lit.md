# 0002: TypeScript and Lit, not Vue, Svelte, React or plain JavaScript

Status: accepted (2026-11-07)

## Context

The panel is one 3,310-line JavaScript class that draws HTML by string, sets `innerHTML` in about 52 places and escapes values by hand nearly 200 times. Redrawing a container throws away focus and slider state, and there are no types. The panel runs inside Home Assistant's frontend as a web component that receives a `hass` property, which Home Assistant replaces on every state change. The production-grade plan compared five options: TypeScript with Lit (about 6 KB), plain JavaScript with JSDoc types, Vue 3 (about 35 KB, whose reactivity has to wrap a `hass` object that is replaced on every change), Svelte 5, and React or Preact. Anything compiled from Rust, Elm or Dart only adds a bridge.

## Decision

TypeScript in strict mode and Lit 3.x. No Vue, Svelte, React or Preact. Types for `hass`, states, registries and the connection come from `home-assistant-js-websocket`; what it does not type is declared in the core's own declaration file. Plain JavaScript with JSDoc types was a good first step (phase 0) and is not the end state, because it still renders by string.

## Consequences

- Lit is what Home Assistant's frontend and most HACS cards use, so its elements, styles and examples apply, and `hass` as a property is Lit's native model.
- Templates escape by default, which removes the hand-escaping class of bugs; Lit keeps DOM nodes between renders, so focus and sliders survive updates; a card can skip an update when none of its entities changed.
- The type checker can fail the build on a wrong attribute or a mis-shaped WebSocket request.
- About 6 KB gzipped of runtime is added, and the code base carries a build and a type system it did not have.
- Contributors who know Vue, Svelte or React must learn Lit and its conventions, and those frameworks' component ecosystems are not available.
- The decision commits the project to phase 3: eleven features rewritten, one pull request each (see 0003).

## Read

`docs/production-grade-plan.md`, "Language and framework options"; `docs/specs/production-grade-refactor.md`, "Global decisions" (Language and framework).
