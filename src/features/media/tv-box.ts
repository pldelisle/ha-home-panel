// <hp-tv-box>: the television's box in the Media pane: its name, status and app beside the power button, and four buttons.
// Pattern: humble object (Meszaros) over the model's `TvView`, and command (Gamma et al.): a tap holds the value it asks for in the
// panel's overlay store, then runs the feature's command through `CommandRunner`, whose failure releases that hold alone (ADR 0023).
// The power is <hp-tv-power>, a toggle button that the phone's tile draws too.
// Its play button shows what a press will do when the set says playing or paused, and the neutral play-or-pause glyph when it says only on.
// Must not: read an entity or the store's state (the pane hands it `tv`), word a string, or show a state it has not held.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {K, TV_HOLD_MS, tvMute, tvPlayPause, tvVolume} from './commands.ts';
import type {TvView} from './model.ts';
import boxOwn from './tv-box.element.css?inline';
import './tv-power.ts'; // defines <hp-tv-power>
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class TvBox extends LitElement {
  static override properties = {
    tv: {attribute: false},
  };
  /** The television as the pane's model says it, held values included. */
  declare tv: TvView | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in tv-box.element.css.
  static override styles = [common, unsafeCSS(forShadow(boxOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the box
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the box's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const tv = this.tv;
    if (!tv) return nothing;
    const {volumeDown, volumeUp, mute, playPause} = tv.controls;
    return html`<div class="tvhead">
        <div class="tx">
          <h3>${tv.name}</h3>
          <p>${tv.status}</p>
          ${tv.nowOn ? html`<p class="now">${tv.nowOn}</p>` : nothing}
        </div>
        <hp-tv-power .tv=${tv}></hp-tv-power>
      </div>
      <div class="tvkeys" role="group" aria-label=${tv.controlsLabel}>
        <button type="button" aria-label=${volumeDown.label} ?disabled=${!tv.on} @click=${this.onVolumeDown}>
          ${volumeDown.text}
        </button>
        <button type="button" aria-label=${volumeUp.label} ?disabled=${!tv.on} @click=${this.onVolumeUp}>
          ${volumeUp.text}
        </button>
        <button
          type="button"
          aria-pressed=${tv.muted ? 'true' : 'false'}
          aria-label=${mute.label}
          ?disabled=${!tv.on}
          @click=${this.onMute}
        >
          ${mute.text}
        </button>
        <button type="button" aria-label=${playPause.label} ?disabled=${!tv.on} @click=${this.onPlayPause}>
          ${ico(playPause.icon, 24)}
        </button>
      </div>`;
  }

  private readonly onMute = (): void => {
    if (!this.tv) return;
    const muted = !this.tv.muted;
    this.optimistic.hold(K.mute(this.tv.id), muted, TV_HOLD_MS);
    void this.commands.run(tvMute(this.tv, muted));
  };

  private readonly onVolumeDown = (): void => {
    if (this.tv) void this.commands.run(tvVolume(this.tv, 'down'));
  };

  private readonly onVolumeUp = (): void => {
    if (this.tv) void this.commands.run(tvVolume(this.tv, 'up'));
  };

  private readonly onPlayPause = (): void => {
    if (this.tv) void this.commands.run(tvPlayPause(this.tv));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-tv-box': TvBox;
  }
}

if (!customElements.get('hp-tv-box')) customElements.define('hp-tv-box', TvBox);
