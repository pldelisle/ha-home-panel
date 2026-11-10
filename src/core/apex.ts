// loadApex: the one lazy door to ApexCharts, a promise per page; `<hp-chart>` and the legacy class's charts share it.
// Pattern: lazy loading with a module-level memo (spec 10 allows this one piece of module state): the library is a chunk of its own,
// fetched when the first chart is drawn. ApexCharts is frozen at 3.45.2 so the charts stay pixel-identical (ADR 0006, renovate.json); it is
// MIT up to 5.0.0 and under its own licence from 5.1.0.
// Must not: import the library statically (it would sit in the entry), name it anywhere else, or keep a failed load apart from the promise.

/** The part of an ApexCharts chart the panel calls. */
export interface ApexChart {
  render(): Promise<void>;
  updateOptions(options: object, redraw?: boolean, animate?: boolean): Promise<void>;
  destroy(): void;
  /** Tagged by the legacy class on the charts it draws; deleted with it. */
  __clim?: boolean;
}

export type ApexChartConstructor = new (element: Element, options: object) => ApexChart;

let chunk: Promise<{ApexCharts: ApexChartConstructor}> | undefined;

export const loadApex = (): Promise<{ApexCharts: ApexChartConstructor}> =>
  (chunk ??= import('./apex-lib.ts') as Promise<{ApexCharts: ApexChartConstructor}>);
