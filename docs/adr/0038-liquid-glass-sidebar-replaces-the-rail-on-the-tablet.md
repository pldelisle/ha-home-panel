# 0038: Under Liquid Glass the tablet's rail is a sidebar, collapsed by default and tinted by section

Status: accepted (2026-11-18)

## Context

The tablet's navigation was a 96 px rail: an icon over a label for each of ten sections, in one column, the open one lit in the panel's blue. Apple Home on the iPad has a sidebar instead (a glass panel, one row per section, groups, a button that collapses it), and the panel is fixed to a wall, where the content matters more than the navigation. Material has its own navigation rail (#466) and the phone its bottom bar; neither changes.

## Decision

- **Under Liquid Glass, on the tablet, the rail is a sidebar.** One `<nav class="rail" id="rail">` holds a toggle and the tablist; the tabs keep `role="tab"`, `data-tab` and their order of tab stops. A button is not a tab, so the tablist is its own element inside the nav (`display: contents` everywhere but the sidebar).
- **Two groups.** Home and Automations, then a _Categories_ heading and the rest in the old order. The order is `sidebarRows()` in `src/shell/features.ts`, applied only under Liquid Glass, so the keyboard walks the rows as the eye does, while Material's rail and the phone's bar draw the registry's order.
- **Collapsed by default, kept per device.** The toggle sets `home-panel-sidebar` (`collapsed` or `open`; anything else parses to `collapsed`), drawn as `.app.sbo` and the toggle's `aria-expanded`. Collapsed is a 72 px strip of icons: the labels stay in the tab's accessible name (clipped to nothing, not removed) and a hover title. The page's first column is `--sidebar-w-collapsed` or `--sidebar-w`, so the content takes the width the strip frees; it animates on the pane's curve, and under Reduce Motion it snaps and the labels fade in.
- **The open row takes its section's colour**, the descriptor's `color`, which is the colour of its icon on its Home card: the icon and a 16% pill. The label keeps `--fg`: in the light theme none of the nine colours has 4.5:1 as text on its own pill (2.4:1 to 3.5:1), and two of them miss it in the dark theme too. Climate's descriptor becomes `--c-heat`, the colour its card already had.
- **The gate is CSS**, `.app.tabsv:not(.cp):not([data-design='material'])` over 721 px, so no Material or phone rule changed.

## Consequences

- Every Liquid Glass tablet baseline shows the strip, so all of them were re-recorded; Material and phone baselines are unchanged.
- The open icon is a graphic that carries meaning (WCAG 1.4.11, 3:1). In the light theme the section colours are 2.4:1 to 3.5:1 on their pill (Lights and Energy are under 3:1), so there the icon is `color-mix(in srgb, var(--tab-c) 60%, var(--fg))`, 3.15:1 or more for all eight over grounds from the peach wash to white; the pill stays the pure colour. In the dark theme the icon is exactly the card's colour, which already passes.
- The width animation lays the grid out again for about 300 ms on each toggle. The toggle is rare, so the cost is accepted.
- The sidebar's CSS starts at 721 px while the phone's shape ends at 599 px; between them the old rail stays, and the shell reads the same breakpoint (`SIDEBAR_WIDE`) so that range gets the registry's order and no tooltips, as before.
- The sidebar is not in the Settings popup: its toggle is its own control.

## Read

Apple Human Interface Guidelines, Sidebars and Tab bars; ADR 0037 (the two designs); ADR 0004 (baselines).
