// <hp-tv-power>: the television's power button, drawn once for the pane's box and the phone's tile.
// Pattern: humble object (Meszaros) over the model's `TvView`, and command (Gamma et al.): a tap holds the opposite of what shows in the
// panel's overlay store, then runs `tvPower` through `CommandRunner`, whose failure releases that hold alone (ADR 0023). A toggle button
// (`aria-pressed`), not a switch: Apple's Toggles page keeps switches for list rows. Shared so the box and the tile never differ (#424).
// Must not: read an entity or the store's state (its owner hands it `tv`), word a string, or show a state it has not held.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {K, TV_HOLD_MS, tvPower} from './commands.ts';
import type {TvView} from './model.ts';
import powerOwn from './tv-power.element.css?inline';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class TvPower extends LitElement {
  static override properties = {
    tv: {attribute: false},
  };
  /** The television as the pane's model says it, held values included. */
  declare tv: Pick<TvView, 'id' | 'wakeButton' | 'on' | 'available' | 'powerLabel'> | undefined;

  // The element's own rules, its `:host` and its button, are in tv-power.element.css.
  static override styles = [common, unsafeCSS(forShadow(powerOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the button
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the button's rules may test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const tv = this.tv;
    if (!tv) return nothing;
    return html`<button
      type="button"
      class=${classMap({power: true, on: tv.on})}
      aria-pressed=${tv.on ? 'true' : 'false'}
      aria-label=${tv.powerLabel}
      ?disabled=${!tv.available}
      @click=${this.onPower}
    >
      ${ico('lpow', 24)}
    </button>`;
  }

  // The button asks for the opposite of what shows and does not flip itself: it holds the value, so the pane, the box and the tile read it at once.
  private readonly onPower = (e: Event): void => {
    e.stopPropagation();
    if (!this.tv) return;
    const on = !this.tv.on;
    this.optimistic.hold(K.on(this.tv.id), on, TV_HOLD_MS);
    void this.commands.run(tvPower(this.tv, on));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-tv-power': TvPower;
  }
}

if (!customElements.get('hp-tv-power')) customElements.define('hp-tv-power', TvPower);
