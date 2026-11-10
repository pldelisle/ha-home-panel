// <hp-chart>: the kit's chart: one ApexCharts instance in its own shadow root, drawn from an `options` object that has no theme in it.
// Pattern: adapter (Gamma et al.) hiding the library behind properties (ADR 0006, 0022), a humble object (Meszaros) over the pure options in
// chart-options.ts; `updateOptions` when `options` changes, a new instance only when the theme or the language did (colours and locale are
// the library's to read once), `destroy` on disconnect (Lit docs, Lifecycle). The library is fetched on first connect (core/apex.ts).
// Must not: know what it draws, read an entity, write outside its own root, keep a chart for an element that left the page, or toast twice for one failed load.
import {LitElement, css, html, type PropertyValues} from 'lit';
import {loadApex, type ApexChart, type ApexChartConstructor} from '../core/apex.ts';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import {MediaQueryController} from './controllers/media-query.ts';
import {StoreController} from './controllers/store-controller.ts';
import {baseOptions, frenchAxis, mergeOptions, type ChartOptions} from './chart-options.ts';
import {ToastEvent} from './events.ts';
import {chart as chartStyles, common} from './styles/index.ts';

// The four charts of a detail fail together when the chunk does: one toast for the burst. The failed promise is the library's one, so
// every chart of a visit hears it in the same microtask checkpoint; the latch opens again after it.
let toastLatched = false;
function toastOnce(host: HTMLElement, message: string): void {
  if (toastLatched) return;
  toastLatched = true;
  queueMicrotask(() => (toastLatched = false));
  host.dispatchEvent(new ToastEvent(message, true));
}

export class HpChart extends LitElement {
  static override properties = {
    options: {attribute: false},
    height: {type: Number},
    label: {},
  };
  /** The chart's own options in the library's shape, without the theme: the base look is merged under them. */
  declare options: ChartOptions | undefined;
  /** The chart's height in pixels. */
  declare height: number;
  /** What assistive technology reads: a chart is an image, named after its card's title and the line under it. */
  declare label: string;

  static override styles = [
    common,
    chartStyles,
    css`
      :host {
        display: block;
      }
    `,
  ];

  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly motion = new MediaQueryController(this, '(prefers-reduced-motion: reduce)');
  private library: ApexChartConstructor | undefined;
  private chart: ApexChart | undefined;
  /** What the instance in `chart` was drawn for: a change of either needs a new one. */
  private drawnFor = '';

  constructor() {
    super();
    this.options = undefined;
    this.height = 300;
    this.label = '';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // a chart put back on the page (its instance went with its last disconnect) draws again at once, the library being there
    if (this.library) {
      this.requestUpdate();
      return;
    }
    loadApex().then(
      ({ApexCharts}) => {
        this.library = ApexCharts;
        // an element that left the page meanwhile draws nothing: it asks for its update again if it comes back
        if (this.isConnected) this.requestUpdate();
      },
      () => {
        if (this.isConnected) toastOnce(this, this.storeController.store.t('charts.failed'));
      },
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.dispose();
  }

  protected override render() {
    const {t} = this.storeController.store;
    return html`<div class="chart" role="img" aria-label=${this.label || t('chart.label')}></div>`;
  }

  protected override updated(changed: PropertyValues<this>): void {
    const {library, options} = this;
    if (!library || !options) return;
    const {store} = this.storeController;
    const theme = this.appearance.value?.theme ?? 'light';
    const key = `${theme}/${store.language}/${this.height}`;
    if (this.chart && key === this.drawnFor) {
      if (changed.has('options')) void this.chart.updateOptions(this.merged(options, key), false, !this.motion.matches);
      return;
    }
    this.dispose();
    const target = this.renderRoot.querySelector('.chart');
    if (!target) return;
    this.drawnFor = key;
    this.chart = new library(target, this.merged(options, key));
    // a chart with nothing to draw must not take the panel down with it
    this.chart.render().catch((error: unknown) => console.warn('home-panel chart', error));
  }

  // the base look from the host's computed tokens, the options over it, and French's axis when the panel is in French
  private merged(options: ChartOptions, key: string): ChartOptions {
    const {store} = this.storeController;
    const style = getComputedStyle(this);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const base = baseOptions(this.height, {
      tokens: {font: token('--f-body'), text: token('--fg2'), line: token('--line')},
      dark: key.startsWith('dark/'),
      reducedMotion: this.motion.matches,
      noData: store.t('chart.noData'),
    });
    const merged = mergeOptions(base, options);
    return store.isFrench ? frenchAxis(merged, store.fmt) : merged;
  }

  private dispose(): void {
    try {
      this.chart?.destroy();
    } catch {
      // a chart that never finished drawing has nothing to take down
    }
    this.chart = undefined;
    this.drawnFor = '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-chart': HpChart;
  }
}

if (!customElements.get('hp-chart')) customElements.define('hp-chart', HpChart);
