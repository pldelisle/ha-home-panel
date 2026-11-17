# 0034: The flows are drawn by Mermaid 12, with the classic look and the dagre layout

Status: accepted (2026-11-17)

## Context

The Automations tab draws each automation's flow with Mermaid. 11.17.2 is the last 11.x: a security fix that lands only in 12.x would force the move at a bad moment. #82 measured 12.3.0 against the baselines: with the panel's `initialize()` unchanged every node is restyled by the `neo` look (gradient outlines, wider stadium shapes), about 90,650 pixels on each of the four `auto-tablet-*` baselines; with `layout: 'dagre'` and `look: 'classic'`, still about 79,050. The browser floor (Safari and iOS 26, current Chrome, Edge and Firefox) removed the ES2024 objection. A change that size is a redesign, and the programme's rule is that a deliberate visual change is its own pull request with an approved baseline update, so #82 waited for the Automations move, where the flow's styling is written once (`mountFlow`, `toMermaid`) instead of twice.

## Decision

**`mermaid` is 12.x, pinned exact, and `mountFlow` initializes it with `layout: 'dagre'` and `look: 'classic'`**, the least change from 11; the `flowchart.wrappingWidth` of 400 keeps a step's line on one line, as 11 drew it (12 wraps at 200). The `classDef`s, the link styles and the arrowheads `mountFlow` adds are unchanged: the path taken stays green, the step waited on amber, a failed check red, the rest dashed. The Automations baselines are re-recorded in the same pull request as an approved visual change. The `katex` override of #75 goes (12.x asks for a KaTeX without the advisory), and so do the two Renovate rules that held Mermaid 12 and KaTeX back; Mermaid keeps its own group.

## Consequences

- The flows' boxes are a little larger, with slightly thicker outlines and wider rounded ends; their colours and reading order are the same.
- The build still emits ELK's layout chunk (about 1.5 MB, 466 kB gzipped) into `dist/chunks/`; dagre never asks for it, and `chunks.spec.ts` fails if a flow does.
- A later Mermaid release that moves pixels comes in its own pull request with re-recorded baselines, as Renovate's Mermaid group says.

## When to revisit

The `neo` look, the ELK layout or any other restyle of the flow is a redesign: its own pull request, with the owner's approval of the images.

## Read

#82 (the measurements); #75 (the `katex` override); `docs/specs/25-automations.md`, "Mermaid 12".
