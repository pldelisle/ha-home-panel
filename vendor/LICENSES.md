# Vendored and bundled libraries

The panel's third-party code and its licences, until spec 07's last step generates this list from the installed packages.

## Copied unchanged from vendor/

This file is copied unchanged from its project's release, keeps its own licence, and is not loaded by the panel.

| File | Project | Version | Licence |
|---|---|---|---|
| `leaflet.js`, `leaflet.css` | [Leaflet](https://github.com/Leaflet/Leaflet) | 1.9.4 | BSD-2-Clause |

## Installed from npm and built into chunks/

Vite builds these packages into the lazy chunks under `chunks/`, beside `home-panel.js`: minified, with the licence comments the libraries carry kept in the chunks. They are loaded only when a tab needs them.

| Package | Project | Version | Licence |
|---|---|---|---|
| `apexcharts` | [ApexCharts](https://github.com/apexcharts/apexcharts.js) | 3.45.2 | MIT |
| `mermaid` | [Mermaid](https://github.com/mermaid-js/mermaid) | 11.4.1 | MIT |

ApexCharts is MIT up to 5.0.0 and under its own licence from 5.1.0 (npm's licence field); it is frozen at 3.45.2, and the licence needs reading again before any move past 5.0.0.
