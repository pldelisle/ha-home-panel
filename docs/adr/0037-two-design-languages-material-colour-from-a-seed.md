# 0037: Two design languages, Apple and Material; Material's colour comes from a seed

Status: accepted (2026-11-18)

## Context

The panel has one look, Apple's: Liquid Glass (the Mercury drop), a wallpaper behind it, Manrope and iOS-sized shapes, specified in the HA Home Panel Design System. The owner wants a second look, Google's Material 3 Expressive, specified in a companion design system (HA Home Panel Material): a tonal palette from one seed colour, rounder shapes that morph, spring motion, and no glass. The panel's content, its words, its data and its chart colours do not change. The epic (#472) builds it in slices; this decision is the first one, the tracer: the setting, the colour and the screenshots.

The forces: Apple must stay pixel-identical (ADR 0004), so the new look cannot be a rewrite of the Apple rules; the kit's elements each have their own shadow root, so a design has to reach them without a second copy of every sheet; Material's colour is computed (HCT, Tonal Spot), not a list of hexes; and Google's web components, `@material/web`, would bring a second set of elements, their own tokens and a maintenance mode, beside the panel's `hp-*` kit.

## Decision

**There are two designs, `apple` (the default) and `material`, chosen in Settings under Design and kept per browser (`home-panel-design`); anything else parses to `apple`.** The shell's `AppearanceController` carries the design in the `Appearance` it provides, every element receives it as a `design` attribute (as it receives `data-theme`), and the frame has `data-design`. A rule for Material is `:host([design='material'])` in an element's sheet or `.app[data-design='material']` in the frame's; the Apple rules are not touched.

**Glass is the Apple design's.** Under Material the wallpaper rule answers none, whatever the Glass setting holds, so no glass class, wallpaper or lens is drawn; the popup does not show the swatches, the transparency slider or Transparent cards, and the stored glass values are kept for the way back. The Mercury drop belongs to the Apple design.

**Material's colour is built at runtime from a seed with `@material/material-color-utilities`** (HCT and the Tonal Spot scheme, the library's own maths, pinned exactly), not copied as a table of hexes: a seed, the theme and a contrast level go through one pure function (`src/shell/material-scheme.ts`) that returns custom properties. The panel's roles take Material's as the design system's Colour table says (`bg`, `card`, `well`, `control` and `on-control`, `fg`, `fg2`, `line`, `focus`; the panel's older `card2` and `ctl-bg` follow `well` and `control`), and every Material role is also exposed as `--md-<role>` for the slices that follow. The shell writes them as inline custom properties on `.app`, so they win over the stylesheet's, including its Increase Contrast and Reduce Transparency rules (written without `!important`); under Apple none is written, and switching back removes them. The chart series and the car and house illustrations keep their own colours in both designs. The seed is the House blue (`#4a7dba`) for now; the six wallpapers become seeds in a later slice.

**There is no `@material/web`.** The kit's `hp-*` elements stay the components and draw their Material anatomy under `:host([design='material'])`, so one set of elements, events and properties serves both designs.

## Consequences

- Apple stays pixel-identical: nothing is written under Apple but one attribute, and the one visible change is a Design row in the Settings popup, whose two baselines were re-recorded.
- A new design is an attribute away: a third language is a value, a scheme function and a set of `:host([design=...])` rules, not a fork.
- The library is 0.3.0, not 0.4.0: 0.4.0's ES modules import siblings without the `.js` extension, which Node's ESM loader (Vitest) cannot resolve; 0.3.0 loads in Node and in Vite and gives the design system's token values exactly. Renovate manages the pin; a bump is a decision to check with the scheme's unit test, which holds tokens.json's values.
- The package adds weight to the entry chunk (the scheme classes and the HCT maths). `npm run size` prints it; there is no budget (ADR 0010).
- The Material look is half-built until its slices land: the shell, the controls and the motion keep Apple's shapes for now, and a Material screenshot shows only the new colour.
- The contrast level is passed as 0; the `prefers-contrast` schemes come with the seeds slice.
- Two looks double the baselines of whatever a later slice restyles.

## Read

HA Home Panel Material design system, `README.md` ("Colour") and `tokens.json`; Material 3 on dynamic colour and the Tonal Spot scheme; `@material/material-color-utilities`; ADR 0004 (baselines), ADR 0018 (context), ADR 0019 (elements' own shadow roots).
