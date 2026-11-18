// <hp-media-tile>: one player on the phone's Media tab, the kit's wide summary tile with the television's power button (<hp-tv-power>, the box's own) or a speaker's play button.
// Pattern: humble object (Meszaros) over the model's `MediaTileView`; a tap on the tile's row asks the shell for its controls' sheet by a
// `SheetRequestEvent` (ADR 0021), and a tap on its control, a sibling of the row and never inside it, holds the value it asks for and runs the feature's command (ADR 0023).
// A speaker's tile composes <hp-volume-control> under the row, a sibling of the row's button too: a slider inside a button is nested-interactive.
// Its look is the kit's `.stile` rules, adopted (ADR 0019), as `<hp-stat-tile>` draws them.
// Must not: read an entity or the store's state (the pane hands it `tile`), word a string, or open the sheet from its control.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {K, speakerPlayPause} from './commands.ts';
import type {MediaControlView, MediaTileView} from './model.ts';
import {CONTROLS_SHEET} from './sheets.ts';
import tileOwn from './media-tile.element.css?inline';
import './tv-power.ts'; // defines <hp-tv-power>
import './volume-control.ts'; // defines <hp-volume-control>
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {common, statTile} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class MediaTile extends LitElement {
  static override properties = {
    tile: {attribute: false},
  };
  /** The player as the pane's model says it, held values included. */
  declare tile: MediaTileView | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in media-tile.element.css.
  static override styles = [common, statTile, unsafeCSS(forShadow(tileOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the tile
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes the kit's tile rules test
    new AppearanceConsumer(this);
  }

  // lit-analyzer does not know `aria-description` (a screen reader reads it after the role and the name); the ignore covers this one tag
  protected override render() {
    const tile = this.tile;
    if (!tile) return nothing;
    return html`<!-- @ts-ignore -->
      <div class=${classMap({stile: true, wide: true, home: true, on: tile.on})}>
        <button type="button" class="mrow" aria-description=${tile.description} @click=${this.open}>
          <span class=${classMap({ic: true, art: tile.picture !== null})}>
            ${tile.picture ? html`<img src=${tile.picture} alt="" loading="lazy" />` : ico(tile.icon, 20)}
          </span>
          <span class="tx">
            <b>${tile.title}</b>
            <small translate=${ifDefined(tile.track ? 'no' : undefined)}>${tile.subLine}</small>
          </span>
        </button>
        ${this.renderControl(tile.control)}
      </div>`;
  }

  private renderControl(control: MediaControlView) {
    return control.kind === 'power'
      ? html`<hp-tv-power
          .tv=${{...control.tv, on: control.on, available: !control.disabled, powerLabel: control.label}}
        ></hp-tv-power>`
      : html`<button
            type="button"
            class=${classMap({pp2: true, on: control.playing})}
            aria-label=${control.label}
            ?disabled=${control.disabled}
            @click=${this.onPlay}
          >
            ${ico(control.icon, 20)}
          </button>
          <hp-volume-control .speaker=${control.speaker} .volume=${control.volume}></hp-volume-control>`;
  }

  // arrow fields, so the template hands the same functions at every render

  // the tile asks for its controls; the shell's sheet host opens them over the tab, which stays (ADR 0021)
  private readonly open = (): void => {
    if (this.tile) this.dispatchEvent(new SheetRequestEvent(CONTROLS_SHEET, {key: this.tile.key}));
  };

  private readonly onPlay = (e: Event): void => {
    e.stopPropagation();
    const control = this.tile?.control;
    if (control?.kind !== 'play') return;
    const play = !control.playing;
    this.optimistic.hold(K.state(control.speaker.id), play ? 'playing' : 'paused');
    void this.commands.run(speakerPlayPause(control.speaker, play));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-media-tile': MediaTile;
  }
}

if (!customElements.get('hp-media-tile')) customElements.define('hp-media-tile', MediaTile);
