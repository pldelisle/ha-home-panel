// ApexCharts is frozen at 3.45.2 so the charts stay pixel-identical (renovate.json); it is MIT up to 5.0.0 and under its own
// licence from 5.1.0. Loaded only when a chart is drawn.
let chunk;
export const loadApex = () => (chunk ??= import('./apex-lib.js'));
