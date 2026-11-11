// <hp-scene-tiles>: the Home tab's scenes row, one tile per scene and per mode, which the guest places by its tag (ADR 0024).
// Pattern: humble object (Meszaros) over `sceneTiles`, run in `willUpdate` with the panel's held values (ADR 0023); a tap holds what
// it asks for and runs `runScene` or `setMode` through its `CommandRunner`; the row says `hp-empty` when it has nothing to show.
// A store controller on `mediaIds` (ADR 0012), and a redraw each minute while connected, so a "Last 5 min ago" line keeps time.
// Must not: read an entity itself (`sceneTiles` does), hold a string the household reads, or reach the guest past `hp-empty`.
import {LitElement, html, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {repeat} from 'lit/directives/repeat.js';
import {K, SCENE_RAN_MS, runScene, setMode, type Overlay} from './commands.ts';
import {mediaIds} from './ids.ts';
import {sceneTiles, type SceneTileView} from './scenes.ts';
import tilesOwn from './scene-tiles.element.css?inline';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {EmptyEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How often the row reads the clock again: its "Last … ago" lines count minutes. */
const REDRAW_MS = 60_000;

export class SceneTiles extends LitElement {
  // The element's own rules, its `:host` and what only its tree has, are in scene-tiles.element.css.
  static override styles = [common, unsafeCSS(forShadow(tilesOwn))];

  private readonly storeController = new StoreController(this, {ids: store => mediaIds(store)});
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  private tiles: SceneTileView[] = [];
  /** What the row last told its container; undefined until the first draw, which always tells it. */
  private empty: boolean | undefined;
  private redraw: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the tiles' rules test
    new AppearanceConsumer(this);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.redraw = setInterval(() => this.requestUpdate(), REDRAW_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.redraw);
  }

  protected override willUpdate(): void {
    const {hass, config, t, fmt, names} = this.storeController.store;
    if (!hass) return;
    const registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
    this.tiles = sceneTiles(hass.states, registries, config, this.overlay, {t, fmt, names, now: Date.now()});
  }

  protected override render() {
    return repeat(
      this.tiles,
      tile => tile.id,
      tile =>
        html`<button
          type="button"
          class=${classMap({scenetile: true, [tile.kind]: true, active: tile.active})}
          data-id=${tile.id}
          aria-pressed=${ifDefined(tile.kind === 'mode' ? (tile.active ? 'true' : 'false') : undefined)}
          ?disabled=${tile.disabled}
          @click=${this.onTap}
        >
          <span class="pic">${ico(tile.icon, 22)}</span><b>${tile.name}</b><small>${tile.subLine}</small>
        </button>`,
    );
  }

  // the container hides the row while it has nothing, as the legacy panel hid it; told once per change
  protected override updated(): void {
    const empty = this.tiles.length === 0;
    if (empty === this.empty) return;
    this.empty = empty;
    this.dispatchEvent(new EmptyEvent(empty));
  }

  // A scene holds "Done" for its four seconds, a mode the state it asks for, so the tile shows it at once; a failure releases that alone.
  private readonly onTap = (e: Event): void => {
    const tile = this.tiles.find(tile => tile.id === (e.currentTarget as HTMLElement).dataset.id);
    if (!tile) return;
    if (tile.kind === 'scene') {
      this.optimistic.hold(K.ran(tile.id), true, SCENE_RAN_MS);
      void this.commands.run(runScene(tile.id, tile.name));
      return;
    }
    const on = !tile.active;
    this.optimistic.hold(K.on(tile.id), on);
    void this.commands.run(setMode(tile.id, on, tile.name));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-scene-tiles': SceneTiles;
  }
}

if (!customElements.get('hp-scene-tiles')) customElements.define('hp-scene-tiles', SceneTiles);
