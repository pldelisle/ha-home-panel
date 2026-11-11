// <hp-media-tile>: one player on the phone's Media tab, the kit's wide summary tile with the television's switch or a speaker's play button.
// Pattern: humble object (Meszaros) over the model's `MediaTileView`; a tap on the tile asks the shell for its controls' sheet by a
// `SheetRequestEvent` (ADR 0021), and a tap on its control holds the value it asks for and runs the feature's command (ADR 0023).
// Its look is the kit's `.stile` rules, adopted (ADR 0019), as the guest's tiles and `<hp-stat-tile>` draw them.
// Must not: read an entity or the store's state (the pane hands it `tile`), word a string, or open the sheet from its control.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {K, TV_HOLD_MS, speakerPlayPause, tvPower} from './commands.ts';
import type {MediaControlView, MediaTileView} from './model.ts';
import {CONTROLS_SHEET} from './sheets.ts';
import tileOwn from './media-tile.element.css?inline';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {common, statTile} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import '../../ui/switch.ts'; // defines <hp-switch>
import type {SwitchChangeDetail} from '../../ui/switch.ts';

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
      <div
        class=${classMap({stile: true, wide: true, home: true, on: tile.on})}
        role="button"
        tabindex="0"
        aria-description=${tile.description}
        @click=${this.open}
        @keydown=${this.onKey}
      >
        <span class=${classMap({ic: true, art: tile.picture !== null})}>
          ${tile.picture ? html`<img src=${tile.picture} alt="" loading="lazy" />` : ico(tile.icon, 20)}
        </span>
        <span class="tx">
          <b>${tile.title}</b>
          <small translate=${ifDefined(tile.track ? 'no' : undefined)}>${tile.subLine}</small>
        </span>
        ${this.renderControl(tile.control)}
      </div>`;
  }

  private renderControl(control: MediaControlView) {
    return control.kind === 'switch'
      ? html`<hp-switch
          .checked=${control.checked}
          .disabled=${control.disabled}
          .label=${control.label}
          @click=${this.keep}
          @change=${this.onPower}
        ></hp-switch>`
      : html`<button
          type="button"
          class=${classMap({pp2: true, on: control.playing})}
          aria-label=${control.label}
          ?disabled=${control.disabled}
          @click=${this.onPlay}
        >
          ${ico(control.icon, 20)}
        </button>`;
  }

  // arrow fields, so the template hands the same functions at every render

  // the tile asks for its controls; the shell's sheet host opens them over the tab, which stays (ADR 0021)
  private readonly open = (): void => {
    if (this.tile) this.dispatchEvent(new SheetRequestEvent(CONTROLS_SHEET, {key: this.tile.key}));
  };

  // Enter and Space on the tile itself, as on a button; a key on its control is the control's
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    this.open();
  };

  // a tap on the control is the control's: it goes no further, so the tile does not open its sheet as well
  private readonly keep = (e: Event): void => {
    e.stopPropagation();
  };

  // The switch asks for a state and does not flip itself: the tile holds it, so the tile, the pane and the sheet read it at once.
  private readonly onPower = (e: CustomEvent<SwitchChangeDetail>): void => {
    e.stopPropagation();
    const control = this.tile?.control;
    if (control?.kind !== 'switch') return;
    this.optimistic.hold(K.on(control.tv.id), e.detail.checked, TV_HOLD_MS);
    void this.commands.run(tvPower(control.tv, e.detail.checked));
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
