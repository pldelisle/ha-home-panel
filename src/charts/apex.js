// ApexCharts 3.45.2 is the last plain-MIT release; later majors are dual-licensed. Loaded only when a chart is drawn.
let p;
export const loadApex = () => (p ??= import('./apex-lib.js'));
