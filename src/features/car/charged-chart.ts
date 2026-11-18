// ChargedChart: the options of a chart the Car's history sheet draws, made once for what they are made of and made again only when that changed.
// Pattern: Lit reactive controller (Lit docs, Reactive Controllers) over the store and the appearance, with the memo of an options builder (a cache keyed by its inputs); both of the sheet's charts, the 30 days'
// (`<hp-car-history-sheet>`) and the months' (`<hp-car-sessions>`), ask it, so an update for anything else does not ask `<hp-chart>` to draw again.
// Must not: build an option itself (the caller's `build` does, from `history.ts`), word a string, or read anything but the store's formats and catalog, the appearance and the host's `--c-ev`.
import type {ReactiveControllerHost} from 'lit';
import type {ChartOptions} from '../../ui/chart-options.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import type {DailyChartDeps} from './history.ts';

/** The chart's height in pixels, the one both charts of the sheet are drawn at (`<hp-chart>`'s `height`, which the options do not repeat). */
export const CHARGED_CHART_HEIGHT = 220;

export class ChargedChart {
  private readonly storeController: StoreController;
  private readonly appearance: AppearanceConsumer;
  private key = '';
  private cached: ChartOptions | undefined;

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    this.storeController = new StoreController(host, {ids: () => []});
    this.appearance = new AppearanceConsumer(host);
  }

  /** The options `build` makes for `shape` (what the data is, as a string), kept until the shape, the theme, the language or the screen changes. */
  options(shape: string, build: (deps: DailyChartDeps) => ChartOptions): ChartOptions {
    const {store} = this.storeController;
    const compact = this.appearance.value?.compact === true;
    const key = `${this.appearance.value?.theme ?? 'light'}/${store.language}/${compact}/${shape}`;
    if (this.cached === undefined || key !== this.key) {
      this.key = key;
      const color = getComputedStyle(this.host).getPropertyValue('--c-ev').trim();
      this.cached = build({fmt: store.fmt, t: store.t, color, compact});
    }
    return this.cached;
  }
}
