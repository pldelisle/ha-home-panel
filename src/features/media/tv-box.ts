// <hp-tv-box>: the television's box in the Media pane: its name and status beside the power switch, the screen, and four buttons.
// Pattern: humble object (Meszaros) over the model's `TvView`, and command (Gamma et al.): a tap holds the value it asks for in the
// panel's overlay store, then runs the feature's command through `CommandRunner`, whose failure releases that hold alone (ADR 0023).
// The Home card's smaller variant (`card`, the legacy `.tvbox`) arrives with #219, the box's second user.
// Must not: read an entity or the store's state (the pane hands it `tv`), word a string, or show a state it has not held.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {K, TV_HOLD_MS, tvMute, tvPlayPause, tvPower, tvVolume} from './commands.ts';
import type {TvView} from './model.ts';
import boxOwn from './tv-box.element.css?inline';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import '../../ui/switch.ts'; // defines <hp-switch>
import type {SwitchChangeDetail} from '../../ui/switch.ts';

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
          <p>${tv.statusLine}</p>
        </div>
        <hp-switch
          .checked=${tv.on}
          .disabled=${!tv.available}
          .label=${tv.switchLabel}
          @change=${this.onPower}
        ></hp-switch>
      </div>
      <div class=${classMap({tvscreen: true, on: tv.on})}>${tv.screenLabel ?? ico('tv', 40)}</div>
      <div class="tvkeys" role="group" aria-label=${tv.controlsLabel}>
        <button type="button" aria-label=${volumeDown.pane.label} ?disabled=${!tv.on} @click=${this.onVolumeDown}>
          ${volumeDown.pane.text}
        </button>
        <button type="button" aria-label=${volumeUp.pane.label} ?disabled=${!tv.on} @click=${this.onVolumeUp}>
          ${volumeUp.pane.text}
        </button>
        <button
          type="button"
          aria-pressed=${tv.muted ? 'true' : 'false'}
          aria-label=${mute.pane.label}
          ?disabled=${!tv.on}
          @click=${this.onMute}
        >
          ${mute.pane.text}
        </button>
        <button type="button" aria-label=${playPause.pane.label} ?disabled=${!tv.on} @click=${this.onPlayPause}>
          ${ico('pp', 24)}
        </button>
      </div>`;
  }

  // The switch asks for a state and does not flip itself: the box holds it, so the pane, the box and the switch read it at once.
  private readonly onPower = (e: CustomEvent<SwitchChangeDetail>): void => {
    e.stopPropagation();
    if (!this.tv) return;
    this.optimistic.hold(K.on(this.tv.id), e.detail.checked, TV_HOLD_MS);
    void this.commands.run(tvPower(this.tv, e.detail.checked));
  };

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
