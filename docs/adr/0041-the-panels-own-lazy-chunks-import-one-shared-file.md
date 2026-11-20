# 0041: The panel's own lazy chunks import one shared file, never the entry

Status: accepted (2026-11-20)

## Context

Until the Ask sheet (spec 29, #538), every lazy chunk was a library with nothing of the panel's in it (ApexCharts, Mermaid), so each could stand alone and `dist/home-panel.js` held the whole panel. The Ask feature is the panel's own code in a chunk of its own (a household that never taps the button should not load it), and it imports modules the entry holds: the store's context keys, the kit's sheet and chart, the API client's error classes.

Home Assistant loads the entry as `home-panel.js?v=…`. A chunk that imported `../home-panel.js` would name another URL, load a second copy of every module and run them twice: a second `Symbol('home-panel.store')`, so no element of the chunk would find the store. The dist test says so ("no chunk imports the entry back"). Left to its defaults, Rolldown met that by splitting the shared code between the entry and a second chunk of Lit under `chunks/`, which the page then fetched on every load.

## Decision

- **The panel's own code and the libraries it runs on are one file beside the entry**, `dist/main-[hash].js` (every module under `src/` but the lazy entries, Lit, Superstruct, intl-messageformat and the Material colour utilities). `dist/home-panel.js` is one import of it. Both are named by `advancedChunks` and `chunkFileNames` in `vite.config.ts`.
- **A lazy chunk of the panel's own code imports that file, by the same relative URL the entry does**, so there is one copy of every module. It never imports the entry. Each such chunk's entry module is listed in `LAZY_SOURCES` in `vite.config.ts` (the Ask feature's `index.ts` and ApexCharts' door), and the shell imports from the feature only a file with no imports (`sheets.ts`), so the dependency rule stays inward.
- **The file sits beside the entry, not under `chunks/`**, so the fonts' folder (`import.meta.url`, `src/ui/fonts.ts`) and the harness's count of lazy requests (`/panel/chunks/`) stay as they were.

## Consequences

- A feature of the panel can be lazy by one `import()` in the shell and one line in `LAZY_SOURCES`; a house that never uses it fetches nothing of it.
- The page loads two files in sequence, the entry and then the panel file, where it loaded one: one more round trip on a cold load. The names carry a content hash, so a new release's entry (new `?v=`) points at a new file.
- A cached `home-panel.js` from an older release names a panel file the new release's folder no longer holds, so an update must bump `?v=` as the install steps already say; before, a stale entry kept working by itself.
- The dist test reads the panel file where it read the entry, and `size-limit` adds the two.
- A lazy entry missing from `LAZY_SOURCES` is pulled into the panel file and stops being a chunk; the dist test of the Ask chunk (and the `chunks.spec.ts` one) fails then.

## Read

[ADR 0006](0006-apexcharts-frozen-at-3x.md) for the lazy libraries; spec 06, "As built"; Rolldown, `advancedChunks`.
