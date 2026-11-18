// <hp-volume-control>: a speaker's volume, the slider with its − and + and the level, drawn once for the pod and for the phone's tile.
// Pattern: humble object (Meszaros) over the model's `VolumeView`; the slider holds the level on `input` and the − and + taps hold theirs
// in the panel's overlay store, and both go through `debounce(450)`, so a drag or a burst is one `volume_set` at the last level (ADR 0023).
// A continuous value is a slider (Apple's HIG, Sliders). A send still waiting is cancelled in `disconnectedCallback` and its level
// released, so a control that leaves the document sends nothing and never shows an unsent level when it comes back; connecting arms
// nothing (a tap does). Moved out of <hp-speaker-pod> so the tile reuses it (#424): a composed part, not a copy.
// Must not: read an entity or the store's state (its owner hands it `volume`), word a string, send a level per tap, or sit inside a button.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import {K, speakerVolume} from './commands.ts';
import type {SpeakerView, VolumeView} from './model.ts';
import controlOwn from './volume-control.element.css?inline';
import {debounce} from '../../core/timing.ts';
import {CommandRunner} from '../../ui/commands.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {stepBy} from '../../ui/steps.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How long the control waits for the slider or the taps to stop before it sends the level: the legacy `mpVol`'s 450 ms. */
const VOLUME_DEBOUNCE_MS = 450;

/** A tap on the − or +: five percent, as the legacy stepper; the level stays in 0 to 1 at two decimals. */
const VOLUME_STEP = 0.05;

export class VolumeControl extends LitElement {
  static override properties = {
    speaker: {attribute: false},
    volume: {attribute: false},
  };
  /** The speaker whose volume it is. */
  declare speaker: Pick<SpeakerView, 'id'> | undefined;
  /** The volume as the pane's model says it, held level included; null draws nothing. */
  declare volume: VolumeView | null | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in volume-control.element.css.
  static override styles = [common, unsafeCSS(forShadow(controlOwn))];

  // the catalog for the runner's toasts, and no entity: `ids` is empty, so no state change reaches the control
  private readonly storeController = new StoreController(this, {ids: () => []});
  private readonly optimistic = new OptimisticController(this);
  private readonly commands = new CommandRunner(this, {
    overlay: this.optimistic,
    t: () => this.storeController.store.t,
  });
  // one wait per control: the last level of a burst is the one sent, for the speaker it was tapped on (the legacy `volT` was one wait
  // for the panel, so a tap on another speaker dropped this one's level)
  private readonly sendVolume = debounce((speaker: Pick<SpeakerView, 'id'>, level: number) => {
    this.waiting = undefined;
    void this.commands.run(speakerVolume(speaker, level));
  }, VOLUME_DEBOUNCE_MS);
  /** The speaker whose level waits to be sent; its hold is released if the control leaves the document first. */
  private waiting: string | undefined;

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the control's rules test
    new AppearanceConsumer(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.sendVolume.cancel();
    if (this.waiting) this.optimistic.release(K.volume(this.waiting));
    this.waiting = undefined;
  }

  protected override render() {
    const volume = this.volume;
    if (!volume) return nothing;
    return html`<div class="vol">
      <button
        type="button"
        class="step"
        aria-label=${volume.downLabel}
        ?disabled=${volume.level <= 0}
        @click=${this.onDown}
      >
        −
      </button>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        aria-label=${volume.label}
        aria-valuetext=${volume.text}
        .value=${String(volume.percent)}
        style=${styleMap({'--v': `${volume.percent}%`})}
        @input=${this.onInput}
        @change=${this.onRelease}
      />
      <button
        type="button"
        class="step"
        aria-label=${volume.upLabel}
        ?disabled=${volume.level >= 1}
        @click=${this.onUp}
      >
        +
      </button>
      <b class="vv num">${volume.text}</b>
    </div>`;
  }

  // the level shows at once (the hold draws the pane again) and is sent once the finger or the taps stop
  private hold(level: number): void {
    if (!this.speaker) return;
    this.optimistic.hold(K.volume(this.speaker.id), level);
    this.waiting = this.speaker.id;
  }

  private step(level: number): void {
    if (!this.speaker) return;
    this.hold(level);
    this.sendVolume(this.speaker, level);
  }

  private readonly onDown = (): void => this.stepFrom(-VOLUME_STEP);
  private readonly onUp = (): void => this.stepFrom(VOLUME_STEP);
  private stepFrom(delta: number): void {
    if (this.volume) this.step(stepBy(this.volume.level, delta, 0, 1));
  }

  // a slider's level, in whole percents, as the level the player takes
  private levelOf(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value) / 100;
  }

  // `input` fires all along a drag: it only shows the level; the send waits for the finger to rest (`change`, and the debounce)
  private readonly onInput = (e: Event): void => this.hold(this.levelOf(e));

  private readonly onRelease = (e: Event): void => this.step(this.levelOf(e));
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-volume-control': VolumeControl;
  }
}

if (!customElements.get('hp-volume-control')) customElements.define('hp-volume-control', VolumeControl);
