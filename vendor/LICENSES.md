# Vendored libraries

These files are copied unchanged from their projects' releases and keep their own licences.
They are loaded only when a tab needs them. Mermaid is not copied any more: it is installed from npm and built into `chunks/`.

| File | Project | Version | Licence |
|---|---|---|---|
| _(npm package `apexcharts`, a lazy chunk of the build)_ | [ApexCharts](https://github.com/apexcharts/apexcharts.js) | 3.45.2 | MIT |
| `leaflet.js`, `leaflet.css` | [Leaflet](https://github.com/Leaflet/Leaflet) | 1.9.4 | BSD-2-Clause |
| `chunks/` (from the `mermaid` npm package) | [Mermaid](https://github.com/mermaid-js/mermaid) | 11.4.1 | MIT |

The ApexCharts row's files now come from the npm package `apexcharts`, not from this directory. ApexCharts is MIT up to 5.0.0 and under its own licence from 5.1.0 (npm's licence field); it is frozen at 3.45.2, and the licence needs reading again before any move past 5.0.0.
